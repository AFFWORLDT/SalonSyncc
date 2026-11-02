# Plan 5 — Super admin panel Implementation Plan

> Executed inline (user preference: fast, no subagent per task).

**Goal:** A super admin panel at `admin.salonkit.online` (`/platform` on workers.dev/localhost) to run every salon: overview, salons table and detail (plan, trial/grace extend, manual activate, feature overrides with reason, staff-limit override, deactivate/reactivate/delete, email log, audit), "Log in as salon" support mode, plan matrix editor, expired queue, platform users and platform audit.

**Architecture:** A separate Hono router `/api/platform/*` with its own signed cookie `ss_platform` (payload `{pid, v, exp, k:"platform"}`), accepted only on the admin host (or when `ROOT_DOMAIN` is empty). Every change writes `platform_audit` and calls `invalidateFeatures`. Impersonation reuses the handoff pattern: a 60 s single-use code (sha-256 stored in `support_sessions`) exchanged on the salon's host at `POST /api/auth/support` for a 2-hour owner session carrying `sp` (platform user id); `/api/me` returns `support: true` and the dashboard shows a red "Support mode" banner. The UI lives in `apps/web` under `/platform/*` with its own shell (no tenant AuthProvider calls).

**Tech Stack:** Hono + D1, Next 16 static export, existing UI kit.

**Spec:** `docs/superpowers/specs/2026-11-02-salonsync-saas-design.md` §4.1, §5.1, §7.2, §7.4

## Global Constraints
- No global master password; support access only through audited impersonation (§7.4).
- Platform session never works on salon hosts; salon sessions never work on the admin host (existing `wrong_org`).
- Roles: `owner` may change anything; `support` may read and start support sessions only.
- Free plan: ≤45 D1 statements per invocation; each list endpoint is one statement.
- No secrets in git; the first platform owner is created with `scripts/platform-user.ts` printing SQL (password shown once).

## Review Focus
1. A salon `ss_session` cookie sent to `/api/platform/*` → 401 (and the reverse).
2. Support code reused, expired, or for another salon's host → 401.
3. Support role trying a write → 403.
4. Feature override / plan matrix change is visible on the salon's next `/api/me` in the same isolate (cache invalidated).
5. Delete requires typing the slug; deleted salons cannot sign in.

## Tasks
1. **Migration 0012 + platform session + auth** — `orgs.limits_override_json`; `core/platform-session.ts` (issue/read/clear `ss_platform`, 12 h); `platform/admin/auth.ts` login (email+password, IP rate limit 10 per window), logout, `/me`, `/me/password`; `scripts/platform-user.ts`. Tests: login ok/fail/locked, wrong host 401, tenant cookie rejected, session_version bump signs out.
2. **Salons API** — list (filters status/plan/q, one statement with staff count, 30-day sales, last activity), detail, plan change, extend trial/grace, activate (manual, until), deactivate/reactivate/delete (slug confirm), feature override with reason, limits override, bulk (expired queue). `limitsOverride` folded into `Org` and `computeFeatures`. Tests per action incl. audit rows and `/api/me` reflecting the change.
3. **Plans + users + audit + overview API** — plans GET/PUT (matrix, price, limits, active; `invalidateAllFeatures`), platform users list/create/delete (owner only, not self), audit list, overview counts. Tests.
4. **Support mode** — `POST /api/platform/orgs/:id/support` → `{url}`; `POST /api/auth/support`; session `sp` + 2 h ttl; `/api/me` `support`. Tests: happy path, reuse, expiry, wrong host, audit rows.
5. **Web panel** — `/platform/login`, overview, salons, salon detail, plans matrix, expired queue, users, audit; admin host redirects to `/platform/`; support banner in the salon dashboard. Tests (vitest) for the pure helpers + typecheck/build.
6. **Deploy** — migrate remote, deploy app, create the first owner, smoke test admin.salonkit.online.
