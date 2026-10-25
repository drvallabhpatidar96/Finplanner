from datetime import timezone
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException

from db import db
from utils import new_id, now_utc


# --------------------------------------------------------------------------
# Auth helper
# --------------------------------------------------------------------------
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires = session["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"], "deleted_at": None}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


async def require_workspace(workspace_id: str, user: dict) -> dict:
    ws = await db.workspaces.find_one({"id": workspace_id, "deleted_at": None}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    member_ids = [m["user_id"] for m in ws.get("members", []) if m.get("user_id")]
    if user["user_id"] not in member_ids:
        raise HTTPException(status_code=403, detail="Not a workspace member")
    return ws


PERM_RANK = {"view": 0, "edit": 1, "full": 2}


def member_permission(ws: dict, user_id: str) -> str:
    for m in ws.get("members", []):
        if m.get("user_id") == user_id:
            if m.get("role") == "owner" or ws.get("owner_id") == user_id:
                return "full"
            return m.get("permission", "full")
    return "none"


async def require_perm(workspace_id: str, user: dict, level: str) -> dict:
    """level: 'view' (member), 'edit' (add/edit), 'delete' (add/edit/delete), 'owner'."""
    ws = await require_workspace(workspace_id, user)
    if level == "owner":
        if ws.get("owner_id") != user["user_id"]:
            raise HTTPException(status_code=403, detail="Only the owner can do this")
        return ws
    perm = member_permission(ws, user["user_id"])
    need = {"edit": 1, "delete": 2}.get(level, 0)
    if PERM_RANK.get(perm, 0) < need:
        raise HTTPException(status_code=403, detail="Insufficient permission for this household")
    return ws


async def audit(ws: dict, user: dict, action: str, entity: str, detail: str):
    if ws.get("type") != "shared":
        return
    await db.audit_logs.insert_one({
        "id": new_id("aud"), "workspace_id": ws["id"], "action": action,
        "entity": entity, "detail": detail, "user_id": user["user_id"],
        "user_name": user.get("name", "Member"), "created_at": now_utc().isoformat(),
    })
