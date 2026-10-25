import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from db import db
from models import InviteIn, JoinIn, MemberIn, PermissionIn, WorkspaceIn
from router import api_router
from security import CurrentUser, audit, require_perm
from seeds import seed_categories
from utils import new_id, now_utc

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Workspaces
# --------------------------------------------------------------------------
@api_router.get("/workspaces")
async def list_workspaces(user: CurrentUser):
    cur = db.workspaces.find({"members.user_id": user["user_id"], "deleted_at": None}, {"_id": 0})
    items = await cur.to_list(100)
    for w in items:
        if w["type"] == "shared" and not w.get("invite_code"):
            code = uuid.uuid4().hex[:8].upper()
            await db.workspaces.update_one({"id": w["id"]}, {"$set": {"invite_code": code}})
            w["invite_code"] = code
    items.sort(key=lambda w: (w["type"] != "personal", w["created_at"]))
    return items


@api_router.post("/workspaces")
async def create_workspace(body: WorkspaceIn, user: CurrentUser):
    ws_id = new_id("ws")
    doc = {
        "id": ws_id, "name": body.name, "type": "shared", "owner_id": user["user_id"],
        "base_currency": body.base_currency,
        "invite_code": uuid.uuid4().hex[:8].upper(),
        "members": [{"member_id": new_id("mem"), "user_id": user["user_id"], "name": user.get("name", "You"), "role": "owner", "permission": "full"}],
        "created_at": now_utc().isoformat(), "deleted_at": None,
    }
    await db.workspaces.insert_one(dict(doc))
    await seed_categories(ws_id)
    await audit(doc, user, "create", "workspace", f"Created workspace {body.name}")
    return doc


@api_router.post("/workspaces/{workspace_id}/members")
async def add_member(workspace_id: str, body: MemberIn, user: CurrentUser):
    ws = await require_perm(workspace_id, user, "owner")
    if ws["type"] != "shared":
        raise HTTPException(status_code=400, detail="Cannot add members to personal workspace")
    member = {"member_id": new_id("mem"), "user_id": None, "name": body.name, "role": "member", "email": body.email}
    await db.workspaces.update_one({"id": workspace_id}, {"$push": {"members": member}})
    await audit(ws, user, "add_member", "member", f"Added member {body.name}")
    return await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})


@api_router.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: str, user: CurrentUser):
    ws = await require_perm(workspace_id, user, "owner")
    if ws["type"] == "personal":
        raise HTTPException(status_code=400, detail="Cannot delete personal workspace")
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    await audit(ws, user, "delete", "workspace", f"Deleted household {ws['name']}")
    return {"ok": True}


# --------------------------------------------------------------------------
# Invitations, member management, roles
# --------------------------------------------------------------------------
INVITE_TTL_DAYS = 7


def invite_status(inv: dict) -> str:
    if inv["status"] != "pending":
        return inv["status"]
    created = datetime.fromisoformat(inv["created_at"])
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if created < now_utc() - timedelta(days=INVITE_TTL_DAYS):
        return "expired"
    return "pending"


def public_invite(inv: dict) -> dict:
    return {**inv, "status": invite_status(inv), "token": None}


@api_router.post("/workspaces/{workspace_id}/invites")
async def create_invite(workspace_id: str, body: InviteIn, request: Request, user: CurrentUser):
    from emailer import send_email, invite_email_html
    ws = await require_perm(workspace_id, user, "owner")
    if ws["type"] != "shared":
        raise HTTPException(status_code=400, detail="Invites are for shared households")
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    existing_member = next((m for m in ws.get("members", []) if (m.get("email") or "").lower() == email), None)
    if existing_member:
        raise HTTPException(status_code=400, detail="Already a member")
    pending = await db.invitations.count_documents({"workspace_id": workspace_id, "status": "pending"})
    if pending >= 20:
        raise HTTPException(status_code=429, detail="Too many pending invitations")
    await db.invitations.update_many(
        {"workspace_id": workspace_id, "email": email, "status": "pending"},
        {"$set": {"status": "revoked"}})
    inv = {
        "id": new_id("inv"), "workspace_id": workspace_id, "email": email,
        "token": uuid.uuid4().hex, "status": "pending",
        "invited_by": user["user_id"], "invited_by_name": user.get("name", "Someone"),
        "created_at": now_utc().isoformat(), "accepted_at": None, "accepted_by": None,
    }
    await db.invitations.insert_one(dict(inv))
    base = (request.headers.get("origin")
            or f"{request.headers.get('x-forwarded-proto', 'https')}://{request.headers.get('host', '')}").rstrip("/")
    accept_url = f"{base}/accept-invite?token={inv['token']}"
    email_sent = True
    try:
        await send_email(
            to=email,
            subject=f"{user.get('name', 'Someone')} invited you to {ws['name']} on FinPlanner",
            html=invite_email_html(inviter_name=user.get("name", "Someone"), household_name=ws["name"], accept_url=accept_url),
        )
    except Exception:
        email_sent = False
        logger.info(f"Invite email not delivered to {email}; invite still usable via code")
    await audit(ws, user, "invite", "member", f"Invited {email}")
    return {**public_invite(inv), "email_sent": email_sent}


@api_router.get("/workspaces/{workspace_id}/invites")
async def list_invites(workspace_id: str, user: CurrentUser):
    await require_perm(workspace_id, user, "owner")
    invs = await db.invitations.find({"workspace_id": workspace_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [public_invite(i) for i in invs]


@api_router.post("/workspaces/{workspace_id}/invites/{invite_id}/resend")
async def resend_invite(workspace_id: str, invite_id: str, request: Request, user: CurrentUser):
    from emailer import send_email, invite_email_html
    ws = await require_perm(workspace_id, user, "owner")
    inv = await db.invitations.find_one({"id": invite_id, "workspace_id": workspace_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invite_status(inv) != "pending":
        raise HTTPException(status_code=400, detail="Invitation is not pending")
    base = (request.headers.get("origin")
            or f"{request.headers.get('x-forwarded-proto', 'https')}://{request.headers.get('host', '')}").rstrip("/")
    email_sent = True
    try:
        await send_email(
            to=inv["email"],
            subject=f"Reminder: join {ws['name']} on FinPlanner",
            html=invite_email_html(inviter_name=inv["invited_by_name"], household_name=ws["name"], accept_url=f"{base}/accept-invite?token={inv['token']}"),
        )
    except Exception:
        email_sent = False
        logger.info(f"Invite reminder not delivered to {inv['email']}")
    await audit(ws, user, "resend_invite", "member", f"Resent invite to {inv['email']}")
    return {"ok": True, "email_sent": email_sent}


@api_router.delete("/workspaces/{workspace_id}/invites/{invite_id}")
async def revoke_invite(workspace_id: str, invite_id: str, user: CurrentUser):
    ws = await require_perm(workspace_id, user, "owner")
    inv = await db.invitations.find_one({"id": invite_id, "workspace_id": workspace_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    await db.invitations.update_one({"id": invite_id}, {"$set": {"status": "revoked"}})
    await audit(ws, user, "revoke_invite", "member", f"Revoked invite to {inv['email']}")
    return {"ok": True}


@api_router.get("/invites/{token}")
async def get_invite(token: str, user: CurrentUser):
    inv = await db.invitations.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    ws = await db.workspaces.find_one({"id": inv["workspace_id"], "deleted_at": None}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Household no longer exists")
    return {
        "household_name": ws["name"], "invited_by_name": inv["invited_by_name"],
        "email": inv["email"], "status": invite_status(inv),
        "matches_you": inv["email"].lower() == user["email"].lower(),
    }


@api_router.post("/invites/{token}/accept")
async def accept_invite(token: str, user: CurrentUser):
    inv = await db.invitations.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invite_status(inv) != "pending":
        raise HTTPException(status_code=400, detail=f"Invitation is {invite_status(inv)}")
    if inv["email"].lower() != user["email"].lower():
        raise HTTPException(status_code=403, detail="This invite was sent to a different email address")
    ws = await db.workspaces.find_one({"id": inv["workspace_id"], "deleted_at": None}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Household no longer exists")
    if user["user_id"] not in [m.get("user_id") for m in ws.get("members", []) if m.get("user_id")]:
        member = {"member_id": new_id("mem"), "user_id": user["user_id"], "name": user.get("name", "Member"), "role": "member", "permission": "full", "email": user["email"]}
        await db.workspaces.update_one({"id": ws["id"]}, {"$push": {"members": member}})
    await db.invitations.update_one({"id": inv["id"]}, {"$set": {"status": "accepted", "accepted_at": now_utc().isoformat(), "accepted_by": user["user_id"]}})
    await audit(ws, user, "accept_invite", "member", f"{user.get('name')} accepted the invitation")
    return await db.workspaces.find_one({"id": ws["id"]}, {"_id": 0})


@api_router.post("/workspaces/join")
async def join_by_code(body: JoinIn, user: CurrentUser):
    code = body.code.strip().upper()
    ws = await db.workspaces.find_one({"invite_code": code, "deleted_at": None}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if user["user_id"] in [m.get("user_id") for m in ws.get("members", []) if m.get("user_id")]:
        raise HTTPException(status_code=400, detail="You are already a member")
    member = {"member_id": new_id("mem"), "user_id": user["user_id"], "name": user.get("name", "Member"), "role": "member", "permission": "full", "email": user["email"]}
    await db.workspaces.update_one({"id": ws["id"]}, {"$push": {"members": member}})
    await audit(ws, user, "join", "member", f"{user.get('name')} joined via invite code")
    return await db.workspaces.find_one({"id": ws["id"]}, {"_id": 0})


@api_router.patch("/workspaces/{workspace_id}/members/{member_id}")
async def set_member_permission(workspace_id: str, member_id: str, body: PermissionIn, user: CurrentUser):
    ws = await require_perm(workspace_id, user, "owner")
    members = ws.get("members", [])
    target = next((m for m in members if m["member_id"] == member_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot change the owner's access")
    target["permission"] = body.permission
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"members": members}})
    await audit(ws, user, "role_change", "member", f"Set {target['name']}'s access to {body.permission}")
    return await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})


@api_router.delete("/workspaces/{workspace_id}/members/{member_id}")
async def remove_member(workspace_id: str, member_id: str, user: CurrentUser):
    ws = await require_perm(workspace_id, user, "owner")
    members = ws.get("members", [])
    target = next((m for m in members if m["member_id"] == member_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove the owner")
    members = [m for m in members if m["member_id"] != member_id]
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"members": members}})
    await audit(ws, user, "remove_member", "member", f"Removed member {target['name']}")
    return await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
