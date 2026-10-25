from fastapi import HTTPException

from db import db
from fx import convert
from models import CsvImportIn, TransactionIn
from router import api_router
from security import CurrentUser, audit, require_perm, require_workspace
from utils import new_id, now_utc


@api_router.get("/transactions")
async def list_transactions(workspace_id: str, user: CurrentUser, limit: int = 200):
    ws = await require_workspace(workspace_id, user)
    txns = await db.transactions.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}) \
        .sort("date", -1).to_list(limit)
    for t in txns:
        t["base_amount"] = convert(t["amount"], t["currency"], ws["base_currency"])
    return txns


@api_router.post("/transactions")
async def create_transaction(body: TransactionIn, user: CurrentUser):
    ws = await require_perm(body.workspace_id, user, "edit")
    doc = {
        "id": new_id("txn"), **body.dict(),
        "splits": [s.dict() for s in body.splits],
        "base_amount": convert(body.amount, body.currency, ws["base_currency"]),
        "created_by": user["user_id"], "created_by_name": user.get("name"),
        "created_at": now_utc().isoformat(), "deleted_at": None,
    }
    await db.transactions.insert_one(dict(doc))
    await audit(ws, user, "create", "transaction", f"{body.type} {body.currency} {body.amount}")
    return doc


@api_router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str, user: CurrentUser):
    t = await db.transactions.find_one({"id": txn_id, "deleted_at": None}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    ws = await require_perm(t["workspace_id"], user, "delete")
    await db.transactions.update_one({"id": txn_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    await audit(ws, user, "delete", "transaction", f"Deleted {t['type']} {t['amount']}")
    return {"ok": True}


@api_router.put("/transactions/{txn_id}")
async def update_transaction(txn_id: str, body: TransactionIn, user: CurrentUser):
    t = await db.transactions.find_one({"id": txn_id, "deleted_at": None}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    ws = await require_perm(body.workspace_id, user, "edit")
    update = {
        **body.dict(), "splits": [s.dict() for s in body.splits],
        "base_amount": convert(body.amount, body.currency, ws["base_currency"]),
    }
    await db.transactions.update_one({"id": txn_id}, {"$set": update})
    await audit(ws, user, "update", "transaction", f"Edited {body.type} {body.currency} {body.amount}")
    return await db.transactions.find_one({"id": txn_id}, {"_id": 0})


@api_router.get("/transactions/{txn_id}")
async def get_transaction(txn_id: str, user: CurrentUser):
    t = await db.transactions.find_one({"id": txn_id, "deleted_at": None}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    await require_perm(t["workspace_id"], user, "delete")
    return t


@api_router.post("/transactions/import")
async def import_csv(body: CsvImportIn, user: CurrentUser):
    ws = await require_perm(body.workspace_id, user, "edit")
    acc = await db.accounts.find_one({"id": body.account_id, "deleted_at": None}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    created = 0
    for row in body.rows:
        raw_amt = str(row.get("amount", "0")).replace(",", "").strip()
        try:
            amount = abs(float(raw_amt))
        except Exception:
            continue
        if amount <= 0:
            continue
        ttype = (row.get("type") or "").strip().lower()
        if ttype not in ("income", "expense"):
            ttype = "income" if raw_amt.startswith("-") is False and row.get("type") == "income" else "expense"
        doc = {
            "id": new_id("txn"), "workspace_id": body.workspace_id, "type": ttype,
            "account_id": body.account_id, "to_account_id": None, "category_id": None,
            "amount": amount, "currency": acc["currency"],
            "base_amount": convert(amount, acc["currency"], ws["base_currency"]),
            "date": (row.get("date") or now_utc().date().isoformat()),
            "note": row.get("note") or row.get("description") or "Imported",
            "payer_member_id": None, "splits": [], "is_refund": False,
            "created_by": user["user_id"], "created_by_name": user.get("name"),
            "created_at": now_utc().isoformat(), "deleted_at": None,
        }
        await db.transactions.insert_one(doc)
        created += 1
    await audit(ws, user, "import", "transaction", f"Imported {created} transactions")
    return {"imported": created}
