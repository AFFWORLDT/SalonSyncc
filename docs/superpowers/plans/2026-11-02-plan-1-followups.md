# Plan 1 follow-ups (carry into Plan 2+)

These come from the Plan 1 per-task reviews and the final review. Each was triaged as "can wait", with a deadline where one applies.

## Must land in Plan 2
- [x] **Login rate limiting / lockout:** port FM `limits.ts` onto `login_failures`, scoped by org. Required before any deploy. *(Done in Plan 2a.)*
- [x] **SQL guard:**
  - [x] Add every new tenant table to `TENANT_TABLES`.
  - [x] Point `scanSource` (`apps/api/test/sql-guard.ts`) at all of `src/data/tenant/*` (Plan 2a; not `src/**`).
  - [x] Re-include `login_failures` in the per-table coverage check once it has statements.
- [x] **Cross-org endpoint tests** for every ported module (spec §13), including `settings()`. *(Done in Plan 2a: registry plus a coverage test over `app.routes`.)*
- [x] **Composite FKs** so a child row can't reference another salon's user or customer:
  - `CREATE UNIQUE INDEX ... ON users(org_id, id)`.
  - Child tables use `FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)`. *(Done in Plan 2a; FM `ON DELETE SET NULL` actor columns are plain integers by ruling.)*
- [x] **Public tenant routes** (receipt `/r`, `/rate`, public services API): give them a separate, explicitly allow-listed host→org mount registered before `tenantApi`. Extend the route-enumeration test's exclusions deliberately, not by prefix. *(Done in Plan 2a: `publicApi` at `/api/public`.)*
- **Serve the dashboard same-origin with the API:** the origin check compares Origin to the request host. A dev proxy that rewrites Host, or a separate frontend Worker, needs an explicit allow-list.
- **Feature gating:** mount module routers with `module.use("*", requireFeature(key))`. Unknown sub-paths under a gated module return 401, not 404 (fails closed, accepted).
- **Tests for write rules:**
  - The allow-list boundaries `/api/mex` and `/api/billingx` are blocked.
  - PUT, PATCH and DELETE are blocked for expired orgs.
  - HEAD and OPTIONS pass.
- [x] **Seed:** extend the delete list in `scripts/seed-local.sql` with every new `org_id` table. *(Done in Plan 2a.)*

## Later plans
- **Plan 5 (super admin):**
  - Call `invalidateFeatures(orgId)` after every plan or override change. It is per-isolate only, so other isolates may stay stale for up to 60 s; use KV versioning if that matters.
  - Trial features come from the `PLAN_DEFAULTS` constant, not from the `pro_max` rows in D1. Decide whether editing the Pro Max matrix should also change trials.
  - `ss_platform` sessions and support impersonation.
- **Plan 6 (lifecycle):** `makeOrg` needs a `trialEndsAt` option.
- **Plan 7 (billing):** `/api/billing/*` is already on the write-guard allow-list.
- **"Log out everywhere":** bump `session_version`. Logout today only clears the cookie.
- **Plan data:** `0003_seed_plans.sql` is frozen. Plan or price changes go in a new migration or the super admin UI.
- **Polish:**
  - A malformed `max_staff` JSON value becomes `null` (unlimited); consider `0`.
  - `test/env.d.ts` duplicates `Env`.
  - Test probes (`_whoami`, `_probe/*`) are registered in production behind auth and return 404 there.


## From the Plan 2a final review: do at the start of Plan 3
- **Stale avatar after clear and re-upload:** `clearAvatar` resets `avatar_v` to 0, so a new upload gets the same immutable URL again.
  - Fix: never reset `avatar_v`; always increment it.
  - Derive `has_avatar` from `avatar IS NOT NULL` instead of from `v`.
- **`toUser` for inactive staff:** return `avatar_url: null`, because the public avatar route now 404s for inactive users.
- **`PUT /api/sales/:id`:** a foreign-key failure (a service deleted mid-request) currently returns 500. Map it to 400 with "One of the services no longer exists", as create already does.

## Carried into Plan 2b
- **Edit and delete hooks** next to `hooks.afterSale`, for FM's "your sale was changed" barber push.
- **Cron pruning** of `rate_hits` and `login_failures`.
- **Org scoping in WhatsApp and push:**
  - resolve the WhatsApp webhook's org from `phone_number_id`
  - scope `adminIds()` by org
  - remove the `MAX(id)` lookup from `wa_campaigns`
- **Free plan:** no Queues. Send email via `waitUntil`, and have the hourly cron retry rows in `email_log` with status `failed` (spec D19).
