# FinPlanner — Code Review Findings (2026-10, post-split, read-only)

Split itself verified CLEAN: imports, endpoint/caller mapping (all 34 frontend-referenced
endpoints resolve), permission gates, shared FX state, emailer wiring. ruff: no errors.

## P0 — HIGH (pre-existing, NOT fixed per Phase-1 scope)
**Re-signing in after deleting your account crashes with HTTP 500 and locks the user out.**
- `backend/routes/auth.py:30-44` (`create_session`); same pattern in `apple_auth` (`auth.py:100-124`)
- `delete_account` only soft-deletes (`deleted_at`); the unique `email` index keeps the row.
  On re-login the `existing and not existing.get("deleted_at")` check fails → `insert_one`
  with the same email → unhandled `DuplicateKeyError` → 500.
- Fix (Phase 2): on re-login, reactivate the soft-deleted record (clear `deleted_at`, update profile) instead of inserting.
- Regression test to add: soft-delete a seeded user, POST /auth/session again, assert 200 + same user_id.

## P1 — MEDIUM (pre-existing, NOT fixed per Phase-1 scope)
**Household members with "edit" access can't open an existing transaction to edit it.**
- `backend/routes/transactions.py:62-68` (`get_transaction`) requires `"delete"` (full) permission;
  the edit screen fetches `GET /transactions/{id}` (`frontend/app/add-transaction.tsx:82-86`), so
  edit-tier members get 403 and the form never prefills. Read gate stricter than write gate.
- Fix (Phase 2): change to `require_perm(..., "view")` or `require_workspace`, matching other reads.
- Regression test to add: as an "edit"-permission member, GET an existing transaction → 200.

## P2 — LOW
- CORS wildcard + credentials: `server.py:39-42` (`allow_origins=["*"]` with `allow_credentials=True`). Pin explicit origins in production.
- Brittle intra-class test state: `tests/test_finplanner_household.py` `TestInvites._member_token`, `TestPermissions._acc_id` class-attribute handoffs; module-level `today` frozen at import. Fine under `-n 2 --dist loadscope`; breaks if tests are selected/reordered individually.
- `splitEqually` (`frontend/app/add-transaction.tsx`) rounding remainder on n-way splits; shares may not sum exactly to total. Acceptable for planner-grade.
- Pre-existing frontend lint noise (unused imports in cards.tsx, transactions.tsx, sheet-modal.tsx, side-nav.tsx, workspace-switcher.tsx; react/no-unescaped-entities in accept-invite.tsx, csv-import.tsx, members.tsx).

## Verified clean
- No orphaned imports/endpoints from the split; no duplicate route registration.
- require_perm levels consistent everywhere except the P1 above.
- Apple + Google auth coexist; session handling unchanged.
- All 79 backend tests pass under xdist after isolation fixes (see below).

## Test stabilization changes (done this pass)
- `test_split_expense_and_dashboard`: self-adds TEST_Partner member if missing (was cross-class dep).
- `test_card_summary_and_payment`: relative balance assertion (before − 500) instead of absolute 1500.
- `test_accept_invite_audited`: fully self-contained invite/resend/accept/revoke flow in its own workspace.
- `test_create_invite_sends_email`: retries up to 3× with 20s backoff (email proxy rate-limits under parallel bursts).
- Regenerated lost /tmp receipt fixtures (JPEG + PDF) for bill-scan tests.
- `seed_test.py`: owner seeded with premium=true (matches test_credentials.md).
- Intentional behavior change: `resend_invite` now catches email send failures (mirrors `create_invite`) and returns `{ok, email_sent}` instead of 500-ing when the email proxy errors.
