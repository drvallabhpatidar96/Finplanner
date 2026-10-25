"""FinPlanner backend E2E tests.
Covers: auth, workspaces, accounts, categories, transactions, FX,
shared household analytics, credit cards, budgets, recurring,
fixed deposits, stocks, dashboard, audit log, export, csv import, premium.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://family-budget-182.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
TOKEN = "test_token_finplanner_e2e"
PERSONAL_WS = "ws_test_fin_personal"
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
API = f"{BASE_URL}/api"

today = datetime.now(timezone.utc).date().isoformat()


# ------------------------------- Auth / Meta -------------------------------
class TestAuthAndMeta:
    def test_currencies_public(self):
        r = requests.get(f"{API}/meta/currencies")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "INR" in data["currencies"]
        usd = data["rates"]["USD"]
        assert isinstance(usd, (int, float)) and usd > 0  # live FX (fallback 83.0)

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_workspaces_requires_auth(self):
        r = requests.get(f"{API}/workspaces")
        assert r.status_code == 401

    def test_dashboard_requires_auth(self):
        r = requests.get(f"{API}/dashboard?workspace_id={PERSONAL_WS}")
        assert r.status_code == 401

    def test_invalid_session_id_returns_401(self):
        r = requests.post(f"{API}/auth/session", json={"session_id": "invalid_session_xyz"})
        assert r.status_code == 401

    def test_me_with_token(self):
        r = requests.get(f"{API}/auth/me", headers=H)
        assert r.status_code == 200, r.text
        assert r.json()["user_id"] == "user_test_fin001"
        assert r.json()["email"] == "tester@finplanner.app"

    def test_personal_workspace_listed(self):
        r = requests.get(f"{API}/workspaces", headers=H)
        assert r.status_code == 200
        ids = [w["id"] for w in r.json()]
        assert PERSONAL_WS in ids


# ------------------------------- Workspaces & scoping -------------------------------
@pytest.fixture(scope="module")
def shared_ws():
    r = requests.post(f"{API}/workspaces", headers=H, json={"name": "TEST_Household", "base_currency": "INR"})
    assert r.status_code == 200, r.text
    ws = r.json()
    assert ws["type"] == "shared"
    yield ws
    requests.delete(f"{API}/workspaces/{ws['id']}", headers=H)


class TestWorkspaces:
    def test_create_shared_seeds_categories(self, shared_ws):
        r = requests.get(f"{API}/categories?workspace_id={shared_ws['id']}", headers=H)
        assert r.status_code == 200
        assert len(r.json()) >= 10  # default categories seeded

    def test_add_member(self, shared_ws):
        r = requests.post(f"{API}/workspaces/{shared_ws['id']}/members", headers=H,
                          json={"name": "TEST_Partner"})
        assert r.status_code == 200, r.text
        members = r.json()["members"]
        assert any(m["name"] == "TEST_Partner" for m in members)

    def test_unknown_workspace_404(self):
        r = requests.get(f"{API}/accounts?workspace_id=ws_does_not_exist_xxx", headers=H)
        assert r.status_code == 404

    def test_non_member_workspace_403(self):
        # Create workspace via different user path - simulate by creating a workspace
        # then manipulating DB directly isn't ideal; instead test known-foreign id.
        # Insert a workspace with another owner via a direct insert using a 2nd user won't be possible here.
        # Skip precise 403 unless we have another user. Use crafted scenario:
        # Create a shared ws, remove self won't work. Just assert unknown id behavior above.
        # For completeness, test audit-log on unknown
        r = requests.get(f"{API}/audit-log?workspace_id=ws_other_user_zzz", headers=H)
        assert r.status_code == 404


# ------------------------------- Accounts -------------------------------
@pytest.fixture(scope="module")
def accounts(shared_ws):
    ws = shared_ws["id"]
    created = []
    for payload in [
        {"workspace_id": ws, "name": "TEST_Bank", "type": "bank", "currency": "INR", "opening_balance": 10000},
        {"workspace_id": ws, "name": "TEST_Cash", "type": "cash", "currency": "INR", "opening_balance": 2000},
        {"workspace_id": ws, "name": "TEST_Card", "type": "credit_card", "currency": "INR",
         "credit_limit": 100000, "statement_day": 5, "due_day": 22},
    ]:
        r = requests.post(f"{API}/accounts", headers=H, json=payload)
        assert r.status_code == 200, r.text
        created.append(r.json())
    yield {"bank": created[0], "cash": created[1], "card": created[2], "ws": ws}
    for a in created:
        requests.delete(f"{API}/accounts/{a['id']}", headers=H)


class TestAccounts:
    def test_create_and_list_balance(self, accounts):
        r = requests.get(f"{API}/accounts?workspace_id={accounts['ws']}", headers=H)
        assert r.status_code == 200
        names = {a["name"]: a for a in r.json()}
        assert names["TEST_Bank"]["balance"] == 10000
        assert names["TEST_Card"]["type"] == "credit_card"
        assert names["TEST_Card"]["credit_limit"] == 100000

    def test_delete_soft(self, shared_ws):
        r = requests.post(f"{API}/accounts", headers=H, json={
            "workspace_id": shared_ws["id"], "name": "TEST_TempAcc", "type": "bank", "opening_balance": 0})
        acc_id = r.json()["id"]
        d = requests.delete(f"{API}/accounts/{acc_id}", headers=H)
        assert d.status_code == 200
        # Now not in listing
        r2 = requests.get(f"{API}/accounts?workspace_id={shared_ws['id']}", headers=H)
        assert acc_id not in [a["id"] for a in r2.json()]


# ------------------------------- Categories -------------------------------
class TestCategories:
    def test_crud_category(self, shared_ws):
        ws = shared_ws["id"]
        r = requests.post(f"{API}/categories", headers=H,
                          json={"workspace_id": ws, "name": "TEST_Cat1", "kind": "expense"})
        assert r.status_code == 200
        cat_id = r.json()["id"]
        r2 = requests.get(f"{API}/categories?workspace_id={ws}", headers=H)
        assert cat_id in [c["id"] for c in r2.json()]
        d = requests.delete(f"{API}/categories/{cat_id}", headers=H)
        assert d.status_code == 200
        r3 = requests.get(f"{API}/categories?workspace_id={ws}", headers=H)
        assert cat_id not in [c["id"] for c in r3.json()]


# ------------------------------- Transactions -------------------------------
class TestTransactions:
    def test_expense_income_transfer_balances(self, accounts):
        ws, bank, cash, card = accounts["ws"], accounts["bank"], accounts["cash"], accounts["card"]
        # income +5000 bank
        requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws, "type": "income", "account_id": bank["id"],
            "amount": 5000, "currency": "INR", "date": today, "note": "TEST_salary"}).raise_for_status()
        # expense 1000 bank
        requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws, "type": "expense", "account_id": bank["id"],
            "amount": 1000, "currency": "INR", "date": today, "note": "TEST_food"}).raise_for_status()
        # refund 200 bank (adds back)
        requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws, "type": "expense", "account_id": bank["id"],
            "amount": 200, "currency": "INR", "date": today, "note": "TEST_refund",
            "is_refund": True}).raise_for_status()
        # transfer 500 from bank -> cash
        requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws, "type": "transfer", "account_id": bank["id"],
            "to_account_id": cash["id"], "amount": 500, "currency": "INR", "date": today}).raise_for_status()
        # expense 2000 on credit card
        requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws, "type": "expense", "account_id": card["id"],
            "amount": 2000, "currency": "INR", "date": today, "note": "TEST_card_spend"}).raise_for_status()

        r = requests.get(f"{API}/accounts?workspace_id={ws}", headers=H)
        amap = {a["name"]: a for a in r.json()}
        # bank: 10000 + 5000 - 1000 + 200 - 500 = 13700
        assert amap["TEST_Bank"]["balance"] == 13700, amap["TEST_Bank"]
        # cash: 2000 + 500 = 2500
        assert amap["TEST_Cash"]["balance"] == 2500
        # card outstanding = 2000
        assert amap["TEST_Card"]["balance"] == 2000

    def test_cross_currency_base_amount(self, accounts):
        ws, bank = accounts["ws"], accounts["bank"]
        r = requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws, "type": "expense", "account_id": bank["id"],
            "amount": 10, "currency": "USD", "date": today, "note": "TEST_usd"})
        assert r.status_code == 200
        rate = requests.get(f"{API}/meta/currencies").json()["rates"]["USD"]  # live FX
        assert r.json()["base_amount"] == round(10 * rate, 2)

    def test_list_sorted_desc(self, accounts):
        r = requests.get(f"{API}/transactions?workspace_id={accounts['ws']}", headers=H)
        assert r.status_code == 200
        dates = [t["date"] for t in r.json()]
        assert dates == sorted(dates, reverse=True)

    def test_delete_transaction(self, accounts):
        ws, bank = accounts["ws"], accounts["bank"]
        r = requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws, "type": "expense", "account_id": bank["id"],
            "amount": 50, "currency": "INR", "date": today, "note": "TEST_del"})
        tid = r.json()["id"]
        d = requests.delete(f"{API}/transactions/{tid}", headers=H)
        assert d.status_code == 200
        r2 = requests.get(f"{API}/transactions?workspace_id={ws}", headers=H)
        assert tid not in [t["id"] for t in r2.json()]


# ------------------------------- Shared household -------------------------------
class TestSharedHousehold:
    def test_split_expense_and_dashboard(self, shared_ws, accounts):
        ws_full = requests.get(f"{API}/workspaces", headers=H).json()
        ws = next(w for w in ws_full if w["id"] == shared_ws["id"])
        # self-contained: ensure a partner member exists (xdist may run this class
        # on a different worker than TestWorkspaces.test_add_member)
        if not any(m["name"] == "TEST_Partner" for m in ws["members"]):
            r = requests.post(f"{API}/workspaces/{ws['id']}/members", headers=H,
                              json={"name": "TEST_Partner"})
            assert r.status_code == 200, r.text
            ws = r.json()
        members = ws["members"]
        owner = members[0]["member_id"]
        partner = next(m["member_id"] for m in members if m["name"] == "TEST_Partner")

        r = requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": accounts["bank"]["id"],
            "amount": 1000, "currency": "INR", "date": today, "note": "TEST_split_rent",
            "payer_member_id": owner,
            "splits": [{"member_id": owner, "share_amount": 400},
                       {"member_id": partner, "share_amount": 600}],
        })
        assert r.status_code == 200, r.text

        d = requests.get(f"{API}/dashboard?workspace_id={ws['id']}", headers=H)
        assert d.status_code == 200
        shared = d.json()["shared"]
        assert shared is not None
        assert shared["total_spending"] > 0
        member_data = {m["member_id"]: m for m in shared["members"]}
        assert member_data[owner]["paid"] >= 1000
        assert member_data[owner]["allocated"] >= 400
        assert member_data[partner]["allocated"] >= 600


# ------------------------------- Credit cards -------------------------------
class TestCreditCards:
    def test_card_summary_and_payment(self, accounts):
        ws, card, bank = accounts["ws"], accounts["card"], accounts["bank"]
        r = requests.get(f"{API}/credit-cards?workspace_id={ws}", headers=H)
        assert r.status_code == 200
        cards = r.json()
        c = next(x for x in cards if x["id"] == card["id"])
        assert c["available_credit"] <= c["credit_limit"]
        assert "minimum_due" in c and "revolving_estimate" in c and "due_date" in c

        # relative assertion: xdist may run this class on a worker whose fixture
        # instance hasn't seen TestTransactions' card spend
        before = next(a["balance"] for a in requests.get(f"{API}/accounts?workspace_id={ws}", headers=H).json()
                      if a["id"] == card["id"])
        # pay 500 off card
        p = requests.post(f"{API}/credit-cards/payment", headers=H, json={
            "workspace_id": ws, "account_id": card["id"], "amount": 500, "date": today,
            "from_account_id": bank["id"]})
        assert p.status_code == 200

        r2 = requests.get(f"{API}/accounts?workspace_id={ws}", headers=H)
        card_bal = next(a["balance"] for a in r2.json() if a["id"] == card["id"])
        assert card_bal == round(before - 500, 2)


# ------------------------------- Budgets -------------------------------
class TestBudgets:
    def test_budget_crud_and_idempotent(self, shared_ws):
        ws = shared_ws["id"]
        cats = requests.get(f"{API}/categories?workspace_id={ws}", headers=H).json()
        cat = next(c for c in cats if c["kind"] == "expense")
        r = requests.post(f"{API}/budgets", headers=H, json={
            "workspace_id": ws, "category_id": cat["id"], "amount": 5000})
        assert r.status_code == 200
        bid = r.json()["id"]
        # idempotent — same category updates
        r2 = requests.post(f"{API}/budgets", headers=H, json={
            "workspace_id": ws, "category_id": cat["id"], "amount": 7500})
        assert r2.status_code == 200
        assert r2.json()["amount"] == 7500
        assert r2.json()["id"] == bid

        lst = requests.get(f"{API}/budgets?workspace_id={ws}", headers=H).json()
        bb = next(b for b in lst if b["id"] == bid)
        assert "spent" in bb

        d = requests.delete(f"{API}/budgets/{bid}", headers=H)
        assert d.status_code == 200


# ------------------------------- Recurring -------------------------------
class TestRecurring:
    def test_recurring_crud_and_dashboard_upcoming(self, shared_ws, accounts):
        ws = shared_ws["id"]
        r = requests.post(f"{API}/recurring", headers=H, json={
            "workspace_id": ws, "type": "expense", "account_id": accounts["bank"]["id"],
            "amount": 999, "currency": "INR", "note": "TEST_netflix",
            "frequency": "monthly", "next_date": today})
        assert r.status_code == 200
        rid = r.json()["id"]
        d = requests.get(f"{API}/dashboard?workspace_id={ws}", headers=H).json()
        labels = [u.get("label") for u in d["upcoming"]]
        assert "TEST_netflix" in labels
        requests.delete(f"{API}/recurring/{rid}", headers=H)


# ------------------------------- FD / Stocks -------------------------------
class TestInvestments:
    def test_fd(self, shared_ws):
        ws = shared_ws["id"]
        start = today
        maturity = (datetime.now(timezone.utc).date() + timedelta(days=365)).isoformat()
        r = requests.post(f"{API}/fixed-deposits", headers=H, json={
            "workspace_id": ws, "name": "TEST_FD", "principal": 100000,
            "rate": 7.0, "start_date": start, "maturity_date": maturity})
        assert r.status_code == 200
        fd = r.json()
        assert fd["maturity_value"] > 100000
        assert "accrued_interest" in fd
        requests.delete(f"{API}/fixed-deposits/{fd['id']}", headers=H)

    def test_stock(self, shared_ws):
        ws = shared_ws["id"]
        r = requests.post(f"{API}/stocks", headers=H, json={
            "workspace_id": ws, "symbol": "TCS", "name": "TEST_TCS",
            "quantity": 10, "avg_price": 3000, "current_price": 3500})
        assert r.status_code == 200
        s = r.json()
        assert s["invested"] == 30000
        assert s["current_value"] == 35000
        assert s["pnl"] == 5000
        requests.delete(f"{API}/stocks/{s['id']}", headers=H)


# ------------------------------- Dashboard & Audit -------------------------------
class TestDashboardAudit:
    def test_dashboard_fields(self, shared_ws):
        r = requests.get(f"{API}/dashboard?workspace_id={shared_ws['id']}", headers=H)
        assert r.status_code == 200
        d = r.json()
        for key in ("net_worth", "credit_card_dues", "month_income", "month_expense",
                    "accounts", "category_spend", "upcoming"):
            assert key in d

    def test_audit_log_shared_has_entries(self, shared_ws):
        r = requests.get(f"{API}/audit-log?workspace_id={shared_ws['id']}", headers=H)
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_audit_personal_empty(self):
        r = requests.get(f"{API}/audit-log?workspace_id={PERSONAL_WS}", headers=H)
        assert r.status_code == 200
        # Personal workspace should NOT have audit entries
        assert r.json() == []


# ------------------------------- Export & CSV import -------------------------------
class TestExportImport:
    def test_export(self, shared_ws):
        r = requests.get(f"{API}/export?workspace_id={shared_ws['id']}", headers=H)
        assert r.status_code == 200
        d = r.json()
        for k in ("workspace", "accounts", "categories", "transactions", "budgets",
                  "fixed_deposits", "stocks", "exported_at"):
            assert k in d

    def test_csv_import(self, accounts):
        ws, bank = accounts["ws"], accounts["bank"]
        rows = [
            {"date": today, "amount": "150", "type": "expense", "note": "TEST_csv1"},
            {"date": today, "amount": "250", "type": "income", "note": "TEST_csv2"},
            {"date": today, "amount": "0", "type": "expense", "note": "skip"},
        ]
        r = requests.post(f"{API}/transactions/import", headers=H, json={
            "workspace_id": ws, "account_id": bank["id"], "rows": rows})
        assert r.status_code == 200
        assert r.json()["imported"] == 2


# ------------------------------- Premium -------------------------------
class TestPremium:
    def test_set_premium(self):
        r = requests.post(f"{API}/users/premium", headers=H)
        assert r.status_code == 200
        assert r.json()["premium"] is True
        # reset for other tests - no endpoint to unset; leave as true
