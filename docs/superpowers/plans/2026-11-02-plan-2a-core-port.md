# SalonStation Plan 2a: Port FM Core + Money Modules, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every FM Salon API feature except WhatsApp, push, announcements, ratings and audit viewing runs multi-tenant on the Plan 1 foundation. That covers settings, staff, services, sales, bills and receipts, customers, expenses, reports and the ledger. All SQL is org-scoped, all FM hardcodes become per-org settings, and every route sits behind its feature key.

**Architecture:**
- **Data and routes:**
  - SQL lives only in `apps/api/src/data/tenant/<module>.ts`, as factories `xxxRepo(db, orgId)`.
  - Routes live in `apps/api/src/tenant/<module>/routes.ts`. Each is a Hono sub-router with `use("*", requireFeature(key))`, mounted on `tenantApi`.
  - Pure FM helpers are ported into `apps/api/src/lib/`, parametrised by an `OrgClock` and an `OrgLocale` instead of Dubai/AED/+971 constants.
- **Behaviour** copies FM's `gents-salon/api/src/routes.ts` handler by handler. The differences from FM are listed in each task.

**Tech Stack:** As Plan 1 (Hono 4, D1, `@cloudflare/vitest-plugin`, npm workspaces). Adds `packages/contract` (shared API types, used by the Plan 3 web app).

**Spec:** `docs/superpowers/specs/2026-11-02-salonsync-saas-design.md`. Read §4.2, §5.2, §7.1 and §8.

**Reference (read before every task):**
- `docs/superpowers/research/2026-11-02-fm-port-inventory.md`: FM final schema, routes, helpers and tenancy hazards. Task text cites its sections as INV§n.
- `docs/superpowers/plans/2026-11-02-plan-1-followups.md`
- FM source (read-only): `/Users/laxmikant/Desktop/ERP/gents-salon/api/src/`

**Roadmap:**
- **Plan 2b:** audit viewer, push, notifications, announcements, ratings, WhatsApp, campaigns, PDF bill, cron.
- **Plan 2c:** FM data import.
- **Plan 3:** web dashboard.

## Global Constraints

- **All Plan 1 Global Constraints still apply.** Wrangler runs on the Affworld0 account only, nothing is deployed, `ss_session` is the session cookie, timestamps are in ms, money is in integer minor units, and every tenant table has `org_id TEXT NOT NULL REFERENCES orgs(id)`, with indexes leading on `org_id` and uniqueness scoped per org.
- **Admin role:** `isAdmin(user) = user.role === "owner" || user.role === "admin"`. FM's `admin` maps to this. FM's `barber` stays `barber`.
- **API paths match FM's,** under `/api`, with one exception: FM `GET /auth/me` becomes the existing `GET /api/me`, which gains `today` and the full `settings`. Response shapes match FM `contract.ts` unless a task says otherwise. Money fields keep FM's names, but are now in the org's minor units.
- **VAT and commission are both percents** (`vat_rate` 5 means 5%, `commission_pct` 20 means 20%). FM's `vatOf(amount, 0.05)` becomes `vatOf(amount, 5)`. Plan 2c converts FM's stored fractions.
- **Business day:** computed from `org_settings.timezone` (IANA) and `org_settings.day_start_hour`. It must be correct across DST. Format is `YYYY-MM-DD`.
- **Bill number:** `${bill_prefix}-${YYYYMMDD}-${seq padded to 3}`, using counter `bill_${YYYYMMDD}` per org. Walk-in label is `Customer ${n}` from counter `cust_${YYYYMMDD}`.
- **No `SELECT MAX(id)`** anywhere (INV§8.2):
  - A row inserted in one batch with children uses a per-row `uid TEXT NOT NULL` (`randomToken(9)`), with `UNIQUE(org_id, uid)`.
  - Child or audit statements reference it as `(SELECT id FROM t WHERE org_id = ? AND uid = ?)`.
  - Sales keep `(org_id, bill_no)` as their unique key.
- **Child-to-parent references** to tenant rows use composite FKs `FOREIGN KEY (org_id, x_id) REFERENCES parent(org_id, id)`, backed by `UNIQUE INDEX parent(org_id, id)`.
- **Ledger lines are always posted** (sales, expenses, company expenses, payouts, transfers, openings), whatever the `ledger` feature says. The feature only gates the ledger routes. This is FM lesson 0012: balances are only meaningful if every line exists.
- **Feature keys per router:**

  | Feature key | Routes |
  |---|---|
  | `core_sales` (always on) | settings, me, staff, services, sales, receipts, `/reports/me`, `/reports/overview`, customers autocomplete for barbers |
  | `expenses` | expenses and company expenses |
  | `daily_sheet` | `/reports/daily` |
  | `reports_advanced` | `/reports/monthly` |
  | `ledger` | ledger routes |
  | `customers_crm` | admin customer list and detail |
  | `public_services_api` | the public services list |

- **Public routes** (no session) live on a separate `publicApi` mounted at `/api/public`, before `tenantApi`:
  - The org is resolved from the host's tenant slug. On workers.dev it comes from `?org=<slug>` instead.
  - Receipt routes take the org from the sale token's row instead.
  - Public routes are rate-limited per IP in the global `rate_hits` table.
- **Error shape** is `{error, code?}`. Barber-forbidden returns 403 `{error:"You don't have access to this"}`, using FM's text.

## Review Focus

1. **Cross-salon IDs:** org B's admin calling any id-taking route (`/sales/:id`, `/users/:id`, `/services/:id`, `/payouts/:id`, `/transfers/:id`, `/company-expenses/:id`, `/customers/:id`, `/ledger/barbers/:id`) with an org-A id must get 404. They must never read or change A's row, and never create a child row that points at A's row (for example, a sale with `barber_id` from org A).
2. **Business day across time zones:** a sale at 03:30 local time belongs to the previous business day when `day_start_hour` is 4. This must hold for `Asia/Dubai`, `Asia/Kolkata` (+05:30) and `Europe/London` on its DST change days.
3. **Same phone or username in two salons:** two orgs can each have customer phone `0501234567` and username `sam`. Customer upsert, autocomplete and stats in one org never touch the other.
4. **Concurrent creates:** two orgs creating company expenses, payouts, transfers or services in parallel must each get their own row id back in the response and in the audit and ledger rows. This is the regression test for the old `MAX(id)` pattern.
5. **Barber limits:** a barber can only see and edit their own sales, only on the same business day, and can only add expenses when `can_add_expense` is set. Staff creation beyond `limits.max_staff` (count active non-owner users) returns 409 `{error:"Staff limit reached for your plan", code:"staff_limit"}`.

Each has tests in the owning task, marked **(RF1)–(RF5)**. The cross-org registry in Task 1 is where RF1 accumulates.

---

## File Structure (new or changed)

```
packages/contract/src/index.ts          FM contract.ts types, ported (Task 1, grown per task)
apps/api/migrations/0004_core.sql        org_settings FM cols, users FM cols, rate_hits, composite-FK parents, services
apps/api/migrations/0005_sales.sql       customers, sales, sale_items, ledger_entries, audit_log
apps/api/migrations/0006_expenses.sql    expenses, company_expenses (created in Task 8, routes in Task 9)
apps/api/migrations/0007_ledger.sql      barber_payouts, money_transfers
apps/api/src/lib/clock.ts                OrgClock, businessDay, businessDayStart, dayStamp, addDays, daysOfMonth, prevMonth
apps/api/src/lib/money.ts                toMinor, signedMinor, commissionOf, vatOf, barberNet, shopProfit, DAY_RE, MONTH_RE
apps/api/src/lib/phone.ts                canonicalPhone(raw, callingCode), whatsappDigits(phone, callingCode)
apps/api/src/lib/audit.ts                changedFields, userSnapshot (pure; SQL builder lives in data/tenant/audit.ts)
apps/api/src/lib/ledger.ts               saleLines … openingLines, needsRepost (pure)
apps/api/src/lib/limits.ts               loginLimits, isLocked, PUBLIC_LIMITS, minuteWindow
apps/api/src/core/roles.ts               isAdmin, requireAdmin middleware, forbidden()
apps/api/src/core/public.ts              publicApi, resolvePublicOrg, publicRateLimit
apps/api/src/data/infra.ts               rate_hits SQL (global infra table, not tenant)
apps/api/src/data/tenant/{settings,users,services,customers,sales,audit,ledger,expenses,reports,payouts}.ts
apps/api/src/tenant/{settings,staff,services,sales,customers,reports,expenses,ledger}/routes.ts
apps/api/test/cross-org.test.ts          table-driven RF1 sweep over a registry
apps/api/test/cross-org-cases.ts         registry each task appends to
apps/api/test/sql-guard.test.ts          now scans every file under src/data/tenant/
```

---

### Task 1: Groundwork: schema 0004, roles, public mount, contract package, cross-org harness

**Files:**
- Create: `migrations/0004_core.sql`, `src/core/roles.ts`, `src/core/public.ts`, `src/data/infra.ts`, `packages/contract/{package.json,src/index.ts}`, `test/cross-org-cases.ts`, `test/cross-org.test.ts`
- Modify: `src/data/tenant.ts` (move to `src/data/tenant/core.ts` with a re-export, so old imports keep working), `test/sql-guard.test.ts` (scan every `src/data/tenant/*.ts`; `TENANT_TABLES` grows as migrations add tables), `src/index.ts` (mount `publicApi` at `/api/public` before `tenantApi`), `test/auth.test.ts` (the enumeration test also excludes `/api/public/*` explicitly, and asserts each excluded route is registered on `publicApi`)

**Interfaces:**
- **Migration 0004:**
  - `ALTER TABLE org_settings ADD` the FM columns from INV§1 settings: `salon_name_ar, tagline, default_commission_pct REAL NOT NULL DEFAULT 0, quick_amounts TEXT NOT NULL DEFAULT '15,20,25,30,35,50', thank_you_text TEXT NOT NULL DEFAULT 'Thank you {name} for visiting {salon}! Your bill: {amount}. {link}', receipt_footer TEXT, notify_sales INTEGER NOT NULL DEFAULT 1, notify_sale_min INTEGER NOT NULL DEFAULT 0, notify_summary INTEGER NOT NULL DEFAULT 1, summary_hour INTEGER NOT NULL DEFAULT 23, notify_reminder INTEGER NOT NULL DEFAULT 1, reminder_hour INTEGER NOT NULL DEFAULT 13, notify_barber_changes INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL DEFAULT 0`. The `wa_*` columns come in Plan 2b.
  - `ALTER TABLE users ADD phone TEXT, commission_pct REAL, sort_order INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, avatar BLOB, avatar_type TEXT, avatar_v INTEGER NOT NULL DEFAULT 0, can_add_expense INTEGER NOT NULL DEFAULT 0`.
  - `CREATE UNIQUE INDEX users_org_id ON users(org_id, id)`.
  - `services(id INTEGER PK AUTOINCREMENT, org_id …, uid TEXT NOT NULL, category, name, description, price INTEGER NOT NULL CHECK(price>=0), sort_order, active, created_at, updated_at, UNIQUE(org_id, uid))`, plus `UNIQUE INDEX services_org_id(org_id, id)` and `INDEX services_order(org_id, sort_order, id)`.
  - `rate_hits(key TEXT PRIMARY KEY, window INTEGER NOT NULL, n INTEGER NOT NULL)`. This is a global infra table: no `org_id`, and it is not in `TENANT_TABLES`.
- **Roles** (`core/roles.ts`):
  - `isAdmin(u: UserRow): boolean`
  - `requireAdmin: MiddlewareHandler<AppEnv>`, which returns 403 `{error:"You don't have access to this"}`
  - `forbidden(): HttpError`
- **Public mount** (`core/public.ts`):
  - `publicApi: Hono<AppEnv>`
  - `resolvePublicOrg(c): Promise<Org|null>`. It tries the host tenant slug, then `?org=` when `ROOT_DOMAIN` is empty. It returns null for unknown, deactivated or deleted orgs.
  - `publicRateLimit(bucket: "pub"|"pdf")` middleware, using `PUBLIC_LIMITS` and `minuteWindow` from Task 2's `lib/limits.ts`. Tasks 1 and 2 may land in either order, so if limits.ts doesn't exist yet, define those constants here and Task 2 moves them. Over the limit, it returns 429 `{error:"Too many requests"}` with a `Retry-After` header.
- **Contract package:** `packages/contract` (`@ss/contract`) contains FM `contract.ts` copied, with comments de-FM'd (AED becomes "minor units", Dubai becomes "org timezone"). `Role` becomes `"owner"|"admin"|"barber"`. `Me` adds `org`, `features` and `limits`, matching `/api/me`.
- **Cross-org registry** (`test/cross-org-cases.ts`):

  ```ts
  export interface CrossOrgCase { name: string; method: string; path: (id: number) => string; body?: unknown; seed: (orgId: string) => Promise<number> /* returns an id in that org */ }
  export const CASES: CrossOrgCase[] = [];
  ```

  `cross-org.test.ts` does this for each case:
  1. Seed in org A with plan `pro_max`.
  2. Log in as org B's owner (`pro_max`).
  3. Call the route with A's id and expect 404.
  4. Re-read A's row through A's repo and expect it unchanged.

  The harness must pass with 0 cases and must fail on purpose if a case returns 200. Include one self-test case using a deliberately unscoped throwaway route registered only in the test.

- [ ] **Step 1: Write the failing tests.**
  - `schema.test.ts`: the users unique `(org_id,id)` index exists; `services` is uid-unique per org; `rate_hits` exists.
  - `public.test.ts`:
    - `resolvePublicOrg` covers host tenant, `?org=` on empty `ROOT_DOMAIN`, unknown, and deactivated.
    - The limiter returns 429 after `PUBLIC_LIMITS.pub` hits in one minute from one IP (`CF-Connecting-IP` header).
  - `roles.test.ts`: barber gets 403; owner and admin pass.
  - The cross-org harness self-test.
  - `sql-guard`: scans `src/data/tenant/*.ts`, checks a count greater than 0 per file, and asserts `rate_hits` SQL in `src/data/infra.ts` is not flagged.
- [ ] **Step 2:** Run `npm test -w @ss/api`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run root `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): schema 0004, roles, public mount, contract, cross-org harness`.

---

### Task 2: Org-parametrised pure helpers (clock, money, phone, ledger, audit, limits)

**Files:**
- Create: `src/lib/{clock,money,phone,ledger,audit,limits}.ts` and `test/lib/*.test.ts`
- Port from FM `money.ts`, `ledger.ts`, `audit.ts`, `limits.ts` and their tests (INV§3, INV§4)

**Interfaces:**
- **Clock** (`clock.ts`):
  - `interface OrgClock { timezone: string; dayStartHour: number }`
  - `businessDay(ms: number, clock: OrgClock): string`
  - `businessDayStart(day: string, clock: OrgClock): number`, the epoch ms at which that business day starts
  - `dayStamp(day): string` (`YYYYMMDD`)
  - `addDays(day, n)`, `daysOfMonth(month)`, `prevMonth(month)`
  - `localHour(ms, clock): number`
  - Use `Intl.DateTimeFormat(…, {timeZone, hourCycle:"h23", year, month, day, hour, minute})` parts.
  - `businessDayStart`: find the instant whose local wall time is `day` at `dayStartHour:00`. Start from UTC midnight minus the offset, correct by one iteration using the zone offset at that instant, and on a DST gap use the first valid instant after it.
- **Money** (`money.ts`):
  - `toMinor(v, minor = 100): number|null`: positive, at most 2 decimals, cap of 1,000,000 major units (FM `toFils`)
  - `signedMinor`
  - `commissionOf(amount, pct)`
  - `vatOf(amount, ratePct)`: VAT-inclusive; `vatOf(10500, 5) === 500`
  - `barberNet`, `shopProfit`
  - `DAY_RE`, `MONTH_RE`
- **Phone** (`phone.ts`):
  - `canonicalPhone(raw: string, callingCode: string): string|null`
    - When `callingCode === "971"`, FM's rules exactly: stored as `05XXXXXXXX` or `0[234679]XXXXXXX`, foreign numbers as `+digits`.
    - For other codes, store `+<cc><national without leading 0>`. A number starting with `+` or `00` is kept as `+digits`. Fewer than 6 or more than 15 digits returns null.
  - `whatsappDigits(phone, callingCode)`
- **Ledger** (`ledger.ts`): `saleLines`, `expenseLines`, `companyExpenseLines`, `payoutLines`, `transferLines`, `openingLines`, `needsRepost`, with FM signatures and memo strings, pure. The `postStmts`/`reverseStmts` SQL moves to `data/tenant/ledger.ts` in Task 6.
- **Audit** (`audit.ts`): `changedFields`, `userSnapshot`, and the `AuditEntity`/`AuditAction` types.
- **Limits** (`limits.ts`):
  - `LOGIN_WINDOW_MS`
  - `loginLimits(orgId, username, ip)`, with keys `ip:<ip>` (max 20), `u:<orgId>:<username>|<ip>` (8) and `u:<orgId>:<username>` (50)
  - `PUBLIC_LIMITS`, `minuteWindow`, `isLocked(count, max)`

- [ ] **Step 1: Port FM's tests** (`money.test.ts`, `ledger.test.ts`, `audit.test.ts`, `limits.test.ts`, and the pure parts of `panels.test.ts`) to vitest.
  - Dubai assertions use clock `{timezone:"Asia/Dubai", dayStartHour:4}` and calling code `971`, with expected values unchanged from FM.
  - **(RF2)** Add these cases:

    ```ts
    const IN = {timezone:"Asia/Kolkata", dayStartHour:4}, UK = {timezone:"Europe/London", dayStartHour:4};
    expect(businessDay(Date.parse("2026-11-02T03:30:00+05:30"), IN)).toBe("2026-11-01");
    expect(businessDay(Date.parse("2026-11-02T04:00:00+05:30"), IN)).toBe("2026-11-02");
    expect(businessDayStart("2026-03-29", UK)).toBe(Date.parse("2026-03-29T04:00:00+01:00")); // BST starts 01:00 that day
    expect(businessDayStart("2026-10-25", UK)).toBe(Date.parse("2026-10-25T04:00:00+00:00")); // GMT resumes
    expect(businessDayStart("2026-11-02", {timezone:"Asia/Dubai", dayStartHour:4})).toBe(Date.parse("2026-11-02T04:00:00+04:00"));
    expect(businessDayStart("2026-11-02", {timezone:"Asia/Dubai", dayStartHour:11})).toBe(Date.parse("2026-11-02T11:00:00+04:00")); // FM "T0" bug fixed
    expect(canonicalPhone("9876543210","91")).toBe("+919876543210");
    expect(canonicalPhone("09876543210","91")).toBe("+919876543210");
    expect(vatOf(10500, 5)).toBe(500);
    ```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lib): org-parametrised clock, money, phone, ledger, audit, limits`.

---

### Task 3: Login lockout, password change, settings, `/api/me` today

**Files:**
- Create: `src/data/tenant/settings.ts`, `src/tenant/settings/routes.ts`
- Modify: `src/platform/auth.ts` (lockout), `src/data/tenant/core.ts` (`login_failures` statements, user password update), `src/platform/me.ts` (adds `today` and the full settings), `src/data/infra.ts` (IP limiter on `rate_hits`)
- Test: `test/lockout.test.ts`, `test/settings.test.ts`

**Interfaces:**
- **Login lockout:**
  - IP limiting uses `rate_hits` with key `login-ip:<ip>` and a 15-minute window (max 20).
  - Username limiting uses `login_failures` (org-scoped rows `{org_id,key,at}`), counting rows inside `LOGIN_WINDOW_MS`.
  - When locked, respond 429 `{error:"Too many attempts. Try again in a few minutes."}`.
  - A successful login deletes that username's keys for the org.
  - Re-include `login_failures` in the SQL guard's per-table coverage.
- **`PUT /api/me/password`**, body `{current, next}`. `next` must be at least 6 characters. A wrong `current` returns 400 `{error:"Current password is wrong"}`. On success it bumps `session_version` and reissues the cookie (FM routes.ts:420-432).
- **`GET /api/settings`** (any user) returns `Settings` (contract), mapped from `org_settings`. Rates are in percent. It includes `timezone`, `day_start_hour`, `currency`, `locale`, `phone_country` and `bill_prefix`.
- **`PUT /api/settings`** (admin):
  - FM validations from routes.ts:2041-2155: TRN must be exactly 15 digits when `phone_country` is `971`; for other countries it is free text up to 40 characters. Hours are 0–23. `quick_amounts` is CSV with each value positive and at most 1,000,000.
  - New fields: `timezone` (validated with `Intl.supportedValuesOf("timeZone")` or a try/catch on `Intl.DateTimeFormat`), `day_start_hour` (0–12), `bill_prefix` (`^[A-Z0-9]{1,6}$`), `currency` (`^[A-Z]{3}$`), `locale`.
  - Writes an audit row (entity `settings`) and calls `invalidateFeatures(orgId)` only if something feature-related changed. Nothing is today, so it does not call it.
  - Use **named columns** in the UPDATE, not positional binds (INV§8.5).
- **`GET /api/me`** adds `today: businessDay(Date.now(), clockOf(settings))` and returns the full `settings`.

- [ ] **Step 1: Write the failing tests.**
  - 8 bad passwords for one username lock that username, and a 9th attempt with the right password gets 429.
  - The same username in org B is not locked **(RF3)**.
  - A success clears the counter.
  - Password change: wrong current gives 400; success makes the old cookie get 401 and the new cookie get 200.
  - A barber's `PUT /settings` gets 403.
  - A bad timezone gives 400.
  - `today` uses the org timezone: an Asia/Kolkata org at a fixed `Date.now` mocked via `vi.useFakeTimers`. Note that fake timers inside the workers pool may need `vi.setSystemTime`.
  - Cross-org: no ids. Settings rows are keyed by the session org, and a test confirms org B's `PUT` does not change org A's row.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): login lockout, password change, settings`.

---

### Task 4: Staff (users) CRUD, reset-password, avatars, staff limit

**Files:**
- Create: `src/data/tenant/users.ts`, `src/data/tenant/audit.ts` (`auditStmt(db, orgId, …)` with FM fields plus `org_id`), `src/tenant/staff/routes.ts`
- Test: `test/staff.test.ts`, plus cases in `cross-org-cases.ts`

**Interfaces:**
- **Routes**, from FM routes.ts:1784-1957 (all admin except `/me/avatar`):
  - `GET /api/users`
  - `POST /api/users`, with `UserInput`. A duplicate username in the same org gives 409 `{error:"Username is taken"}`.
  - `PUT /api/users/:id`, which bumps `session_version` when a user is deactivated.
  - `POST /api/users/:id/reset-password`, which also clears that user's `login_failures`.
  - `DELETE /api/users/:id`, following FM's rule: deactivate if the user has sales, expenses, payouts or ledger rows; otherwise delete, child rows first.
  - `PUT/DELETE /api/me/avatar` (any user) and `PUT/DELETE /api/users/:id/avatar` (admin): webp, jpeg or png, at most 200 KB.
  - Public `GET /api/public/avatar/:uid/:v`, where `:uid` is the user's numeric id **and** the org comes from `resolvePublicOrg`. It is served immutable.
  - The `avatarUrl` helper returns `/api/public/avatar/${id}/${v}`, or null.
- **Protections:**
  - The owner cannot be deactivated, deleted or demoted by anyone. That returns 400 `{error:"The owner can't be changed here"}`.
  - Roles allowed in `UserInput` are `admin` and `barber`.
- **Staff limit (RF5):** `POST /api/users` and reactivation via `PUT` (`active` false to true) count active users with `role != 'owner'`. If the count is `>= tenant.limits.max_staff` (null means unlimited), respond 409 `{error:"Staff limit reached for your plan", code:"staff_limit"}`.
- **Audit:** every write adds an audit row via `auditStmt`, whose IdExpr subselect is `(SELECT id FROM users WHERE org_id = ? AND username = ?)` (INV§8.3).

- [ ] **Step 1: Write the failing tests.**
  - CRUD happy paths.
  - The same username in two orgs **(RF3)**.
  - A free-plan org (max_staff 2) can create 2 barbers; the 3rd gets 409 `staff_limit`, and reactivation over the limit also gets 409 **(RF5)**.
  - The owner is protected.
  - Deactivation logs the user out.
  - Avatar upload over 200 KB gets 400; the public avatar from another org's host gets 404.
  - **(RF1)** Cross-org cases are registered for `PUT /users/:id`, `DELETE /users/:id`, `POST /users/:id/reset-password` and `PUT /users/:id/avatar`.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): staff management with plan staff limit`.

---

### Task 5: Services and the public services API

**Files:**
- Create: `src/data/tenant/services.ts`, `src/tenant/services/routes.ts`
- Modify: `src/core/public.ts` (add the services route)
- Test: `test/services.test.ts`, plus cross-org cases

**Interfaces:**
- **Routes**, from FM routes.ts:1959-2035:
  - `GET /api/services` (any user; `?all=1` admin only, includes inactive).
  - `POST`, `PUT /:id` and `DELETE /:id` (admin).
  - DELETE nulls `sale_items.service_id` for that org first. The `sale_items` table arrives in Task 6, so DELETE checks `sqlite_master` once, or Task 6 adds that statement. Implementer's choice, but whichever it is must be tested by Task 6.
  - `POST` inserts with a `uid` and audits via `(SELECT id FROM services WHERE org_id=? AND uid=?)`. **No `MAX(id)` (RF4).**
- **Public list:** `GET /api/public/services` returns `{category,name,description,price}[]` of active services, sorted, with CORS `*` and `Cache-Control: public, max-age=60`, behind `publicRateLimit("pub")`.
  - The org must exist **and** have feature `public_services_api` (via `featuresFor`). Otherwise respond 404 `{error:"Not found"}`.
- **Optional starter catalogue:** `POST /api/services/starter` (admin) inserts FM's 16 services from FM migration 0004 (names, categories, prices converted to minor units), only if the org has 0 services. Otherwise it returns 409.

- [ ] **Step 1: Write the failing tests.**
  - CRUD, and barbers see only active services.
  - **(RF4):** `Promise.all` of 10 POSTs across 2 orgs; each response id belongs to its own org, and each audit row's `entity_id` equals its response id.
  - Public API:
    - A pro_max org with the host or `?org=` gets 200 and CORS.
    - A free org gets 404.
    - An unknown org gets 404.
    - The 61st request in a minute gets 429.
  - Starter catalogue inserts 16 once, and the second call gets 409.
  - **(RF1)** Cross-org cases for `PUT/DELETE /services/:id`.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): services and public services API`.

---

### Task 6: Sales: schema 0005, create and list, customers upsert, audit and ledger posting

**Files:**
- Create: `migrations/0005_sales.sql`, `src/data/tenant/{sales,customers,ledger}.ts`, `src/tenant/sales/routes.ts`
- Test: `test/sales-create.test.ts`, plus cross-org cases

**Interfaces:**
- **Migration 0005:** final DDL from INV§1, with `org_id` added. Do not replay FM's rebuilds.
  - `customers`: `UNIQUE(org_id, phone)`, `UNIQUE INDEX (org_id, id)`.
  - `sales`: `UNIQUE(org_id, bill_no)`. `token` stays **globally** UNIQUE (public link). Composite FKs `(org_id, barber_id)` and `(org_id, created_by)` to `users(org_id,id)`, and `(org_id, customer_id)` to `customers(org_id,id)`. `UNIQUE INDEX (org_id,id)`. FM's indexes are prefixed with `org_id`. The WA and review columns are included now (`wa_feedback_at`, `wa_feedback_reminded_at`, `review_clicked_at`) so Plan 2b doesn't need to alter `sales`.
  - `sale_items`: `org_id`, with composite FKs to `sales(org_id,id)` and `services(org_id,id)`.
  - `ledger_entries`: INV§1 columns plus `org_id`. Composite FKs for `barber_id`/`actor_id`. Indexes `(org_id, book, day)`, `(org_id, source, source_id)` and `(org_id, barber_id, day)`.
  - `audit_log`: INV§1 columns plus `org_id`, with indexes `(org_id, entity, entity_id)` and `(org_id, at)`.
- **Ledger data layer** (`data/tenant/ledger.ts`): `ledgerRepo(db, orgId).postStmts(source, sourceId | IdExpr, ref, actorId, lines)` and `.reverseStmts(source, sourceId, actorId)`. Live-line selection is scoped by `org_id` (INV§8.4).
- **`POST /api/sales`**, behaviour from FM routes.ts:532-787:
  - Uses `resolveItems` (max 30 items, qty cap 20, catalogue price override) and the `upsertCustomer` rename rule (an admin overwrites the name; a barber only fills it in).
  - Commission comes from the barber's `commission_pct`, falling back to `default_commission_pct`.
  - VAT applies only when `vat_enabled`.
  - Day is the business day from the org clock. An admin may pass a past `day` and a `barber_id` from **their own org**; a `barber_id` from another org, or an inactive one, gets 400 `{error:"Choose an active barber"}` **(RF1)**.
  - Bill number and customer label follow Global Constraints.
  - The batch contains: the sale, the items via `(SELECT id FROM sales WHERE org_id=? AND bill_no=?)`, the customer upsert, the audit row and the ledger `saleLines`.
  - Customer stats are refreshed in `waitUntil`.
  - The WhatsApp and push hooks are **no-ops** in Plan 2a: add a `hooks.afterSale(c, sale)` seam that Plan 2b fills.
  - Responds 201 with `Sale`.
- **`GET /api/sales`**: FM filters `day`, `from`, `to`, `barber_id`, `q`, `customer_id`, `payment_mode`, plus paging (max page size 200). Barbers see only their own sales. Returns `Paged<Sale>` with `sum`.
- **Customer autocomplete:** `GET /api/customers` (any user), the barber branch from FM routes.ts:1699-1745. Barbers get recent customers of their own sales. `q` must be at least 3 characters or an exact phone match. The admin full list is Task 9.

- [ ] **Step 1: Write the failing tests.**
  - Bill number `ALP-YYYYMMDD-001`, then `-002`; another org starts at `-001`.
  - The walk-in label is `Customer 1`.
  - Commission and VAT maths in percent.
  - A catalogue price overrides the client price.
  - Over 30 items gets 400.
  - The customer upsert rename rule works.
  - **(RF3)** Org B upserting the same phone creates its own customer.
  - The ledger gets one cash or bank line plus a commission line on the barber book, and the audit row exists with `entity_id` equal to the sale id.
  - A sale at 03:30 org time lands on yesterday's day (Kolkata org) **(RF2)**.
  - An admin with org-A's `barber_id` in org B gets 400 **(RF1)**.
  - A barber's list is only their own.
  - Autocomplete is scoped by org and barber.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): sales create/list with ledger and audit posting`.

---

### Task 7: Sales edit and delete, and the public receipt

**Files:**
- Modify: `src/tenant/sales/routes.ts`, `src/data/tenant/sales.ts`, `src/core/public.ts`
- Test: `test/sales-edit.test.ts`, plus cross-org cases

**Interfaces:**
- **`PUT /api/sales/:id`**, from FM routes.ts:786-893:
  - Barbers may edit only their own sale, and only on the same business day. Otherwise 403.
  - Items are deleted and reinserted.
  - Ledger lines are reversed and reposted only when `needsRepost` says so.
  - Audit records before and after.
  - Customer stats are refreshed for both the old and the new customer.
- **`DELETE /api/sales/:id`**: soft delete (`deleted_at`), with the same permission rules, a ledger reversal, an audit row and a stats refresh.
- **Public receipt** `GET /api/public/receipt/:token`:
  - The org is taken **from the sale row** (global token), not from the host.
  - Returns 404 if the org is deactivated or deleted, or the sale is soft-deleted.
  - Returns FM's `Receipt` with salon branding from that org's `org_settings` (`display_name`, `salon_name_ar`, `tagline`, `address`, `contact_phone`, `trn`, `licence_no`, `receipt_footer`, `logo_url`, `currency`, `locale`, `timezone`).
  - Uses `publicRateLimit("pub")`.

- [ ] **Step 1: Write the failing tests.**
  - A barber can't edit yesterday's sale (403) or another barber's (403).
  - An admin can edit any sale in their org.
  - A money change reverses and reposts ledger lines, and the shop balance stays consistent. A note-only change does not repost.
  - Delete reverses the lines.
  - Receipt:
    - A token from org A on org B's host still returns A's receipt with A's branding. This is by design: the token is the capability.
    - A deleted sale gets 404.
    - A deactivated org gets 404.
  - **(RF1)** Cross-org cases for `PUT` and `DELETE /sales/:id`.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): sale edit/delete and public receipt`.

---

### Task 8: Reports: me, overview, daily sheet, monthly

**Files:**
- Create: `src/data/tenant/reports.ts` (port of FM `reports.ts`, SQL scoped by org), `src/tenant/reports/routes.ts`
- Test: `test/reports.test.ts`

**Interfaces:**
- **Routes**, from FM routes.ts:1673-1695 and reports.ts:
  - `GET /api/reports/me?month` (any user; `core_sales`): `MyReport`
  - `GET /api/reports/overview?from&to` (admin; `core_sales`): `Overview`, keeping FM's 731-day cap and the switch to a monthly series beyond 92 days
  - `GET /api/reports/daily?month` (admin; `daily_sheet`): `DailySheet`
  - `GET /api/reports/monthly?year` (admin; `reports_advanced`): `MonthlyReport`
- **Gating:** the daily and monthly routes are mounted on routers with their own `requireFeature`.
- **Company expenses:** reports read `expenses` and `company_expenses`. Those tables arrive in Task 9, so create them in **this** task's migration `0006_expenses.sql` (moved earlier), and Task 9 only adds the routes.
- **Time:** every function takes the `OrgClock`.

- [ ] **Step 1: Write the failing tests.**
  - Seed sales and expenses in two orgs. Each org's report shows only its own numbers **(RF3)**.
  - `shopProfit` = sales − expenses − commission, matching a hand-computed fixture.
  - A free org calling `/reports/daily` gets 403 `feature_disabled`, and `/reports/monthly` on a pro org gets 200.
  - Day boundaries follow the org clock **(RF2)**.
  - `overview` over more than 92 days returns the monthly series.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): reports scoped per org`.

---

### Task 9: Expenses, company expenses, and the admin customers CRM

**Files:**
- Create: `src/data/tenant/expenses.ts`, `src/tenant/expenses/routes.ts`, `src/tenant/customers/routes.ts` (admin branch)
- Test: `test/expenses.test.ts`, `test/customers.test.ts`, plus cross-org cases

**Interfaces:**
- **Expenses** (feature `expenses`), from FM routes.ts:914-1063:
  - `GET /api/expenses` (barbers see their own).
  - `PUT /api/expenses` (upsert on `(org_id, barber_id, day)`; amount 0 deletes; a barber needs `can_add_expense`, otherwise 403 **(RF5)**). Posts a cash ledger line.
  - `GET`/`POST /api/company-expenses` and `PUT`/`DELETE /:id` (admin), with `paid_from` cash or bank. Inserts use a `uid` (no `MAX(id)`, **RF4**), and each posts ledger and audit rows.
- **Schema** (in 0006, from Task 8): `expenses UNIQUE(org_id, barber_id, day)` with a composite FK to users; `company_expenses` with `uid` and `UNIQUE(org_id, uid)`.
- **Customers CRM** (feature `customers_crm`), from FM routes.ts:1699-1782:
  - The admin branch of `GET /api/customers`: a full paged list with visits, spent and `wa_opt_out`.
  - `GET /api/customers/:id`: `CustomerDetail`, scoped by org.
  - Because `GET /api/customers` serves both barbers (`core_sales`) and admins (`customers_crm`), the route checks the feature **only** in the admin branch. An admin without `customers_crm` gets the barber-style autocomplete result, not 403. Document this in a code comment.

- [ ] **Step 1: Write the failing tests.**
  - Barber expense without `can_add_expense` gets 403 **(RF5)**.
  - The upsert keeps one row per barber per day, and amount 0 deletes it along with a ledger reversal.
  - **(RF4)** Parallel company-expense creates across 2 orgs each get correct ids in the response, audit and ledger.
  - A free org calling `/expenses`: the plan matrix gives free `expenses`, so 200; a test-only override turning `expenses` off gives 403.
  - Customer detail from org B with an org-A id gets 404.
  - **(RF1)** Cross-org cases for `PUT/DELETE /company-expenses/:id` and `GET /customers/:id`.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): expenses, company expenses, customers CRM`.

---

### Task 10: Ledger: transfers, balances, shop book, payouts, barber book

**Files:**
- Create: `migrations/0007_ledger.sql`, `src/data/tenant/payouts.ts` (payouts and transfers), `src/tenant/ledger/routes.ts`
- Test: `test/ledger.test.ts`, plus cross-org cases

**Interfaces:**
- **Routes** (admin; feature `ledger`), from FM routes.ts:1065-1378:
  - `/api/transfers`: GET, POST, PUT `/:id`, DELETE `/:id`
  - `/api/ledger/balances`: GET, and PUT for openings (`source 'opening'`; `source_id` 0 for the shop or the barber id, scoped by org)
  - `/api/ledger/shop?from&to&account`
  - `/api/payouts`: GET, POST, PUT `/:id`, DELETE `/:id`
  - `/api/ledger/barbers`
  - `/api/ledger/barbers/:id`
- **Schema** (0007): `barber_payouts` and `money_transfers` with `uid`, `UNIQUE(org_id, uid)`, composite FKs and the FM CHECKs.
- **Ids:** no `MAX(id)` **(RF4)**.
- **Validation:** a payout `barber_id` must be an active barber of the same org, otherwise 400 **(RF1)**.

- [ ] **Step 1: Write the failing tests.**
  - Opening balances, then sales and expenses (from Tasks 6 and 9) plus a transfer and a payout, give shop cash and bank closing balances equal to a hand-computed fixture.
  - Editing a payout reverses and reposts.
  - The barber book's running balance is correct.
  - A pro org (no `ledger`) gets 403 `feature_disabled`; pro_max gets 200.
  - **(RF4)** Parallel payout and transfer creates across orgs.
  - **(RF1)** A payout with another org's `barber_id` gets 400, plus cross-org cases for `PUT/DELETE /payouts/:id`, `PUT/DELETE /transfers/:id` and `GET /ledger/barbers/:id`.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): ledger module`.

---

### Task 11: Cross-org sweep, enumeration hardening, seed and docs

**Files:**
- Modify: `test/cross-org.test.ts` (assert the registry covers every id-taking tenant route), `test/auth.test.ts`, `scripts/seed-local.sql` (demo services, 2 barbers and a few sales for alpha and bravo; delete list extended), `README.md`, `docs/superpowers/plans/2026-11-02-plan-1-followups.md` (tick the items done)
- Test: the existing ones

**Interfaces:**
- **Registry coverage:** a test walks `app.routes` and collects every `tenantApi` route whose path contains `/:`. It asserts each `METHOD path` appears in `CASES`, by exact match on `name` = `"<METHOD> <path pattern>"`. Missing entries fail with a list of them.
- **Guard coverage:** the enumeration test still sends a request to every non-public route without a session and expects 401. The `publicApi` routes are listed explicitly.
- **Seed:** it must stay re-runnable, deleting children before parents for every new table.

- [ ] **Step 1:** Write the coverage test, plus a test that reads every file under `src/` (via `import.meta.glob` with `?raw`, or a list) and asserts none contains `MAX(id)` (case-insensitive). Expected: it fails, listing any route missing a case.
- [ ] **Step 2:** Add the missing cases until it passes.
- [ ] **Step 3:** Update the seed, then run `npm run db:migrate:local && npm run db:seed:local` twice with `XDG_CONFIG_HOME=/Users/laxmikant/.wrangler-affworld`. Expected: no errors.
- [ ] **Step 4:** Run root `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `test: cross-org coverage sweep, seed and docs`.

---

## Done when
- Root `npm test` and `npm run typecheck` pass.
- Every id-taking tenant route has a cross-org case, and every public route is listed explicitly.
- No `MAX(id)` appears in `src/` (grep test in Task 11).
- The SQL guard scans all of `src/data/tenant/`.
- Plan 2b can fill `hooks.afterSale` and add WhatsApp, push and ratings without changing these interfaces.
