# FinPlanner — Product Requirements Document

## Original Problem Statement
A mobile-first shared finance app for individuals, couples and families: personal + household (shared) workspaces, manual money tracking, planner-grade credit cards, budgets, FDs, stocks, premium entitlement, India-first with multi-currency. Promise: "Track your own money and your household money in one app, without spreadsheet pain." Built on Expo (RN) + FastAPI + MongoDB (replacing the original Capacitor/PWA plan — Expo covers iOS/Android/web from one codebase).

## User Choices (this build)
- Auth: Emergent-managed Google Sign-In (no passwords)
- Payments: premium entitlement framework only (mock upgrade; real Stripe/Apple/Google wired later)
- Bill Scan: skipped for MVP
- Ads: placeholder ad slot in UI only

## Architecture
- **Frontend:** Expo Router, dark-first "tactical utility" theme (obsidian + rust), Phosphor icons, Barlow Condensed / DM Sans fonts, react-query for all server data, bottom tabs (Home / Activity / Cards / More) + persistent add FAB, custom numeric keypad for fast entry, Modal bottom sheets, Toasts (no Alerts).
- **Backend:** FastAPI, Mongo (motor), custom string ids (no _id leaked), soft-deletes everywhere, static FX (INR base), session-based Google auth per Emergent playbook.

## User Personas
1. Individual leaving spreadsheets — fast personal tracking.
2. Couple — shared household workspace with payer/share.
3. Family — one combined view + private personal workspace retained.

## Core Requirements (static)
- Strict workspace scoping (personal auto-created; multiple shared; member-only access).
- Transaction belongs to exactly one workspace. Shared = portfolio-style (payer + optional share allocation), NOT Splitwise settle-up.
- Planner-grade credit cards (understandable, not issuer-perfect).
- India-first, structural multi-currency.

## Implemented (2026-06)
- Google sign-in (session token in secure-store/localStorage), region onboarding (country + currency).
- Workspaces: list/switch (always-visible switcher), create shared, add members, delete shared.
- Accounts: bank / cash / credit card, computed balances, soft-delete.
- Categories: seeded defaults + custom (expense/income, color), delete.
- Transactions: expense / income / transfer, cross-currency, refunds, shared payer + split allocation, keypad entry, list with filters + grouped by date, delete.
- Credit cards: statement balance, unbilled, minimum due, revolving estimate, available credit, due date, make payment.
- Budgets (monthly per category with spent progress), Recurring rules, Fixed Deposits (accrued/maturity), Stock holdings (invested/value/pnl).
- Dashboard: net balance, month income/expense, accounts strip, CC dues, shared contributions, spending by category, upcoming.
- CSV import (paste), Audit log (shared only), Data export, Account deletion, Premium upgrade (mock entitlement), placeholder ad slot for free users.
- Backend: 30/30 E2E tests passing.
- **Apple Sign-In (2026-09):** `POST /api/auth/apple` verifies Apple identity tokens (RS256 vs Apple JWKS, issuer/audience/expiry checks, `APPLE_AUDIENCES` = bundle id + host.exp.Exponent), upserts users by `apple_sub`, links by email to existing Google accounts, 7-day sessions. Frontend: native `AppleAuthenticationButton` on `login.tsx` (iOS only, availability-gated), `signInWithApple` in `src/auth.tsx`, `usesAppleSignIn: true` in `app.json`. Tests in `backend/tests/test_apple_auth.py` (mocked JWKS). Button flow requires a real iOS device + dev/production build.
- **Code health pass (2026-10):** backend split into modules (`db.py`, `utils.py`, `fx.py`, `router.py`, `security.py`, `models.py`, `seeds.py`, `routes/` package); `server.py` is now a slim entrypoint re-exporting `db/new_id/now_utc` for tests. E2E tests stabilized under pytest-xdist (self-contained fixtures, email retry). Findings report: `/app/memory/code_review_findings.md` (2 pre-existing bugs deferred to Phase 2: account-deletion re-login 500; edit-tier members can't GET single transaction).

## Backlog / Remaining
- **P0 (pre-store):** real Stripe (web) + Apple IAP + Google Play Billing wired to entitlement; store compliance pass.
- **P1:** Bill Scan (image/PDF → Gemini/Claude extraction, review table, no persistence); live FX via exchangerate.host; CSV file picker (not just paste); subcategory UI depth; edit (not just delete) for transactions/accounts.
- **P2:** offline-first + sync engine + conflict review; advanced settle-up ledger; deeper stock price feeds; AdMob/AdSense real units; biometric app lock.

## Next Tasks
- Wire RevenueCat/Stripe when user is ready to monetize.
- Add Bill Scan premium flow.
