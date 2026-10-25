"""Seed a deterministic test user + session for automated testing.
Safe to run multiple times (idempotent upserts)."""
import asyncio
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import uuid

load_dotenv(Path(__file__).parent / ".env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

USER_ID = "user_test_fin001"
TOKEN = "test_token_finplanner_e2e"
WS_ID = "ws_test_fin_personal"

DEFAULTS = [
    ("Food & Dining", "expense", "ForkKnife", "#E55934"),
    ("Groceries", "expense", "ShoppingCart", "#66BB6A"),
    ("Transport", "expense", "Car", "#FFA726"),
    ("Salary", "income", "Money", "#66BB6A"),
]

async def main():
    now = datetime.now(timezone.utc)
    await db.users.update_one({"user_id": USER_ID}, {"$set": {
        "user_id": USER_ID, "email": "tester@finplanner.app", "name": "Test User",
        "picture": None, "country": "IN", "base_currency": "INR", "premium": True,
        "created_at": now.isoformat(), "deleted_at": None,
    }}, upsert=True)

    await db.workspaces.update_one({"id": WS_ID}, {"$set": {
        "id": WS_ID, "name": "Personal", "type": "personal", "owner_id": USER_ID,
        "base_currency": "INR",
        "members": [{"member_id": "mem_test_self", "user_id": USER_ID, "name": "Test User", "role": "owner"}],
        "created_at": now.isoformat(), "deleted_at": None,
    }}, upsert=True)

    if await db.categories.count_documents({"workspace_id": WS_ID, "deleted_at": None}) == 0:
        for name, kind, icon, color in DEFAULTS:
            await db.categories.insert_one({
                "id": f"cat_{uuid.uuid4().hex[:12]}", "workspace_id": WS_ID, "name": name,
                "kind": kind, "parent_id": None, "icon": icon, "color": color,
                "created_at": now.isoformat(), "deleted_at": None,
            })

    await db.user_sessions.update_one({"session_token": TOKEN}, {"$set": {
        "session_token": TOKEN, "user_id": USER_ID,
        "created_at": now, "expires_at": now + timedelta(days=365),
    }}, upsert=True)

    # Second user for invite/join/permission tests
    await db.users.update_one({"user_id": "user_test_fin002"}, {"$set": {
        "user_id": "user_test_fin002", "email": "member@finplanner.app", "name": "Test Member",
        "picture": None, "country": "IN", "base_currency": "INR", "premium": False,
        "created_at": now.isoformat(), "deleted_at": None,
    }}, upsert=True)
    await db.user_sessions.update_one({"session_token": "test_token_finplanner_member"}, {"$set": {
        "session_token": "test_token_finplanner_member", "user_id": "user_test_fin002",
        "created_at": now, "expires_at": now + timedelta(days=365),
    }}, upsert=True)

    print("Seeded test user. Bearer token:", TOKEN, "workspace:", WS_ID)
    print("Second member token: test_token_finplanner_member")

asyncio.run(main())
