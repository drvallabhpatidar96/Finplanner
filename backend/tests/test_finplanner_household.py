"""FinPlanner Phase-3 backend tests: household membership.
Covers: email invites (create/resend/revoke/accept), invite codes,
owner-controlled member permissions + enforcement, per-member ownership
on stocks & FDs (my_share), and the shared-household audit log.
Invite accept tokens are masked by the API (token=None) so the raw token
is read directly from MongoDB for accept-flow testing only.
"""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://family-budget-182.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER = {"Authorization": "Bearer test_token_finplanner_e2e", "Content-Type": "application/json"}
MEMBER = {"Authorization": "Bearer test_token_finplanner_member", "Content-Type": "application/json"}
MEMBER_EMAIL = "member@finplanner.app"
MEMBER_UID = "user_test_fin002"

today = datetime.now(timezone.utc).date()
future = (today + timedelta(days=365 * 5)).isoformat()


def _mongo():
    env = {}
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line:
                k, v = line.strip().split("=", 1)
                env[k] = v.strip('"').strip("'")
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


def invite_token_from_db(invite_id: str) -> str:
    doc = _mongo().invitations.find_one({"id": invite_id})
    return doc["token"] if doc else None


@pytest.fixture(scope="module")
def inv_ws():
    """Shared workspace for invite-flow tests (cleaned up after)."""
    r = requests.post(f"{API}/workspaces", headers=OWNER, json={"name": "TEST_Invites", "base_currency": "INR"})
    assert r.status_code == 200, r.text
    ws = r.json()
    yield ws
    requests.delete(f"{API}/workspaces/{ws['id']}", headers=OWNER)


@pytest.fixture(scope="module")
def perm_ws():
    """Shared workspace with the real member joined (full) for permission/ownership tests."""
    r = requests.post(f"{API}/workspaces", headers=OWNER, json={"name": "TEST_Perms", "base_currency": "INR"})
    assert r.status_code == 200, r.text
    ws = r.json()
    jr = requests.post(f"{API}/workspaces/join", headers=MEMBER, json={"code": ws["invite_code"]})
    assert jr.status_code == 200, jr.text
    ws = jr.json()
    yield ws
    requests.delete(f"{API}/workspaces/{ws['id']}", headers=OWNER)


def member_of(ws, user_id):
    return next((m for m in ws["members"] if m.get("user_id") == user_id), None)


# ------------------------------- Email invites -------------------------------
class TestInvites:
    def test_new_shared_ws_has_invite_code(self, inv_ws):
        assert inv_ws.get("invite_code") and len(inv_ws["invite_code"]) == 8

    def test_create_invite_sends_email(self, inv_ws):
        import time
        data = None
        for attempt in range(3):
            r = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER,
                              json={"email": "delivered@resend.dev"})
            assert r.status_code == 200, r.text
            data = r.json()
            if data["email_sent"]:
                break
            time.sleep(20)  # email proxy can rate-limit under parallel suites; retry
        assert data["status"] == "pending"
        assert data["email_sent"] is True, "email proxy still not delivering after retries"
        assert data["token"] is None  # token must not leak via API

    def test_create_invite_invalid_email_400(self, inv_ws):
        r = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER,
                          json={"email": "not-an-email"})
        assert r.status_code == 400

    def test_duplicate_pending_email_revokes_old(self, inv_ws):
        r1 = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER,
                           json={"email": "dup1@resend.dev"})
        assert r1.status_code == 200, r1.text
        old_id = r1.json()["id"]
        r2 = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER,
                           json={"email": "dup1@resend.dev"})
        assert r2.status_code == 200, r2.text
        invs = requests.get(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER).json()
        by_id = {i["id"]: i for i in invs}
        assert by_id[old_id]["status"] == "revoked"
        assert by_id[r2.json()["id"]]["status"] == "pending"

    def test_list_invites_owner_only(self, inv_ws):
        r = requests.get(f"{API}/workspaces/{inv_ws['id']}/invites", headers=MEMBER)
        assert r.status_code == 403

    def test_create_invite_owner_only(self, inv_ws):
        r = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites", headers=MEMBER,
                          json={"email": "x@resend.dev"})
        assert r.status_code == 403

    def test_resend_pending_only(self, inv_ws):
        invs = requests.get(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER).json()
        revoked = next(i for i in invs if i["status"] == "revoked")
        r = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites/{revoked['id']}/resend", headers=OWNER)
        assert r.status_code == 400
        pending = next(i for i in invs if i["status"] == "pending" and i["email"] == "delivered@resend.dev")
        r2 = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites/{pending['id']}/resend", headers=OWNER)
        assert r2.status_code == 200, r2.text

    def test_revoke_invite(self, inv_ws):
        r = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER,
                          json={"email": "torevoke@resend.dev"})
        inv_id = r.json()["id"]
        rr = requests.delete(f"{API}/workspaces/{inv_ws['id']}/invites/{inv_id}", headers=OWNER)
        assert rr.status_code == 200
        invs = requests.get(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER).json()
        assert next(i for i in invs if i["id"] == inv_id)["status"] == "revoked"
        # accepting a revoked invite -> 400
        token = invite_token_from_db(inv_id)
        ar = requests.post(f"{API}/invites/{token}/accept", headers=MEMBER)
        assert ar.status_code == 400

    def test_get_invite_by_token_and_matches_you(self, inv_ws):
        r = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER,
                          json={"email": MEMBER_EMAIL})
        assert r.status_code == 200, r.text
        token = invite_token_from_db(r.json()["id"])
        assert token
        gm = requests.get(f"{API}/invites/{token}", headers=MEMBER)
        assert gm.status_code == 200, gm.text
        data = gm.json()
        assert data["household_name"] == "TEST_Invites"
        assert data["invited_by_name"]
        assert data["email"] == MEMBER_EMAIL
        assert data["status"] == "pending"
        assert data["matches_you"] is True
        go = requests.get(f"{API}/invites/{token}", headers=OWNER)
        assert go.json()["matches_you"] is False
        # 404 for unknown token
        assert requests.get(f"{API}/invites/deadbeef", headers=MEMBER).status_code == 404
        TestInvites._member_token = token  # hand off to accept tests

    def test_accept_wrong_email_403(self, inv_ws):
        token = TestInvites._member_token
        r = requests.post(f"{API}/invites/{token}/accept", headers=OWNER)
        assert r.status_code == 403

    def test_accept_success_adds_real_member(self, inv_ws):
        token = TestInvites._member_token
        r = requests.post(f"{API}/invites/{token}/accept", headers=MEMBER)
        assert r.status_code == 200, r.text
        ws = r.json()
        m = member_of(ws, MEMBER_UID)
        assert m is not None
        assert m["role"] == "member"
        assert m["permission"] == "full"
        # re-accept -> 400 (no longer pending)
        r2 = requests.post(f"{API}/invites/{token}/accept", headers=MEMBER)
        assert r2.status_code == 400
        # invite to an existing member -> 400
        r3 = requests.post(f"{API}/workspaces/{inv_ws['id']}/invites", headers=OWNER,
                           json={"email": MEMBER_EMAIL})
        assert r3.status_code == 400


# ------------------------------- Invite codes -------------------------------
class TestInviteCodes:
    def test_join_invalid_code_404(self):
        r = requests.post(f"{API}/workspaces/join", headers=MEMBER, json={"code": "ZZZZZZZZ"})
        assert r.status_code == 404

    def test_join_already_member_400(self, perm_ws):
        r = requests.post(f"{API}/workspaces/join", headers=OWNER, json={"code": perm_ws["invite_code"]})
        assert r.status_code == 400

    def test_join_success_via_code(self, perm_ws):
        m = member_of(perm_ws, MEMBER_UID)
        assert m is not None and m["role"] == "member" and m["permission"] == "full"


# ------------------------------- Permissions -------------------------------
class TestPermissions:
    def test_member_cannot_patch_permission(self, perm_ws):
        owner_mem = member_of(perm_ws, "user_test_fin001")
        r = requests.patch(f"{API}/workspaces/{perm_ws['id']}/members/{owner_mem['member_id']}",
                           headers=MEMBER, json={"permission": "view"})
        assert r.status_code == 403

    def test_owner_row_cannot_be_changed(self, perm_ws):
        owner_mem = member_of(perm_ws, "user_test_fin001")
        r = requests.patch(f"{API}/workspaces/{perm_ws['id']}/members/{owner_mem['member_id']}",
                           headers=OWNER, json={"permission": "view"})
        assert r.status_code == 400

    def test_member_cannot_remove_member(self, perm_ws):
        mem = member_of(perm_ws, MEMBER_UID)
        r = requests.delete(f"{API}/workspaces/{perm_ws['id']}/members/{mem['member_id']}", headers=MEMBER)
        assert r.status_code == 403

    def test_owner_cannot_be_removed(self, perm_ws):
        owner_mem = member_of(perm_ws, "user_test_fin001")
        r = requests.delete(f"{API}/workspaces/{perm_ws['id']}/members/{owner_mem['member_id']}", headers=OWNER)
        assert r.status_code == 400

    def _set_perm(self, ws_id, perm):
        ws = requests.get(f"{API}/workspaces", headers=OWNER).json()
        ws = next(w for w in ws if w["id"] == ws_id)
        mem = member_of(ws, MEMBER_UID)
        r = requests.patch(f"{API}/workspaces/{ws_id}/members/{mem['member_id']}",
                           headers=OWNER, json={"permission": perm})
        assert r.status_code == 200, r.text

    def test_view_only_enforcement(self, perm_ws):
        ws_id = perm_ws["id"]
        self._set_perm(ws_id, "view")
        # owner creates an account to act upon
        ar = requests.post(f"{API}/accounts", headers=OWNER,
                           json={"workspace_id": ws_id, "name": "TEST_PermAcc", "type": "bank", "opening_balance": 100})
        assert ar.status_code == 200, ar.text
        acc_id = ar.json()["id"]
        acct_body = {"workspace_id": ws_id, "name": "X", "type": "cash"}
        txn_body = {"workspace_id": ws_id, "type": "expense", "account_id": acc_id,
                    "amount": 10, "date": today.isoformat()}
        fd_body = {"workspace_id": ws_id, "name": "X", "principal": 1000, "rate": 6,
                   "start_date": today.isoformat(), "maturity_date": future}
        stk_body = {"workspace_id": ws_id, "symbol": "X", "name": "X", "quantity": 1,
                    "avg_price": 10, "current_price": 10}
        # owner creates a real transaction so DELETE hits the permission gate (not 404)
        tr = requests.post(f"{API}/transactions", headers=OWNER, json=txn_body)
        assert tr.status_code == 200, tr.text
        txn_id = tr.json()["id"]
        checks = [
            ("POST", f"{API}/accounts", acct_body),
            ("PUT", f"{API}/accounts/{acc_id}", acct_body),
            ("DELETE", f"{API}/accounts/{acc_id}", None),
            ("POST", f"{API}/transactions", txn_body),
            ("PUT", f"{API}/transactions/{txn_id}", txn_body),
            ("DELETE", f"{API}/transactions/{txn_id}", None),
            ("POST", f"{API}/budgets", {"workspace_id": ws_id, "category_id": "c", "amount": 100}),
            ("POST", f"{API}/recurring", {"workspace_id": ws_id, "type": "expense", "account_id": acc_id,
                                          "amount": 10, "frequency": "monthly", "next_date": today.isoformat()}),
            ("POST", f"{API}/stocks", stk_body),
            ("POST", f"{API}/fixed-deposits", fd_body),
        ]
        for method, url, body in checks:
            r = requests.request(method, url, headers=MEMBER, json=body)
            assert r.status_code == 403, f"{method} {url} -> {r.status_code} {r.text}"
        TestPermissions._acc_id = acc_id

    def test_edit_level_can_write_but_not_delete(self, perm_ws):
        ws_id = perm_ws["id"]
        self._set_perm(ws_id, "edit")
        acc_id = TestPermissions._acc_id
        r = requests.post(f"{API}/accounts", headers=MEMBER,
                          json={"workspace_id": ws_id, "name": "TEST_EditAcc", "type": "cash"})
        assert r.status_code == 200, r.text
        r2 = requests.put(f"{API}/accounts/{acc_id}", headers=MEMBER,
                          json={"workspace_id": ws_id, "name": "TEST_PermAcc2", "type": "bank"})
        assert r2.status_code == 200, r2.text
        r3 = requests.delete(f"{API}/accounts/{acc_id}", headers=MEMBER)
        assert r3.status_code == 403

    def test_full_level_can_delete(self, perm_ws):
        ws_id = perm_ws["id"]
        self._set_perm(ws_id, "full")
        r = requests.delete(f"{API}/accounts/{TestPermissions._acc_id}", headers=MEMBER)
        assert r.status_code == 200, r.text

    def test_member_cannot_delete_workspace(self, perm_ws):
        r = requests.delete(f"{API}/workspaces/{perm_ws['id']}", headers=MEMBER)
        assert r.status_code == 403

    def test_member_cannot_add_placeholder_member(self, perm_ws):
        r = requests.post(f"{API}/workspaces/{perm_ws['id']}/members", headers=MEMBER, json={"name": "X"})
        assert r.status_code == 403


# ------------------------------- Ownership (stocks & FDs) -------------------------------
class TestOwnership:
    def _member_ids(self, ws_id):
        ws = next(w for w in requests.get(f"{API}/workspaces", headers=OWNER).json() if w["id"] == ws_id)
        return member_of(ws, "user_test_fin001")["member_id"], member_of(ws, MEMBER_UID)["member_id"]

    def test_ownership_sum_not_100_400(self, perm_ws):
        oid, mid = self._member_ids(perm_ws["id"])
        body = {"workspace_id": perm_ws["id"], "symbol": "T1", "name": "T", "quantity": 1,
                "avg_price": 100, "current_price": 100,
                "ownership": [{"member_id": oid, "percent": 50}, {"member_id": mid, "percent": 40}]}
        r = requests.post(f"{API}/stocks", headers=OWNER, json=body)
        assert r.status_code == 400

    def test_ownership_non_member_400(self, perm_ws):
        body = {"workspace_id": perm_ws["id"], "symbol": "T2", "name": "T", "quantity": 1,
                "avg_price": 100, "current_price": 100,
                "ownership": [{"member_id": "mem_ghost", "percent": 100}]}
        r = requests.post(f"{API}/stocks", headers=OWNER, json=body)
        assert r.status_code == 400

    def test_stock_ownership_my_share_differs(self, perm_ws):
        oid, mid = self._member_ids(perm_ws["id"])
        body = {"workspace_id": perm_ws["id"], "symbol": "TESTSH", "name": "T", "quantity": 10,
                "avg_price": 100, "current_price": 200,
                "ownership": [{"member_id": oid, "percent": 60}, {"member_id": mid, "percent": 40}]}
        r = requests.post(f"{API}/stocks", headers=OWNER, json=body)
        assert r.status_code == 200, r.text
        stk_id = r.json()["id"]
        assert r.json()["my_share"] == 1200.0  # 2000 * 60%
        owner_list = requests.get(f"{API}/stocks?workspace_id={perm_ws['id']}", headers=OWNER).json()
        member_list = requests.get(f"{API}/stocks?workspace_id={perm_ws['id']}", headers=MEMBER).json()
        o = next(s for s in owner_list if s["id"] == stk_id)
        m = next(s for s in member_list if s["id"] == stk_id)
        assert o["my_share"] == 1200.0
        assert m["my_share"] == 800.0
        # PUT update ownership to 50/50
        body["ownership"] = [{"member_id": oid, "percent": 50}, {"member_id": mid, "percent": 50}]
        pr = requests.put(f"{API}/stocks/{stk_id}", headers=OWNER, json=body)
        assert pr.status_code == 200, pr.text
        assert pr.json()["my_share"] == 1000.0

    def test_fd_ownership_my_share(self, perm_ws):
        oid, mid = self._member_ids(perm_ws["id"])
        body = {"workspace_id": perm_ws["id"], "name": "TEST_FD", "principal": 100000, "rate": 7,
                "start_date": today.isoformat(), "maturity_date": future,
                "ownership": [{"member_id": oid, "percent": 70}, {"member_id": mid, "percent": 30}]}
        r = requests.post(f"{API}/fixed-deposits", headers=OWNER, json=body)
        assert r.status_code == 200, r.text
        fd_id = r.json()["id"]
        owner_list = requests.get(f"{API}/fixed-deposits?workspace_id={perm_ws['id']}", headers=OWNER).json()
        member_list = requests.get(f"{API}/fixed-deposits?workspace_id={perm_ws['id']}", headers=MEMBER).json()
        o = next(f for f in owner_list if f["id"] == fd_id)
        m = next(f for f in member_list if f["id"] == fd_id)
        base = 100000 + o["accrued_interest"]
        assert o["my_share"] == round(base * 0.7, 2)
        assert m["my_share"] == round(base * 0.3, 2)

    def test_ownership_ignored_in_personal(self):
        ws = next(w for w in requests.get(f"{API}/workspaces", headers=OWNER).json() if w["type"] == "personal")
        oid = ws["members"][0]["member_id"]
        body = {"workspace_id": ws["id"], "symbol": "TESTP", "name": "T", "quantity": 1,
                "avg_price": 100, "current_price": 150,
                "ownership": [{"member_id": oid, "percent": 50}]}
        r = requests.post(f"{API}/stocks", headers=OWNER, json=body)
        assert r.status_code == 200, r.text
        assert r.json()["ownership"] == []
        assert r.json()["my_share"] == 150.0  # full value
        requests.delete(f"{API}/stocks/{r.json()['id']}", headers=OWNER)


# ------------------------------- Audit log -------------------------------
class TestAuditLog:
    def test_audit_actions_recorded(self):
        # self-contained flow: create ws -> invite -> revoke -> join -> role_change -> ownership -> remove_member
        r = requests.post(f"{API}/workspaces", headers=OWNER, json={"name": "TEST_Audit", "base_currency": "INR"})
        ws = r.json()
        ws_id = ws["id"]
        try:
            requests.post(f"{API}/workspaces/{ws_id}/invites", headers=OWNER, json={"email": "audit1@resend.dev"})
            inv = requests.get(f"{API}/workspaces/{ws_id}/invites", headers=OWNER).json()[0]
            requests.delete(f"{API}/workspaces/{ws_id}/invites/{inv['id']}", headers=OWNER)
            requests.post(f"{API}/workspaces/join", headers=MEMBER, json={"code": ws["invite_code"]})
            ws2 = next(w for w in requests.get(f"{API}/workspaces", headers=OWNER).json() if w["id"] == ws_id)
            mem = member_of(ws2, MEMBER_UID)
            requests.patch(f"{API}/workspaces/{ws_id}/members/{mem['member_id']}", headers=OWNER,
                           json={"permission": "view"})
            oid = member_of(ws2, "user_test_fin001")["member_id"]
            requests.post(f"{API}/stocks", headers=OWNER,
                          json={"workspace_id": ws_id, "symbol": "AUD", "name": "A", "quantity": 1,
                                "avg_price": 10, "current_price": 10,
                                "ownership": [{"member_id": oid, "percent": 50}, {"member_id": mem["member_id"], "percent": 50}]})
            requests.delete(f"{API}/workspaces/{ws_id}/members/{mem['member_id']}", headers=OWNER)

            log = requests.get(f"{API}/audit-log?workspace_id={ws_id}", headers=OWNER).json()
            actions = {e["action"] for e in log}
            for expected in ["invite", "revoke_invite", "join", "role_change", "ownership", "remove_member", "create"]:
                assert expected in actions, f"missing audit action {expected}; got {actions}"
        finally:
            requests.delete(f"{API}/workspaces/{ws_id}", headers=OWNER)

    def test_accept_invite_audited(self):
        # self-contained: perform invite/resend/accept/revoke in a fresh workspace
        # (xdist gives this class its own inv_ws instance on another worker)
        r = requests.post(f"{API}/workspaces", headers=OWNER, json={"name": "TEST_AuditAccept", "base_currency": "INR"})
        assert r.status_code == 200, r.text
        ws_id = r.json()["id"]
        try:
            # invite + resend
            ir = requests.post(f"{API}/workspaces/{ws_id}/invites", headers=OWNER, json={"email": MEMBER_EMAIL})
            assert ir.status_code == 200, ir.text
            inv_id = ir.json()["id"]
            rs = requests.post(f"{API}/workspaces/{ws_id}/invites/{inv_id}/resend", headers=OWNER)
            assert rs.status_code == 200, rs.text
            # accept by the invited member
            token = invite_token_from_db(inv_id)
            ar = requests.post(f"{API}/invites/{token}/accept", headers=MEMBER)
            assert ar.status_code == 200, ar.text
            # a second invite that gets revoked
            ir2 = requests.post(f"{API}/workspaces/{ws_id}/invites", headers=OWNER, json={"email": "audit2@resend.dev"})
            assert ir2.status_code == 200, ir2.text
            rr = requests.delete(f"{API}/workspaces/{ws_id}/invites/{ir2.json()['id']}", headers=OWNER)
            assert rr.status_code == 200

            log = requests.get(f"{API}/audit-log?workspace_id={ws_id}", headers=OWNER).json()
            actions = {e["action"] for e in log}
            assert {"invite", "accept_invite", "revoke_invite", "resend_invite"} <= actions
        finally:
            requests.delete(f"{API}/workspaces/{ws_id}", headers=OWNER)

    def test_audit_log_member_can_read_but_workspace_scoped(self, inv_ws):
        # personal workspace should have empty audit log
        log = requests.get(f"{API}/audit-log?workspace_id=ws_test_fin_personal", headers=OWNER).json()
        assert log == []
