from fastapi import HTTPException

from db import db
from models import CategoryIn
from router import api_router
from security import CurrentUser, require_perm, require_workspace
from utils import new_id, now_utc


@api_router.get("/categories")
async def list_categories(workspace_id: str, user: CurrentUser):
    await require_workspace(workspace_id, user)
    return await db.categories.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)


@api_router.post("/categories")
async def create_category(body: CategoryIn, user: CurrentUser):
    await require_perm(body.workspace_id, user, "edit")
    doc = {"id": new_id("cat"), **body.dict(), "created_at": now_utc().isoformat(), "deleted_at": None}
    await db.categories.insert_one(dict(doc))
    return doc


@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, user: CurrentUser):
    cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    await require_perm(cat["workspace_id"], user, "delete")
    await db.categories.update_one({"id": category_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}
