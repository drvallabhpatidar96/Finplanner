from fastapi import HTTPException

from db import db
from models import RecurringIn
from router import api_router
from security import CurrentUser, require_perm, require_workspace
from utils import new_id, now_utc


@api_router.get("/recurring")
async def list_recurring(workspace_id: str, user: CurrentUser):
    await require_workspace(workspace_id, user)
    return await db.recurring.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)


@api_router.post("/recurring")
async def create_recurring(body: RecurringIn, user: CurrentUser):
    await require_perm(body.workspace_id, user, "edit")
    doc = {"id": new_id("rec"), **body.dict(), "active": True, "created_at": now_utc().isoformat(), "deleted_at": None}
    await db.recurring.insert_one(dict(doc))
    return doc


@api_router.put("/recurring/{rec_id}")
async def update_recurring(rec_id: str, body: RecurringIn, user: CurrentUser):
    r = await db.recurring.find_one({"id": rec_id, "deleted_at": None}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    await require_perm(body.workspace_id, user, "edit")
    await db.recurring.update_one({"id": rec_id}, {"$set": body.dict()})
    return await db.recurring.find_one({"id": rec_id}, {"_id": 0})


@api_router.delete("/recurring/{rec_id}")
async def delete_recurring(rec_id: str, user: CurrentUser):
    r = await db.recurring.find_one({"id": rec_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    await require_perm(r["workspace_id"], user, "delete")
    await db.recurring.update_one({"id": rec_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}
