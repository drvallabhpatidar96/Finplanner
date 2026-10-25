from fastapi import HTTPException

from db import db
from fx import convert
from models import BudgetIn
from router import api_router
from security import CurrentUser, require_perm, require_workspace
from utils import month_bounds, new_id, now_utc


@api_router.get("/budgets")
async def list_budgets(workspace_id: str, user: CurrentUser):
    ws = await require_workspace(workspace_id, user)
    budgets = await db.budgets.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    start, _ = month_bounds()
    txns = await db.transactions.find({
        "workspace_id": workspace_id, "type": "expense", "deleted_at": None, "date": {"$gte": start},
    }, {"_id": 0}).to_list(10000)
    for b in budgets:
        spent = sum(convert(t["amount"], t["currency"], ws["base_currency"])
                    for t in txns if t.get("category_id") == b["category_id"] and not t.get("is_refund"))
        b["spent"] = round(spent, 2)
    return budgets


@api_router.post("/budgets")
async def create_budget(body: BudgetIn, user: CurrentUser):
    await require_perm(body.workspace_id, user, "edit")
    existing = await db.budgets.find_one({"workspace_id": body.workspace_id, "category_id": body.category_id, "deleted_at": None}, {"_id": 0})
    if existing:
        await db.budgets.update_one({"id": existing["id"]}, {"$set": {"amount": body.amount}})
        existing["amount"] = body.amount
        return existing
    doc = {"id": new_id("bud"), **body.dict(), "period": "monthly", "created_at": now_utc().isoformat(), "deleted_at": None}
    await db.budgets.insert_one(dict(doc))
    return doc


@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, user: CurrentUser):
    b = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    await require_perm(b["workspace_id"], user, "delete")
    await db.budgets.update_one({"id": budget_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}
