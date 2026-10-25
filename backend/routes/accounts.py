from fastapi import HTTPException

from db import db
from fx import convert
from models import AccountIn
from router import api_router
from security import CurrentUser, audit, require_perm, require_workspace
from utils import new_id, now_utc


async def account_balance(acc: dict) -> float:
    txns = await db.transactions.find({
        "$or": [{"account_id": acc["id"]}, {"to_account_id": acc["id"]}],
        "deleted_at": None,
    }, {"_id": 0}).to_list(10000)
    cur = acc["currency"]

    if acc["type"] == "credit_card":
        outstanding = 0.0
        for t in txns:
            amt = convert(t["amount"], t["currency"], cur)
            if t["account_id"] == acc["id"]:
                if t["type"] == "expense":
                    outstanding += -amt if t.get("is_refund") else amt
                elif t["type"] == "transfer":
                    outstanding -= amt
            if t.get("to_account_id") == acc["id"] and t["type"] == "transfer":
                outstanding -= amt
        return round(outstanding, 2)

    if acc["type"] == "loan":
        # outstanding = opening_balance (principal entered) - repayments transferred in
        outstanding = acc.get("opening_balance", 0.0)
        for t in txns:
            amt = convert(t["amount"], t["currency"], cur)
            # Any transfer INTO the loan account counts as a repayment
            if t.get("to_account_id") == acc["id"] and t["type"] == "transfer":
                outstanding -= amt
        return round(max(outstanding, 0.0), 2)

    # bank / cash / overdraft — same logic
    bal = acc.get("opening_balance", 0.0)
    for t in txns:
        amt = convert(t["amount"], t["currency"], cur)
        if t["account_id"] == acc["id"]:
            if t["type"] == "income":
                bal += amt
            elif t["type"] == "expense":
                bal += amt if t.get("is_refund") else -amt
            elif t["type"] == "transfer":
                bal -= amt
        if t.get("to_account_id") == acc["id"] and t["type"] == "transfer":
            bal += amt
    return round(bal, 2)


@api_router.get("/accounts")
async def list_accounts(workspace_id: str, user: CurrentUser):
    await require_workspace(workspace_id, user)
    accs = await db.accounts.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    for a in accs:
        a["balance"] = await account_balance(a)
    return accs


@api_router.post("/accounts")
async def create_account(body: AccountIn, user: CurrentUser):
    ws = await require_perm(body.workspace_id, user, "edit")
    doc = {"id": new_id("acc"), **body.dict(), "created_at": now_utc().isoformat(), "deleted_at": None}
    await db.accounts.insert_one(dict(doc))
    await audit(ws, user, "create", "account", f"Added {body.type} account {body.name}")
    doc["balance"] = await account_balance(doc)
    return doc


@api_router.delete("/accounts/{account_id}")
async def delete_account_item(account_id: str, user: CurrentUser):
    acc = await db.accounts.find_one({"id": account_id, "deleted_at": None}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    await require_perm(acc["workspace_id"], user, "delete")
    await db.accounts.update_one({"id": account_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}


@api_router.put("/accounts/{account_id}")
async def update_account(account_id: str, body: AccountIn, user: CurrentUser):
    acc = await db.accounts.find_one({"id": account_id, "deleted_at": None}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    ws = await require_perm(body.workspace_id, user, "edit")
    await db.accounts.update_one({"id": account_id}, {"$set": body.dict()})
    doc = await db.accounts.find_one({"id": account_id}, {"_id": 0})
    doc["balance"] = await account_balance(doc)
    await audit(ws, user, "update", "account", f"Edited account {body.name}")
    return doc
