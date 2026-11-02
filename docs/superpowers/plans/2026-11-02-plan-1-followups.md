# Plan 1 follow-ups (carry into Plan 2+)

These come from the Plan 1 per-task reviews and the final review. Each was triaged as "can wait", with a deadline where one applies.

## Must land in Plan 2
- **Login rate limiting / lockout:** port FM `limits.ts` onto `login_failures`, scoped by org. Required before any deploy.
- **SQL guard:**
  - Add every new tenant table to `TENANT_TABLES`.
  - Point `scanSource` (`apps/api/test/sql-guard.ts`) at all of `src/**`.
  - Re-include `login_failures` in the per-table coverage check once it has statements.
- **Cross-org endpoint tests** for every ported module (spec §13), including `settings()`.
- **Composite FKs** so a child row can't reference another salon's user or customer:
  - `CREATE UNIQUE INDEX ... ON users(org_id, id)`.
  - Child tables use `FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)`.
- **Public tenant routes** (receipt `/r`, `/rate`, public services API): give them a separate, explicitly allow-listed host→org mount registered before `tenantApi`. Extend the route-enumeration test's exclusions deliberately, not by prefix.
- **Serve the dashboard same-origin with the API:** the origin check compares Origin to the request host. A dev proxy that rewrites Host, or a separate frontend Worker, needs an explicit allow-list.
- **Feature gating:** mount module routers with `module.use("*", requireFeature(key))`. Unknown sub-paths under a gated module return 401, not 404 (fails closed, accepted).
- **Tests for write rules:**
  - The allow-list boundaries `/api/mex` and `/api/billingx` are blocked.
  - PUT, PATCH and DELETE are blocked for expired orgs.
  - HEAD and OPTIONS pass.
- **Seed:** extend the delete list in `scripts/seed-local.sql` with every new `org_id` table.

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
