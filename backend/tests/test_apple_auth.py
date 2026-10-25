"""Apple Sign-In backend tests (in-process, mocks Apple's JWKS endpoint).

Covers:
- valid identity token -> creates user, returns session_token, /auth/me works
- second sign-in without name/email -> finds same user by apple_sub, no overwrite
- wrong audience -> 401
- garbage token -> 401
- email matching an existing (Google) account -> links apple_sub, no duplicate
"""
import asyncio
import time
import uuid
from unittest.mock import patch

import jwt as pyjwt
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient

import server as srv

PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
AUD = "com.emergent.familybudget.qtfwx1"
ISS = "https://appleid.apple.com"


class _FakeKey:
    key = PRIVATE_KEY.public_key()


def _token(sub: str, aud: str = AUD, iss: str = ISS, email: str | None = None) -> str:
    claims = {"iss": iss, "aud": aud, "sub": sub, "exp": int(time.time()) + 3600, "iat": int(time.time())}
    if email:
        claims["email"] = email
    return pyjwt.encode(claims, PRIVATE_KEY, algorithm="RS256", headers={"kid": "test-kid"})


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_apple_signin_full_flow():
    async def main():
        sub = f"apple_sub_{uuid.uuid4().hex[:12]}"
        email = f"apple_{uuid.uuid4().hex[:8]}@privaterelay.appleid.com"
        created_user_id = None
        ws_ids = []
        try:
            with patch("jwt.PyJWKClient") as mock_client:
                mock_client.return_value.get_signing_key_from_jwt.return_value = _FakeKey()
                transport = ASGITransport(app=srv.app)
                async with AsyncClient(transport=transport, base_url="http://test") as ac:
                    post = lambda token, **kw: ac.post("/api/auth/apple", json={"identity_token": token, **kw})

                    # 1. first sign-in with name + email -> creates account
                    r = await post(_token(sub), name="Apple Tester", email=email)
                    assert r.status_code == 200, r.text
                    data = r.json()
                    created_user_id = data["user"]["user_id"]
                    assert data["session_token"]
                    assert data["user"]["email"] == email
                    assert data["user"]["name"] == "Apple Tester"

                    # session token works on /auth/me
                    auth = {"Authorization": f"Bearer {data['session_token']}"}
                    me = await ac.get("/api/auth/me", headers=auth)
                    assert me.status_code == 200
                    assert me.json()["user_id"] == created_user_id

                    # personal workspace auto-created
                    ws = await ac.get("/api/workspaces", headers=auth)
                    assert ws.status_code == 200
                    ws_ids = [w["id"] for w in ws.json()]
                    assert any(w["type"] == "personal" for w in ws.json())

                    # 2. second sign-in: name/email null -> same user, no overwrite
                    r2 = await post(_token(sub))
                    assert r2.status_code == 200, r2.text
                    data2 = r2.json()
                    assert data2["user"]["user_id"] == created_user_id
                    assert data2["user"]["name"] == "Apple Tester"

                    # 3. wrong audience -> 401
                    bad = await post(_token(sub, aud="com.wrong.bundle"))
                    assert bad.status_code == 401

                    # 4. garbage token -> 401
                    garbage = await post("not.a.jwt")
                    assert garbage.status_code == 401
        finally:
            if created_user_id:
                await srv.db.users.delete_many({"apple_sub": sub})
                await srv.db.user_sessions.delete_many({"user_id": created_user_id})
                await srv.db.workspaces.delete_many({"owner_id": created_user_id})
                if ws_ids:
                    await srv.db.categories.delete_many({"workspace_id": {"$in": ws_ids}})

    _run(main())


def test_apple_links_existing_email_account():
    """Apple sign-in with an email already registered (e.g. Google) links, not duplicates."""

    async def main():
        sub = f"apple_sub_{uuid.uuid4().hex[:12]}"
        email = f"link_{uuid.uuid4().hex[:8]}@finplanner.app"
        user_id = srv.new_id("user")
        await srv.db.users.insert_one({
            "user_id": user_id, "email": email, "name": "Google User", "picture": None,
            "country": "IN", "base_currency": "INR", "premium": False,
            "created_at": srv.now_utc().isoformat(), "deleted_at": None,
        })
        try:
            with patch("jwt.PyJWKClient") as mock_client:
                mock_client.return_value.get_signing_key_from_jwt.return_value = _FakeKey()
                transport = ASGITransport(app=srv.app)
                async with AsyncClient(transport=transport, base_url="http://test") as ac:
                    r = await ac.post("/api/auth/apple", json={"identity_token": _token(sub, email=email), "email": email})
                    assert r.status_code == 200, r.text
                    assert r.json()["user"]["user_id"] == user_id  # linked, not a new account
                    count = await srv.db.users.count_documents({"email": email})
                    assert count == 1
        finally:
            await srv.db.users.delete_many({"user_id": user_id})
            await srv.db.user_sessions.delete_many({"user_id": user_id})

    _run(main())
