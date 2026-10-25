"""FinPlanner iteration-2 backend tests.
Covers: PUT edit endpoints (transactions/accounts/recurring/fixed-deposits/stocks),
GET /api/meta/currencies (rates + source + updated_at + fallback), and the premium
Bill Scan feature (JPEG receipt, PDF receipt, non-premium 403, no image persistence).
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

# Non-premium second user, created via direct Mongo insert in fixture
NP_TOKEN = "test_token_finplanner_nonpremium"
NP_USER = "user_test_nonprem001"


# ---------------------------------------------------------------------------
# Non-premium user fixture (direct Mongo insert via pymongo)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def nonpremium_headers():
    from pymongo import MongoClient
    mongo_url = None
    db_name = None
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith("MONGO_URL"):
                mongo_url = line.split("=", 1)[1].strip().strip('"')
            if line.startswith("DB_NAME"):
                db_name = line.split("=", 1)[1].strip().strip('"')
    mc = MongoClient(mongo_url)
    db = mc[db_name]
    # upsert a non-premium user + session
    db.users.update_one({"user_id": NP_USER}, {"$set": {
        "user_id": NP_USER, "email": "nonprem@finplanner.app", "name": "TEST_NonPremium",
        "picture": None, "country": "IN", "base_currency": "INR", "premium": False,
        "created_at": datetime.now(timezone.utc).isoformat(), "deleted_at": None,
    }}, upsert=True)
    db.user_sessions.update_one({"session_token": NP_TOKEN}, {"$set": {
        "session_token": NP_TOKEN, "user_id": NP_USER,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    }}, upsert=True)
    yield {"Authorization": f"Bearer {NP_TOKEN}", "Content-Type": "application/json"}
    db.user_sessions.delete_many({"session_token": NP_TOKEN})
    db.users.delete_many({"user_id": NP_USER})


# ---------------------------------------------------------------------------
# Shared fixture workspace (soft-deleted at teardown)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def ws():
    r = requests.post(f"{API}/workspaces", headers=H, json={"name": "TEST_EditWS", "base_currency": "INR"})
    assert r.status_code == 200, r.text
    w = r.json()
    yield w
    requests.delete(f"{API}/workspaces/{w['id']}", headers=H)


@pytest.fixture(scope="module")
def account(ws):
    r = requests.post(f"{API}/accounts", headers=H, json={
        "workspace_id": ws["id"], "name": "TEST_EditBank", "type": "bank",
        "currency": "INR", "opening_balance": 1000})
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------- PUT /transactions/{id} -------------------------------
class TestTransactionPut:
    def test_update_transaction_returns_updated(self, ws, account):
        r = requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": account["id"],
            "amount": 250, "currency": "INR", "date": today, "note": "TEST_before_edit"})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]

        u = requests.put(f"{API}/transactions/{tid}", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": account["id"],
            "amount": 300, "currency": "INR", "date": today, "note": "TEST_after_edit"})
        assert u.status_code == 200, u.text
        doc = u.json()
        assert doc["id"] == tid
        assert doc["note"] == "TEST_after_edit"
        assert doc["amount"] == 300
        assert doc["base_amount"] == 300

        # GET to verify persistence
        g = requests.get(f"{API}/transactions/{tid}", headers=H)
        assert g.status_code == 200
        assert g.json()["note"] == "TEST_after_edit"
        assert g.json()["amount"] == 300

        # cleanup
        requests.delete(f"{API}/transactions/{tid}", headers=H)

    def test_update_transaction_cross_currency_recalcs_base(self, ws, account):
        r = requests.post(f"{API}/transactions", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": account["id"],
            "amount": 100, "currency": "INR", "date": today, "note": "TEST_fx"})
        tid = r.json()["id"]
        u = requests.put(f"{API}/transactions/{tid}", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": account["id"],
            "amount": 10, "currency": "USD", "date": today, "note": "TEST_fx"})
        assert u.status_code == 200
        # live FX (fallback 83): base_amount must equal 10 * current USD rate
        ba = u.json()["base_amount"]
        rate = requests.get(f"{API}/meta/currencies").json()["rates"]["USD"]
        assert ba == round(10 * rate, 2), ba
        requests.delete(f"{API}/transactions/{tid}", headers=H)

    def test_update_unknown_transaction_404(self, ws):
        u = requests.put(f"{API}/transactions/txn_does_not_exist", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": "acc_x",
            "amount": 1, "currency": "INR", "date": today})
        assert u.status_code == 404


# ------------------------------- PUT /accounts/{id} -------------------------------
class TestAccountPut:
    def test_update_account_returns_updated(self, ws, account):
        u = requests.put(f"{API}/accounts/{account['id']}", headers=H, json={
            "workspace_id": ws["id"], "name": "TEST_EditBank_Renamed", "type": "bank",
            "currency": "INR", "opening_balance": 5000})
        assert u.status_code == 200, u.text
        doc = u.json()
        assert doc["id"] == account["id"]
        assert doc["name"] == "TEST_EditBank_Renamed"
        assert doc["opening_balance"] == 5000
        assert "balance" in doc  # balance recomputed and returned

        lst = requests.get(f"{API}/accounts?workspace_id={ws['id']}", headers=H).json()
        renamed = next(a for a in lst if a["id"] == account["id"])
        assert renamed["name"] == "TEST_EditBank_Renamed"

    def test_update_unknown_account_404(self, ws):
        u = requests.put(f"{API}/accounts/acc_does_not_exist", headers=H, json={
            "workspace_id": ws["id"], "name": "x", "type": "bank"})
        assert u.status_code == 404


# ------------------------------- PUT /recurring/{id} -------------------------------
class TestRecurringPut:
    def test_update_recurring_returns_updated(self, ws, account):
        r = requests.post(f"{API}/recurring", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": account["id"],
            "amount": 499, "currency": "INR", "note": "TEST_rec_before",
            "frequency": "monthly", "next_date": today})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        nxt = (datetime.now(timezone.utc).date() + timedelta(days=10)).isoformat()
        u = requests.put(f"{API}/recurring/{rid}", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": account["id"],
            "amount": 799, "currency": "INR", "note": "TEST_rec_after",
            "frequency": "weekly", "next_date": nxt})
        assert u.status_code == 200, u.text
        doc = u.json()
        assert doc["id"] == rid
        assert doc["amount"] == 799
        assert doc["note"] == "TEST_rec_after"
        assert doc["frequency"] == "weekly"
        assert doc["next_date"] == nxt
        requests.delete(f"{API}/recurring/{rid}", headers=H)

    def test_update_unknown_recurring_404(self, ws, account):
        u = requests.put(f"{API}/recurring/rec_does_not_exist", headers=H, json={
            "workspace_id": ws["id"], "type": "expense", "account_id": account["id"],
            "amount": 1, "currency": "INR", "frequency": "monthly", "next_date": today})
        assert u.status_code == 404


# ------------------------------- PUT /fixed-deposits/{id} -------------------------------
class TestFixedDepositPut:
    def test_update_fd_returns_updated_with_maturity(self, ws):
        start = today
        maturity = (datetime.now(timezone.utc).date() + timedelta(days=365)).isoformat()
        r = requests.post(f"{API}/fixed-deposits", headers=H, json={
            "workspace_id": ws["id"], "name": "TEST_FD_edit", "principal": 100000,
            "rate": 7.0, "start_date": start, "maturity_date": maturity})
        assert r.status_code == 200, r.text
        fid = r.json()["id"]

        u = requests.put(f"{API}/fixed-deposits/{fid}", headers=H, json={
            "workspace_id": ws["id"], "name": "TEST_FD_edited", "principal": 200000,
            "rate": 7.5, "start_date": start, "maturity_date": maturity})
        assert u.status_code == 200, u.text
        doc = u.json()
        assert doc["id"] == fid
        assert doc["name"] == "TEST_FD_edited"
        assert doc["principal"] == 200000
        assert doc["rate"] == 7.5
        assert doc["maturity_value"] > 200000  # recomputed
        assert "accrued_interest" in doc
        requests.delete(f"{API}/fixed-deposits/{fid}", headers=H)

    def test_update_unknown_fd_404(self, ws):
        u = requests.put(f"{API}/fixed-deposits/fd_does_not_exist", headers=H, json={
            "workspace_id": ws["id"], "name": "x", "principal": 1, "rate": 1,
            "start_date": today, "maturity_date": today})
        assert u.status_code == 404


# ------------------------------- PUT /stocks/{id} -------------------------------
class TestStockPut:
    def test_update_stock_returns_updated_pnl(self, ws):
        r = requests.post(f"{API}/stocks", headers=H, json={
            "workspace_id": ws["id"], "symbol": "TCS", "name": "TEST_TCS_edit",
            "quantity": 10, "avg_price": 3000, "current_price": 3500})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]

        u = requests.put(f"{API}/stocks/{sid}", headers=H, json={
            "workspace_id": ws["id"], "symbol": "TCS", "name": "TEST_TCS_edited",
            "quantity": 20, "avg_price": 3000, "current_price": 3600})
        assert u.status_code == 200, u.text
        doc = u.json()
        assert doc["id"] == sid
        assert doc["quantity"] == 20
        assert doc["invested"] == 60000
        assert doc["current_value"] == 72000
        assert doc["pnl"] == 12000
        requests.delete(f"{API}/stocks/{sid}", headers=H)

    def test_update_unknown_stock_404(self, ws):
        u = requests.put(f"{API}/stocks/stk_does_not_exist", headers=H, json={
            "workspace_id": ws["id"], "symbol": "X", "name": "x",
            "quantity": 1, "avg_price": 1, "current_price": 1})
        assert u.status_code == 404


# ------------------------------- GET /meta/currencies -------------------------------
class TestMetaCurrencies:
    def test_currencies_shape_and_fallback(self):
        r = requests.get(f"{API}/meta/currencies")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "currencies" in d and "rates" in d
        assert "source" in d and d["source"] in ("fallback", "live")
        assert "updated_at" in d  # present even if None (live refresh failed)
        # fallback INR-base values present even if live refresh failed
        assert d["rates"]["INR"] == 1.0
        for cur in ("USD", "EUR", "GBP"):
            assert cur in d["rates"] and d["rates"][cur] > 0
        # if fallback, static values are intact
        if d["source"] == "fallback":
            assert d["rates"]["USD"] == 83.0
            assert d["rates"]["AED"] == 22.6
        assert len(d["currencies"]) == len(d["rates"])


# ------------------------------- Bill Scan (premium) -------------------------------
class TestBillScan:
    def _b64(self, path):
        with open(path) as f:
            return f.read().strip()

    def test_bill_scan_jpeg_receipt(self):
        payload = {"image_base64": self._b64("/tmp/receipt_jpg_b64.txt"), "mime_type": "image/jpeg"}
        r = requests.post(f"{API}/bill-scan", headers=H, json=payload, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("merchant", "date", "currency", "total", "tax", "items"):
            assert key in d, f"missing {key} in {d}"
        assert isinstance(d["items"], list)
        assert isinstance(d["total"], (int, float)) and d["total"] > 0
        # total should be near 732.90 (allow OCR tolerance)
        assert 500 <= float(d["total"]) <= 900, d["total"]
        assert len(d["merchant"]) > 0

    def test_bill_scan_pdf_receipt(self):
        payload = {"image_base64": self._b64("/tmp/receipt_pdf_b64.txt"), "mime_type": "application/pdf"}
        r = requests.post(f"{API}/bill-scan", headers=H, json=payload, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("merchant", "date", "currency", "total", "tax", "items"):
            assert key in d, f"missing {key} in {d}"
        assert float(d["total"]) > 0

    def test_bill_scan_non_premium_403(self, nonpremium_headers):
        payload = {"image_base64": self._b64("/tmp/receipt_jpg_b64.txt"), "mime_type": "image/jpeg"}
        r = requests.post(f"{API}/bill-scan", headers=nonpremium_headers, json=payload, timeout=30)
        assert r.status_code == 403, r.text
        assert "Premium" in r.json().get("detail", "")

    def test_bill_scan_no_image_persisted(self):
        # Run a scan, then assert no stray receipt/temp files were left on the server fs.
        payload = {"image_base64": self._b64("/tmp/receipt_pdf_b64.txt"), "mime_type": "application/pdf"}
        r = requests.post(f"{API}/bill-scan", headers=H, json=payload, timeout=90)
        assert r.status_code == 200, r.text
        import glob, time
        time.sleep(1)
        # backend runs in same container; PDF path uses NamedTemporaryFile(suffix=".pdf")
        leftover = [p for p in glob.glob("/tmp/tmp*.pdf") if os.path.getmtime(p) > time.time() - 180]
        assert leftover == [], f"temp pdf files persisted: {leftover}"
        assert not os.path.exists("/app/backend/uploads")
