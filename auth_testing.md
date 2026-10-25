# Apple Sign-In — Testing Notes (from integration playbook)

Button flow requires real Apple ID on a physical iOS device (manual test after a dev/production build — NOT available in Expo Go or web preview).

Backend routes can be tested with a seeded session:

1. Seed a test user + session in MongoDB (`python /app/backend/seed_test.py`).
2. Hit `GET /api/auth/me` with `Authorization: Bearer <token>` — expect user data.
3. `POST /api/auth/apple` with a garbage/invalid `identity_token` — expect **401**.
4. With a real Apple identity token: decode it and confirm `aud` matches an entry in `APPLE_AUDIENCES` (env: `com.emergent.familybudget.qtfwx1,host.exp.Exponent`). Wrong `aud` must 401.

## Manual device test checklist
- iOS device with signed-in Apple ID.
- Login screen shows native "Continue with Apple" button below Google button.
- First sign-in: Apple returns name + email → account created, personal workspace seeded.
- Second sign-in: name/email are null → existing account found by `apple_sub`, no overwrite.
- Cancel sheet → no toast, no state change.
- Sign out → returns to login screen.
