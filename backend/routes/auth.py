import asyncio
import logging
import os
from datetime import timedelta
from typing import Optional

import httpx
from fastapi import Header, HTTPException

from db import db
from models import AppleAuthIn, CountryIn, SessionIn
from router import api_router
from security import CurrentUser
from seeds import seed_categories
from utils import new_id, now_utc

logger = logging.getLogger(__name__)

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


@api_router.post("/auth/session")
async def create_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing and not existing.get("deleted_at"):
        # Active returning user — refresh profile fields
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": data.get("name"), "picture": data.get("picture"),
        }})
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    elif existing and existing.get("deleted_at"):
        # User previously deleted their account — reactivate with a clean slate
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": data.get("name"), "picture": data.get("picture"),
            "deleted_at": None, "premium": False,
        }})
        # Create a brand-new personal workspace (old data was hard-deleted)
        ws_id = new_id("ws")
        await db.workspaces.insert_one({
            "id": ws_id, "name": "Personal", "type": "personal", "owner_id": user_id,
            "base_currency": existing.get("base_currency", "INR"),
            "members": [{"member_id": new_id("mem"), "user_id": user_id,
                         "name": data.get("name", "You"), "role": "owner"}],
            "created_at": now_utc().isoformat(), "deleted_at": None,
        })
        await seed_categories(ws_id)
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        # Brand-new user
        user_id = new_id("user")
        user = {
            "user_id": user_id, "email": email, "name": data.get("name", "User"),
            "picture": data.get("picture"), "country": None, "base_currency": "INR",
            "premium": False, "created_at": now_utc().isoformat(), "deleted_at": None,
        }
        await db.users.insert_one(dict(user))
        ws_id = new_id("ws")
        await db.workspaces.insert_one({
            "id": ws_id, "name": "Personal", "type": "personal", "owner_id": user_id,
            "base_currency": "INR",
            "members": [{"member_id": new_id("mem"), "user_id": user_id, "name": data.get("name", "You"), "role": "owner"}],
            "created_at": now_utc().isoformat(), "deleted_at": None,
        })
        await seed_categories(ws_id)

    token = data["session_token"]
    await db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "created_at": now_utc(), "expires_at": now_utc() + timedelta(days=7),
    })
    user.pop("_id", None)
    return {"session_token": token, "user": user}


# --------------------------------------------------------------------------
# Sign in with Apple
# --------------------------------------------------------------------------
APPLE_AUDIENCES = [a.strip() for a in os.environ.get("APPLE_AUDIENCES", "").split(",") if a.strip()]
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


async def verify_apple_token(identity_token: str) -> dict:
    import jwt
    from jwt import PyJWKClient

    def _verify():
        jwks_client = PyJWKClient(APPLE_JWKS_URL)
        signing_key = jwks_client.get_signing_key_from_jwt(identity_token)
        return jwt.decode(
            identity_token, signing_key.key, algorithms=["RS256"],
            audience=APPLE_AUDIENCES, issuer="https://appleid.apple.com",
        )

    return await asyncio.to_thread(_verify)


@api_router.post("/auth/apple")
async def apple_auth(body: AppleAuthIn):
    try:
        claims = await verify_apple_token(body.identity_token)
    except Exception as e:
        logger.info(f"Apple identity token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")
    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")

    # Name/email are returned by Apple only on the FIRST sign-in — persist immediately.
    email = body.email or claims.get("email")
    name = body.name or (email.split("@")[0] if email else "Apple User")

    user = await db.users.find_one({"apple_sub": apple_sub, "deleted_at": None}, {"_id": 0})
    if not user and email:
        # Link to an existing account (e.g. previously signed in with Google)
        existing = await db.users.find_one({"email": email, "deleted_at": None})
        if existing:
            await db.users.update_one({"user_id": existing["user_id"]}, {"$set": {"apple_sub": apple_sub}})
            user = await db.users.find_one({"user_id": existing["user_id"]}, {"_id": 0})
    if user:
        update = {}
        if body.name and not user.get("name"):
            update["name"] = body.name
        if email and not user.get("email"):
            update["email"] = email
        if update:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
            user.update(update)
    else:
        user_id = new_id("user")
        user = {
            "user_id": user_id, "apple_sub": apple_sub,
            "email": email or f"{apple_sub}@privaterelay.apple.local",
            "name": name, "picture": None, "country": None, "base_currency": "INR",
            "premium": False, "created_at": now_utc().isoformat(), "deleted_at": None,
        }
        await db.users.insert_one(dict(user))
        ws_id = new_id("ws")
        await db.workspaces.insert_one({
            "id": ws_id, "name": "Personal", "type": "personal", "owner_id": user_id,
            "base_currency": "INR",
            "members": [{"member_id": new_id("mem"), "user_id": user_id, "name": name or "You", "role": "owner"}],
            "created_at": now_utc().isoformat(), "deleted_at": None,
        })
        await seed_categories(ws_id)

    token = new_id("sess")
    await db.user_sessions.insert_one({
        "session_token": token, "user_id": user["user_id"],
        "created_at": now_utc(), "expires_at": now_utc() + timedelta(days=7),
    })
    user.pop("_id", None)
    return {"session_token": token, "user": user}


@api_router.get("/auth/me")
async def me(user: CurrentUser):
    return user


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authorization.split(" ", 1)[1]})
    return {"ok": True}


@api_router.put("/users/country")
async def set_country(body: CountryIn, user: CurrentUser):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {
        "country": body.country, "base_currency": body.base_currency,
    }})
    await db.workspaces.update_one(
        {"owner_id": user["user_id"], "type": "personal"},
        {"$set": {"base_currency": body.base_currency}})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})


@api_router.post("/users/premium")
async def set_premium(user: CurrentUser):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"premium": True}})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})


@api_router.delete("/users/me")
async def delete_account(user: CurrentUser):
    uid = user["user_id"]

    # 1. Gather all workspaces owned by this user
    owned_ws_cursor = db.workspaces.find({"owner_id": uid}, {"id": 1, "_id": 0})
    owned_ws_ids = [ws["id"] for ws in await owned_ws_cursor.to_list(500)]

    # 2. Hard-delete every piece of data inside those workspaces
    if owned_ws_ids:
        for coll in ("transactions", "accounts", "budgets", "categories",
                     "fixed_deposits", "stocks", "recurring", "audit_logs", "invitations"):
            await db[coll].delete_many({"workspace_id": {"$in": owned_ws_ids}})
        await db.workspaces.delete_many({"id": {"$in": owned_ws_ids}})

    # 3. Remove user from shared workspaces they joined (not their own)
    await db.workspaces.update_many(
        {"owner_id": {"$ne": uid}},
        {"$pull": {"members": {"user_id": uid}}},
    )

    # 4. Clean up sessions & invitations sent by this user
    await db.user_sessions.delete_many({"user_id": uid})
    await db.invitations.delete_many({"invited_by": uid})

    # 5. Soft-delete the user record so re-signup produces a clean account
    await db.users.update_one({"user_id": uid}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}
