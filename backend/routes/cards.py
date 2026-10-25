from datetime import datetime, timedelta

from fastapi import HTTPException

from db import db
from fx import convert
from models import CardPaymentIn
from router import api_router
from routes.accounts import account_balance
from security import CurrentUser, audit, require_perm, require_workspace
from utils import new_id, now_utc


@api_router.get("/credit-cards")
async def credit_cards(workspace_id: str, user: CurrentUser):
    await require_workspace(workspace_id, user)
    cards = await db.accounts.find({"workspace_id": workspace_id, "type": "credit_card", "deleted_at": None}, {"_id": 0}).to_list(100)
    today = now_utc().date()
    result = []
    for c in cards:
        outstanding = await account_balance(c)
        stmt_day = c.get("statement_day") or 1
        due_day = c.get("due_day") or 18
        try:
            if today.day >= stmt_day:
                stmt_date = today.replace(day=min(stmt_day, 28))
            else:
                prev = (today.replace(day=1) - timedelta(days=1))
                stmt_date = prev.replace(day=min(stmt_day, 28))
        except Exception:
            stmt_date = today
        txns = await db.transactions.find({"account_id": c["id"], "type": "expense", "deleted_at": None}, {"_id": 0}).to_list(10000)
        statement_balance = 0.0
        unbilled = 0.0
        for t in txns:
            amt = convert(t["amount"], t["currency"], c["currency"])
            amt = -amt if t.get("is_refund") else amt
            try:
                td = datetime.fromisoformat(t["date"]).date()
            except Exception:
                td = today
            if td <= stmt_date:
                statement_balance += amt
            else:
                unbilled += amt
        payments = await db.transactions.find({"to_account_id": c["id"], "type": "transfer", "deleted_at": None}, {"_id": 0}).to_list(10000)
        paid = sum(convert(p["amount"], p["currency"], c["currency"]) for p in payments)
        statement_balance = max(round(statement_balance - paid, 2), 0)
        min_due = round(max(statement_balance * 0.05, min(statement_balance, 100)), 2) if statement_balance > 0 else 0
        revolving_estimate = round(statement_balance * 0.035, 2) if statement_balance > 0 else 0
        try:
            due_date = stmt_date.replace(day=min(due_day, 28))
            if due_date <= stmt_date:
                due_date = (stmt_date.replace(day=28) + timedelta(days=7)).replace(day=min(due_day, 28))
        except Exception:
            due_date = today
        result.append({
            **c, "outstanding": outstanding, "statement_balance": statement_balance,
            "unbilled": round(unbilled, 2), "minimum_due": min_due,
            "revolving_estimate": revolving_estimate, "due_date": due_date.isoformat(),
            "statement_date": stmt_date.isoformat(),
            "available_credit": round((c.get("credit_limit") or 0) - outstanding, 2),
        })
    return result


@api_router.post("/credit-cards/payment")
async def card_payment(body: CardPaymentIn, user: CurrentUser):
    ws = await require_perm(body.workspace_id, user, "edit")
    card = await db.accounts.find_one({"id": body.account_id, "type": "credit_card", "deleted_at": None}, {"_id": 0})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    doc = {
        "id": new_id("txn"), "workspace_id": body.workspace_id, "type": "transfer",
        "account_id": body.from_account_id, "to_account_id": body.account_id,
        "category_id": None, "amount": body.amount, "currency": card["currency"],
        "base_amount": convert(body.amount, card["currency"], ws["base_currency"]),
        "date": body.date, "note": "Credit card payment", "payer_member_id": None,
        "splits": [], "is_refund": False, "created_by": user["user_id"],
        "created_by_name": user.get("name"), "created_at": now_utc().isoformat(), "deleted_at": None,
    }
    await db.transactions.insert_one(doc)
    await audit(ws, user, "payment", "credit_card", f"Paid {card['currency']} {body.amount} to {card['name']}")
    return {"ok": True}
