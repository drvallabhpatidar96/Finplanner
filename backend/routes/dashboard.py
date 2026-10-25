from datetime import timedelta

from db import db
from fx import convert
from router import api_router
from routes.accounts import account_balance
from security import CurrentUser, require_workspace
from utils import month_bounds, now_utc


@api_router.get("/dashboard")
async def dashboard(workspace_id: str, user: CurrentUser):
    ws = await require_workspace(workspace_id, user)
    base = ws["base_currency"]
    accs = await db.accounts.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    net = 0.0
    cc_dues = 0.0
    loan_outstanding = 0.0
    for a in accs:
        bal = await account_balance(a)
        a["balance"] = bal
        if a["type"] == "credit_card":
            cc_dues += convert(bal, a["currency"], base)
            net -= convert(bal, a["currency"], base)
        elif a["type"] == "loan":
            loan_outstanding += convert(bal, a["currency"], base)
            net -= convert(bal, a["currency"], base)
        else:
            # bank / cash / overdraft — balance can already be negative for overdraft
            net += convert(bal, a["currency"], base)

    start, _ = month_bounds()
    txns = await db.transactions.find({"workspace_id": workspace_id, "deleted_at": None, "date": {"$gte": start}}, {"_id": 0}).to_list(10000)
    cats = await db.categories.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    cat_map = {c["id"]: c for c in cats}
    spend_by_cat = {}
    month_income = 0.0
    month_expense = 0.0
    for t in txns:
        ba = convert(t["amount"], t["currency"], base)
        if t["type"] == "expense" and not t.get("is_refund"):
            month_expense += ba
            cid = t.get("category_id") or "uncat"
            name = cat_map.get(cid, {}).get("name", "Uncategorized")
            color = cat_map.get(cid, {}).get("color", "#757575")
            if cid not in spend_by_cat:
                spend_by_cat[cid] = {"category_id": cid, "name": name, "color": color, "amount": 0.0}
            spend_by_cat[cid]["amount"] += ba
        elif t["type"] == "income":
            month_income += ba
    category_spend = sorted(spend_by_cat.values(), key=lambda x: -x["amount"])
    for cs in category_spend:
        cs["amount"] = round(cs["amount"], 2)

    upcoming = []
    recs = await db.recurring.find({"workspace_id": workspace_id, "deleted_at": None, "active": True}, {"_id": 0}).to_list(200)
    for r in recs:
        upcoming.append({"type": "recurring", "label": r.get("note") or "Recurring",
                         "amount": convert(r["amount"], r["currency"], base), "date": r["next_date"], "kind": r["type"]})
    for c in [a for a in accs if a["type"] == "credit_card"]:
        out = convert(c["balance"], c["currency"], base)
        if out > 0:
            due_day = c.get("due_day") or 18
            today = now_utc().date()
            try:
                dd = today.replace(day=min(due_day, 28))
                if dd < today:
                    dd = (today.replace(day=28) + timedelta(days=7)).replace(day=min(due_day, 28))
            except Exception:
                dd = today
            upcoming.append({"type": "card_due", "label": f"{c['name']} due", "amount": round(out, 2), "date": dd.isoformat(), "kind": "expense"})
    upcoming.sort(key=lambda x: x["date"])

    shared = None
    if ws["type"] == "shared":
        members = ws.get("members", [])
        paid = {m["member_id"]: 0.0 for m in members}
        allocated = {m["member_id"]: 0.0 for m in members}
        total = 0.0
        all_txns = await db.transactions.find({"workspace_id": workspace_id, "type": "expense", "deleted_at": None}, {"_id": 0}).to_list(10000)
        for t in all_txns:
            if t.get("is_refund"):
                continue
            ba = convert(t["amount"], t["currency"], base)
            total += ba
            if t.get("payer_member_id") in paid:
                paid[t["payer_member_id"]] += ba
            for sp in t.get("splits", []):
                if sp["member_id"] in allocated:
                    allocated[sp["member_id"]] += convert(sp["share_amount"], t["currency"], base)
        shared = {
            "total_spending": round(total, 2),
            "members": [{"member_id": m["member_id"], "name": m["name"],
                         "paid": round(paid[m["member_id"]], 2),
                         "allocated": round(allocated[m["member_id"]], 2)} for m in members],
        }

    return {
        "base_currency": base, "net_worth": round(net, 2),
        "credit_card_dues": round(cc_dues, 2), "loan_outstanding": round(loan_outstanding, 2),
        "month_income": round(month_income, 2), "month_expense": round(month_expense, 2),
        "accounts": accs, "category_spend": category_spend[:8], "upcoming": upcoming[:10], "shared": shared,
    }
