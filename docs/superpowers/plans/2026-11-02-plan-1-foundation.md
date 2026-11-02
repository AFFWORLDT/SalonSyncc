# SalonStation Plan 1: Multi-tenant Foundation, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working, tested multi-salon backbone: one Worker and one D1 database. It resolves the salon from host or session, logs users into exactly one org, and serves `/api/me` with plan-derived features. It enforces features and subscription state in middleware.

**Architecture:**
- An npm-workspaces monorepo: `apps/api` (Hono Worker) and `packages/features` (shared feature and plan catalogue).
- All SQL lives in `apps/api/src/data/`. Salon queries go through `tenantRepo(db, orgId)`, which scopes every statement by `org_id`.
- `core/` holds the request pipeline: tenant resolver, session, `requireFeature`, write guard.
- FM Salon's feature modules are **not** ported here. That is Plan 2.

**Tech Stack:**
- TypeScript, Hono ^4.13, Wrangler ^4.151, D1
- Vitest with `@cloudflare/vitest-pool-workers` (real D1 in tests)
- npm workspaces (the spec says pnpm; npm chosen to match FM Salon's tooling)

**Spec:** `docs/superpowers/specs/2026-11-02-salonsync-saas-design.md`. Read §3, §4, §5.1, §6 (write guard), §7.1–7.3 and §8.1 before starting.

**Roadmap (later plans, one per phase):**
- Plan 2: Port FM features (P1) + FM import (P1b)
- Plan 3: Web dashboard, dynamic UI (P2 frontend)
- Plan 4: Signup site (P3)
- Plan 5: Super admin (P4)
- Plan 6: Lifecycle cron and emails (P5)
- Plan 7: Stripe (P6)
- Plan 8: Domain (P7)
- Plan 9: WhatsApp per salon (P8)

## Global Constraints

- **Cloudflare account:** Affworld0, `account_id` `dd501fac7d8aa896ead9530b9cd1b913`.
  - Run wrangler with `XDG_CONFIG_HOME=/Users/laxmikant/.wrangler-affworld`.
  - **Never** use the laxmikant.online account.
  - Plan 1 does not deploy.
- **Worker name** `salonstation-app`. **D1 database** `salonstation-db`, binding `DB`.
- **Brand values are vars, never literals in code:** `BRAND_NAME="SalonStation"`, `ROOT_DOMAIN=""` (empty means workers.dev mode), `ADMIN_HOST="admin"`, `MAIL_FROM=""`, `SUPPORT_EMAIL=""`.
- **Session cookie** name is `ss_session`. Its payload is `{ uid: number, orgId: string, v: number, exp: number }`. It lasts 60 days and is HMAC-signed with `SESSION_SECRET`.
- **Passwords:** PBKDF2-SHA256, stored as `pbkdf2$<iter>$<salt>$<hash>`. Copy FM's `crypto.ts` verbatim.
- **Timestamps** are integer milliseconds (`Date.now()`). Money is integer minor units.
- **Org IDs** are text `org_<randomToken(12)>`. Salon-table row IDs are `INTEGER PRIMARY KEY AUTOINCREMENT`.
- **Every salon table** has `org_id TEXT NOT NULL REFERENCES orgs(id)`. Every index on it starts with `org_id`, and uniqueness is per org.
- **Plans:** `free` (AED 0), `pro` (AED 200/month), `pro_max` (AED 499/month). Currency `AED`.
- **Org statuses:** `trial | active | grace | past_due | expired | deactivated | deleted`.
  - Writes are allowed only in `trial | active | grace | past_due`.
  - Login is blocked in `deactivated | deleted`.
- **Error JSON shape** is `{ error: string, code?: string }`, as in FM. Codes used here are `feature_disabled` (403), `subscription_inactive` (402) and `wrong_org` (401).

## Review Focus

1. **Slug casing and junk:** `BeardSalon`, `beard-salon` and `beard_salon` must resolve and validate the same way everywhere. Lower-case `[a-z0-9-]`, 3–30 characters, no leading or trailing `-`. Bad slugs give 404 and never throw.
2. **Host variants:** `beardsalon.salonstation.online:443`, a trailing dot `beardsalon.salonstation.online.`, nested `www.beardsalon.salonstation.online`, and the bare root. Only a single label directly under `ROOT_DOMAIN` counts as a salon.
3. **Switching org on workers.dev:** a valid org-A session plus `?org=B` or an `X-Org` header must still act as org A (or get 401), never as B.
4. **Org deactivated mid-session:** a valid cookie for an org that just became `deactivated` gets 401 on the next request, not after the cookie expires.
5. **Unknown feature keys:** an override row for a removed feature key, or a plan with zero `plan_features` rows, must give a feature list containing only known keys. `core_sales` is always present.

Each item has a test in the task that owns it. These are marked **(RF1)**–**(RF5)**.

---

## File Structure

```
salonsync/
├─ package.json                      workspaces: apps/*, packages/*
├─ tsconfig.base.json
├─ packages/features/
│  ├─ package.json                   name "@ss/features"
│  ├─ src/index.ts                   FEATURE_KEYS, PLAN_DEFAULTS, effectiveFeatures
│  └─ src/index.test.ts
└─ apps/api/
   ├─ package.json                   name "@ss/api"
   ├─ wrangler.jsonc
   ├─ vitest.config.ts
   ├─ migrations/0001_platform.sql   platform tables
   ├─ migrations/0002_tenant_core.sql org_settings, users, counters, login_failures
   ├─ migrations/0003_seed_plans.sql plans + plan_features from PLAN_DEFAULTS
   ├─ scripts/gen-plan-seed.ts       writes 0003 from @ss/features (keeps SQL and TS in sync)
   ├─ scripts/seed-local.sql         two demo orgs for wrangler dev
   ├─ src/index.ts                   Hono app mount
   ├─ src/env.ts                     Env, TenantContext, AppEnv
   ├─ src/core/crypto.ts             copied from FM
   ├─ src/core/errors.ts             HttpError + onError JSON
   ├─ src/core/tenant.ts             slugFromHost, isValidSlug
   ├─ src/core/session.ts            issue/read/clear ss_session
   ├─ src/core/pipeline.ts           tenantAuth, requireFeature, writeGuard middleware
   ├─ src/data/platform.ts           platformRepo(db)
   ├─ src/data/tenant.ts             tenantRepo(db, orgId)
   ├─ src/platform/me.ts             GET /api/me
   ├─ src/platform/auth.ts           POST /api/auth/login, /logout
   └─ test/
      ├─ apply-migrations.ts         vitest setup
      ├─ helpers.ts                  makeOrg, makeUser, loginAs
      ├─ sql-guard.test.ts
      ├─ tenant.test.ts
      ├─ auth.test.ts
      ├─ me.test.ts
      └─ pipeline.test.ts
```

---

### Task 1: Monorepo skeleton + Worker that answers `/api/health`

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/wrangler.jsonc`, `apps/api/vitest.config.ts`, `apps/api/test/apply-migrations.ts`, `apps/api/src/index.ts`, `apps/api/src/env.ts`, `apps/api/src/core/errors.ts`, `apps/api/migrations/0001_platform.sql` (empty placeholder `-- platform tables`, filled in Task 3)
- Test: `apps/api/test/health.test.ts`

**Interfaces:**
- Produces:
  - `Env { DB: D1Database; SESSION_SECRET: string; BRAND_NAME: string; ROOT_DOMAIN: string; ADMIN_HOST: string; MAIL_FROM: string; SUPPORT_EMAIL: string }`
  - `class HttpError(status: 400|401|402|403|404|409|429, message: string, code?: string)`
  - `app: Hono<AppEnv>` exported default from `src/index.ts`
  - `app.onError` turns an `HttpError` into `{error, code}` and anything else into a 500 `{error:"Something went wrong"}`

- [ ] **Step 1:** Root `package.json`: `{"private":true,"workspaces":["apps/*","packages/*"],"scripts":{"test":"npm test --workspaces --if-present","typecheck":"npm run typecheck --workspaces --if-present"}}`. `apps/api` deps: `hono@^4.13.13`. Dev deps: `wrangler@^4.151.1`, `@cloudflare/workers-types`, `@cloudflare/vitest-pool-workers`, `vitest`, `typescript@^5.9.3`. Run `npm install` at the root.
- [ ] **Step 2: wrangler.jsonc.**
  - Values from Global Constraints: `name`, `account_id`, `compatibility_date "2026-10-01"`, `nodejs_compat`, `placement smart`, `workers_dev true`, `vars` (brand values) and `d1_databases` (`binding DB`, `database_name salonstation-db`, `database_id "local-only"`, `migrations_dir migrations`).
  - Add the comment `// database_id filled when the D1 is created (Plan 2 deploy)`.
- [ ] **Step 3: vitest.config.ts.**
  - Use `defineWorkersConfig`, with `poolOptions.workers.wrangler.configPath "./wrangler.jsonc"`.
  - Set `miniflare.bindings.TEST_MIGRATIONS` from `await readD1Migrations("./migrations")`, and `SESSION_SECRET: "test-secret"`.
  - Set `setupFiles: ["./test/apply-migrations.ts"]`. That file calls `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`.
- [ ] **Step 4: Write the failing test.**
  ```ts
  import { SELF } from "cloudflare:test";
  it("health answers with brand", async () => {
    const r = await SELF.fetch("https://x.test/api/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, brand: "SalonStation" });
  });
  it("unknown api route is JSON 404", async () => {
    const r = await SELF.fetch("https://x.test/api/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Not found" });
  });
  ```
- [ ] **Step 5:** Run `npm test -w @ss/api`. Expected: FAIL (no app).
- [ ] **Step 6:** Implement `src/index.ts` with `GET /api/health` returning `{ok:true, brand: env.BRAND_NAME}`, a `notFound` handler and `onError`. Copy the `crypto.ts` file into `src/core/crypto.ts` verbatim from `ERP/gents-salon/api/src/crypto.ts`.
- [ ] **Step 7:** Run `npm test -w @ss/api`. Expected: PASS (2 tests).
- [ ] **Step 8:** Commit: `git add -A && git commit -m "chore: monorepo skeleton and api health route"`

---

### Task 2: `@ss/features`, the feature catalogue and the effective-features calculation

**Files:**
- Create: `packages/features/package.json` (name `@ss/features`, `"main":"src/index.ts"`, `"test":"vitest run"`), `packages/features/src/index.ts`
- Test: `packages/features/src/index.test.ts`

**Interfaces:**
- Produces:
  - `FEATURE_KEYS`, a readonly tuple in this exact order: `core_sales, expenses, daily_sheet, customers_crm, ratings, reports_advanced, excel_export, push, announcements, ledger, audit_log, whatsapp, whatsapp_campaigns, public_services_api`
  - `type FeatureKey = typeof FEATURE_KEYS[number]`
  - `type PlanId = "free" | "pro" | "pro_max"`
  - `PLAN_DEFAULTS: Record<PlanId, { name: string; priceMonthly: number; currency: "AED"; features: FeatureKey[]; limits: { max_staff: number | null } }>`
  - `ALWAYS_ON: FeatureKey[] = ["core_sales"]`
  - `TRIAL_PLAN: PlanId = "pro_max"`, `TRIAL_EXCLUDED: FeatureKey[] = ["whatsapp","whatsapp_campaigns"]`
  - `effectiveFeatures(planFeatures: string[], overrides: {feature_key: string; enabled: 0|1}[]): FeatureKey[]`. The result follows FEATURE_KEYS order, drops unknown keys, and always includes ALWAYS_ON.
  - `isFeatureKey(s: string): s is FeatureKey`

- [ ] **Step 1: Write the failing tests.** Use the exact values from spec §7.1.
  ```ts
  it("plan matrix matches spec", () => {
    expect(PLAN_DEFAULTS.free.features).toEqual(["core_sales","expenses","daily_sheet"]);
    expect(PLAN_DEFAULTS.pro.features).toEqual(["core_sales","expenses","daily_sheet","customers_crm","ratings","reports_advanced","excel_export","push","announcements"]);
    expect(PLAN_DEFAULTS.pro_max.features).toEqual([...FEATURE_KEYS]);
    expect([PLAN_DEFAULTS.free.priceMonthly, PLAN_DEFAULTS.pro.priceMonthly, PLAN_DEFAULTS.pro_max.priceMonthly]).toEqual([0, 200, 499]);
    expect([PLAN_DEFAULTS.free.limits.max_staff, PLAN_DEFAULTS.pro.limits.max_staff, PLAN_DEFAULTS.pro_max.limits.max_staff]).toEqual([2, 10, null]);
  });
  it("override on adds, override off removes", () => {
    expect(effectiveFeatures(["core_sales","expenses"], [{feature_key:"ledger",enabled:1},{feature_key:"expenses",enabled:0}]))
      .toEqual(["core_sales","ledger"]);
  });
  it("RF5: unknown keys dropped, core_sales always on", () => {
    expect(effectiveFeatures([], [{feature_key:"old_thing",enabled:1},{feature_key:"core_sales",enabled:0}])).toEqual(["core_sales"]);
  });
  ```
- [ ] **Step 2:** Run `npm test -w @ss/features`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `src/index.ts` with the exports listed in Interfaces.
- [ ] **Step 4:** Run `npm test -w @ss/features`. Expected: PASS (3 tests).
- [ ] **Step 5:** Commit: `git commit -am "feat(features): plan matrix and effective features"`

---

### Task 3: D1 schema: platform tables, core salon tables, plan seed

**Files:**
- Modify: `apps/api/migrations/0001_platform.sql`
- Create: `apps/api/migrations/0002_tenant_core.sql`, `apps/api/scripts/gen-plan-seed.ts`, `apps/api/migrations/0003_seed_plans.sql` (generated)
- Test: `apps/api/test/schema.test.ts`

**Interfaces:**
- Produces the tables below. Column names are exactly these, and later plans depend on them.
  - `orgs(id TEXT PK, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN (...Global statuses)), plan_id TEXT NOT NULL REFERENCES plans(id), trial_ends_at INTEGER, grace_ends_at INTEGER, owner_user_id INTEGER, country TEXT NOT NULL DEFAULT 'AE', created_at INTEGER NOT NULL, deactivated_at INTEGER, deleted_at INTEGER)`
  - `reserved_slugs(slug TEXT PK)`, seeded with `admin, www, api, app, platform, mail, support, help, billing, status, static, assets, login, signup`
  - `plans(id TEXT PK, name TEXT NOT NULL, price_monthly INTEGER NOT NULL, currency TEXT NOT NULL, stripe_price_id TEXT, limits_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL)`
  - `plan_features(plan_id TEXT, feature_key TEXT, PRIMARY KEY(plan_id, feature_key))`
  - `org_feature_overrides(org_id TEXT, feature_key TEXT, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), reason TEXT, set_by INTEGER, set_at INTEGER NOT NULL, PRIMARY KEY(org_id, feature_key))`
  - `subscriptions(org_id TEXT PK, provider TEXT NOT NULL DEFAULT 'none' CHECK(provider IN ('none','stripe','manual')), stripe_customer_id TEXT, stripe_subscription_id TEXT, status TEXT, current_period_end INTEGER, cancel_at INTEGER)`
  - `platform_users`, `platform_audit`, `email_log` (`UNIQUE(org_id, kind)`), `support_sessions`, `stripe_events(event_id PK)`, with the columns given in spec §5.1
  - `org_settings(org_id TEXT PK, display_name TEXT NOT NULL, legal_name TEXT, logo_url TEXT, brand_color TEXT, currency TEXT NOT NULL DEFAULT 'AED', currency_minor INTEGER NOT NULL DEFAULT 100, locale TEXT NOT NULL DEFAULT 'en-AE', timezone TEXT NOT NULL DEFAULT 'Asia/Dubai', day_start_hour INTEGER NOT NULL DEFAULT 4, phone_country TEXT NOT NULL DEFAULT '971', bill_prefix TEXT NOT NULL, vat_enabled INTEGER NOT NULL DEFAULT 0, vat_rate REAL NOT NULL DEFAULT 5, trn TEXT, licence_no TEXT, contact_phone TEXT, address TEXT, instagram_url TEXT, google_review_url TEXT)`. FM's other settings columns are added in Plan 2.
  - `users(id INTEGER PK AUTOINCREMENT, org_id TEXT NOT NULL, username TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin','barber')), password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, UNIQUE(org_id, username))`
  - `counters(org_id TEXT, name TEXT, value INTEGER NOT NULL, PRIMARY KEY(org_id, name))`
  - `login_failures(org_id TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL)` with index `(org_id, key, at)`
  - The seed script reads `PLAN_DEFAULTS` and writes `INSERT INTO plans …; INSERT INTO plan_features …`, with sort order free=1, pro=2, pro_max=3.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it("plans seeded exactly from PLAN_DEFAULTS", async () => {
    const plans = await env.DB.prepare("SELECT id, price_monthly, currency FROM plans ORDER BY sort").all();
    expect(plans.results).toEqual([{id:"free",price_monthly:0,currency:"AED"},{id:"pro",price_monthly:200,currency:"AED"},{id:"pro_max",price_monthly:499,currency:"AED"}]);
    for (const id of ["free","pro","pro_max"] as const) {
      const f = await env.DB.prepare("SELECT feature_key FROM plan_features WHERE plan_id=?").bind(id).all();
      expect(f.results.map(r => r.feature_key).sort()).toEqual([...PLAN_DEFAULTS[id].features].sort());
    }
  });
  it("username unique per org, not globally", async () => { /* insert 2 orgs, same username in each → ok; twice in same org → throws UNIQUE */ });
  it("org status rejects unknown value", async () => { /* insert status 'paused' → throws CHECK */ });
  ```
- [ ] **Step 2:** Run `npm test -w @ss/api -- schema`. Expected: FAIL (no such table: plans).
- [ ] **Step 3:** Write `0001_platform.sql` and `0002_tenant_core.sql`. Then run `node --experimental-strip-types scripts/gen-plan-seed.ts > migrations/0003_seed_plans.sql` and add `"db:gen-seed"` to the scripts.
- [ ] **Step 4:** Run `npm test -w @ss/api`. Expected: PASS (all).
- [ ] **Step 5:** Commit: `git commit -am "feat(db): platform + tenant core schema, plan seed"`

---

### Task 4: Data layer, `platformRepo` + `tenantRepo`, and the SQL guard

**Files:**
- Create: `apps/api/src/data/platform.ts`, `apps/api/src/data/tenant.ts`, `apps/api/test/helpers.ts`
- Test: `apps/api/test/sql-guard.test.ts`, `apps/api/test/data.test.ts`

**Interfaces:**
- Consumes: the Task 3 tables, `effectiveFeatures` and `PlanId` from `@ss/features`, and `hashPassword` and `randomToken` from `core/crypto`.
- Produces:
  - `type OrgStatus = "trial"|"active"|"grace"|"past_due"|"expired"|"deactivated"|"deleted"`
  - `interface Org { id: string; slug: string; name: string; status: OrgStatus; planId: PlanId; trialEndsAt: number|null; graceEndsAt: number|null }`
  - `platformRepo(db: D1Database)` returns:
    - `orgBySlug(slug: string): Promise<Org|null>`
    - `orgById(id: string): Promise<Org|null>`
    - `planFeatures(planId: string): Promise<string[]>`
    - `planLimits(planId: string): Promise<{max_staff: number|null}>`
    - `overrides(orgId: string): Promise<{feature_key: string; enabled: 0|1}[]>`
  - `tenantRepo(db: D1Database, orgId: string)` returns:
    - `userByUsername(username: string): Promise<UserRow|null>`
    - `userById(id: number): Promise<UserRow|null>`
    - `settings(): Promise<OrgSettings>`
    - `nextSeq(name: string): Promise<number>`
  - `UserRow { id; org_id; username; name; role: "owner"|"admin"|"barber"; password_hash; active: 0|1; session_version }`
  - `OrgSettings` maps the `org_settings` columns to camelCase.
  - Test helpers:
    - `makeOrg(opts: {slug: string; plan?: PlanId; status?: OrgStatus}): Promise<Org>`, which inserts `orgs`, `org_settings` (bill_prefix = first 3 chars of slug, upper case) and `subscriptions`
    - `makeUser(orgId: string, opts: {username: string; role?: UserRow["role"]; password?: string}): Promise<UserRow>`, with default password `"pass1234"`

- [ ] **Step 1: Write the failing SQL guard test.**
  1. Read `src/data/tenant.ts` as text with `import src from "../src/data/tenant.ts?raw"`.
  2. Pull out every template or string literal that contains `SELECT|INSERT|UPDATE|DELETE`.
  3. For each one that mentions a salon table (`users|counters|login_failures|org_settings`, a list that later plans extend in one exported constant `TENANT_TABLES` in `data/tenant.ts`), assert that it contains `org_id = ?` or `org_id=?`, or for INSERTs, an `org_id` column.

  The test is named `"every tenant SQL statement is scoped by org_id"`.
- [ ] **Step 2: Write the failing data tests.**
  ```ts
  it("tenantRepo never sees another org's user", async () => {
    const a = await makeOrg({slug:"alpha"}); const b = await makeOrg({slug:"bravo"});
    const u = await makeUser(a.id, {username:"sam"});
    expect(await tenantRepo(env.DB, b.id).userById(u.id)).toBeNull();
    expect(await tenantRepo(env.DB, b.id).userByUsername("sam")).toBeNull();
    expect((await tenantRepo(env.DB, a.id).userById(u.id))?.username).toBe("sam");
  });
  it("nextSeq counts per org", async () => { /* a.nextSeq("bill") → 1, 2; b.nextSeq("bill") → 1 */ });
  ```
- [ ] **Step 3:** Run `npm test -w @ss/api -- data sql-guard`. Expected: FAIL.
- [ ] **Step 4:** Implement both repositories. `nextSeq` uses `INSERT INTO counters(org_id,name,value) VALUES(?,?,1) ON CONFLICT(org_id,name) DO UPDATE SET value=value+1 RETURNING value`.
- [ ] **Step 5:** Run `npm test -w @ss/api`. Expected: PASS.
- [ ] **Step 6:** Commit: `git commit -am "feat(data): org-scoped repositories and SQL guard test"`

---

### Task 5: Finding the salon from the host name

**Files:**
- Create: `apps/api/src/core/tenant.ts`
- Test: `apps/api/test/tenant.test.ts`

**Interfaces:**
- Produces:
  - `SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/` (3–30 characters)
  - `normalizeSlug(s: string): string`: trim, lower-case, `_` and spaces become `-`
  - `isValidSlug(s: string): boolean`
  - `slugFromHost(host: string, rootDomain: string, adminHost: string): { kind: "tenant"; slug: string } | { kind: "admin" } | { kind: "none" }`
    - Strip any port and trailing dot, then lower-case.
    - Returns `none` when rootDomain is empty, for the bare root, for `www`, and for anything nested more than one label deep.
    - Returns `admin` when the label equals `adminHost`.

- [ ] **Step 1: Write the failing tests (RF1, RF2).**
  ```ts
  const R = "salonstation.online";
  it.each([
    ["beardsalon.salonstation.online", {kind:"tenant",slug:"beardsalon"}],
    ["BeardSalon.SalonStation.Online", {kind:"tenant",slug:"beardsalon"}],
    ["beardsalon.salonstation.online:443", {kind:"tenant",slug:"beardsalon"}],
    ["beardsalon.salonstation.online.", {kind:"tenant",slug:"beardsalon"}],
    ["admin.salonstation.online", {kind:"admin"}],
    ["salonstation.online", {kind:"none"}],
    ["www.salonstation.online", {kind:"none"}],
    ["www.beardsalon.salonstation.online", {kind:"none"}],
    ["evil-salonstation.online", {kind:"none"}],
    ["salonstation-app.affworld0.workers.dev", {kind:"none"}],
  ])("slugFromHost(%s)", (h, want) => expect(slugFromHost(h, R, "admin")).toEqual(want));
  it("empty ROOT_DOMAIN means workers.dev mode", () => expect(slugFromHost("a.b.c", "", "admin")).toEqual({kind:"none"}));
  it.each([["Beard Salon","beard-salon"],["beard_salon","beard-salon"],["  FM ","fm"]])("normalize %s", (a,b) => expect(normalizeSlug(a)).toBe(b));
  it.each(["ab","-ab","ab-","a".repeat(31),"बार्बर","a.b"])("invalid %s", s => expect(isValidSlug(s)).toBe(false));
  ```
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement in `core/tenant.ts`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "feat(core): host to tenant resolver"`

---

### Task 6: Login and sessions bound to one org

**Files:**
- Create: `apps/api/src/core/session.ts`, `apps/api/src/platform/auth.ts`, `apps/api/src/core/pipeline.ts` (only `tenantAuth` in this task)
- Modify: `apps/api/src/index.ts` (mount `/api/auth`, then `tenantAuth` on `/api/*` except `/api/health` and `/api/auth/*`), `apps/api/src/env.ts`
- Test: `apps/api/test/auth.test.ts`

**Interfaces:**
- Consumes: `slugFromHost`, `normalizeSlug`, `platformRepo`, `tenantRepo`, `sign`, `verify`, `checkPassword`.
- Produces:
  - `SessionPayload { uid: number; orgId: string; v: number; exp: number }`
  - `issueSession(c, p: Omit<SessionPayload,"exp">): Promise<void>`: sets the `ss_session` cookie (HttpOnly, Secure, SameSite=Lax, Path=/) for 60 days
  - `readSession(c): Promise<SessionPayload|null>`, `clearSession(c): void`
  - `POST /api/auth/login`, body `{ org?: string; username: string; password: string }`:
    1. The org comes from the host when `slugFromHost` gives a tenant. Otherwise it is `normalizeSlug(body.org)`.
    2. If the org is missing, unknown, `deactivated` or `deleted`, respond 401 `{error:"Wrong salon ID, username or password"}`. Use the same message for every failure, and run a dummy hash when there's no user (as FM does).
    3. On success, respond 200 `{ ok: true, slug }`.
    - Locking after repeated failures (`login_failures`) is folded into Plan 2's port of FM's `limits.ts`. Not in this task.
  - `POST /api/auth/logout` responds 200 and clears the cookie.
  - `tenantAuth` middleware:
    - Reads the session. If it is missing or invalid, respond 401 `{error:"Please sign in"}`.
    - If the host gives a tenant slug whose org id ≠ `session.orgId`, respond 401 `{error:"Please sign in", code:"wrong_org"}`.
    - Loads the org. If it is `deactivated` or `deleted`, respond 401.
    - Loads the user through `tenantRepo(db, session.orgId)`. If the user is missing, inactive, or `v ≠ session_version`, respond 401.
    - Sets `c.var.tenant: TenantContext`.
    - **It never reads the org from a query string or header.**
  - `TenantContext { org: Org; user: UserRow; repo: ReturnType<typeof tenantRepo> }`. Features are added in Task 7.

- [ ] **Step 1: Write the failing tests.** Use a `loginAs(slug, username, password, host?)` helper in `test/helpers.ts` that returns the cookie string.
  ```ts
  it("login by Salon ID on workers.dev, then /api/me-probe works", ...);       // 200
  it("same username in two orgs logs into the right one", ...);               // a/sam pw1, b/sam pw2 → each only with own pw
  it("wrong org or password gives the same 401 message", ...);
  it("RF3: org-A session with ?org=bravo and X-Org: bravo still acts as alpha", ...);  // probe returns alpha's org id
  it("org-A cookie on bravo.<root> host → 401 wrong_org", ...);              // run with ROOT_DOMAIN binding overridden to "salonstation.online"
  it("RF4: org deactivated after login → next request 401", ...);
  it("session_version bump logs the user out everywhere", ...);
  it("deactivated org cannot log in", ...);
  ```
  Add a test-only probe route `GET /api/_whoami`, returning `{orgId, uid}`, mounted **only when `env.ENVIRONMENT === "test"`**. Set the `ENVIRONMENT: "test"` binding in vitest.config.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `session.ts`, `auth.ts` and `tenantAuth`.
- [ ] **Step 4:** Run `npm test -w @ss/api`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "feat(auth): org-bound sessions and tenantAuth"`

---

### Task 7: `/api/me` with effective features, limits and subscription

**Files:**
- Create: `apps/api/src/platform/me.ts`, `apps/api/src/core/features-cache.ts`
- Modify: `apps/api/src/core/pipeline.ts` (`tenantAuth` fills `tenant.features`), `apps/api/src/env.ts`
- Test: `apps/api/test/me.test.ts`

**Interfaces:**
- Consumes: `platformRepo.planFeatures`, `platformRepo.overrides`, `platformRepo.planLimits`, `effectiveFeatures`, `TRIAL_PLAN`, `TRIAL_EXCLUDED`.
- Produces:
  - `TenantContext.features: FeatureKey[]`, `TenantContext.limits: {max_staff: number|null}`
  - `featuresFor(db, org): Promise<{features: FeatureKey[]; limits}>`
    - When `org.status === "trial"`, the plan features are `PLAN_DEFAULTS[TRIAL_PLAN]` minus `TRIAL_EXCLUDED`. Otherwise they come from `plan_features` for `org.planId`. Overrides are applied on top in both cases.
    - Results are cached in a module-level `Map` keyed by `orgId` with a 60 s TTL.
    - Also produces `invalidateFeatures(orgId: string): void` (used by super admin in Plan 5).
  - `GET /api/me` responds 200:
    ```
    { user:{id,name,username,role}, org:{id,slug,name,status,planId}, settings:{displayName,logoUrl,brandColor,currency,locale,timezone}, features:FeatureKey[], limits:{max_staff}, subscription:{status,planId,trialEndsAt,graceEndsAt}, brand:{name: env.BRAND_NAME} }
    ```

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it("free org gets free features", ...);           // features == PLAN_DEFAULTS.free.features
  it("trial org gets pro_max minus whatsapp", ...); // contains "ledger", not "whatsapp"
  it("override enables ledger on a free org", ...); // insert org_feature_overrides(ledger,1), invalidateFeatures → me includes ledger
  it("me never leaks password_hash", ...);           // JSON.stringify(body) has no "pbkdf2"
  it("brand comes from env", ...);                   // body.brand.name === "SalonStation"
  ```
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "feat(api): /api/me with effective features"`

---

### Task 8: `requireFeature` and the subscription write guard

**Files:**
- Modify: `apps/api/src/core/pipeline.ts`, `apps/api/src/index.ts` (mount `writeGuard` after `tenantAuth`)
- Test: `apps/api/test/pipeline.test.ts`

**Interfaces:**
- Consumes: `TenantContext.features` and `org.status`.
- Produces:
  - `requireFeature(key: FeatureKey): MiddlewareHandler<AppEnv>`. It responds 403 `{error:"This feature isn't in your plan", code:"feature_disabled"}`. Plan 2 mounts it on every module router.
  - `WRITE_OK: OrgStatus[] = ["trial","active","grace","past_due"]`
  - `writeGuard`: for `POST|PUT|PATCH|DELETE` when the status is not in `WRITE_OK`, respond 402 `{error:"Your subscription is inactive. Upgrade to continue.", code:"subscription_inactive"}`.
    - Allow-list (exact prefixes): `/api/auth/`, `/api/billing/`, `/api/me`.
    - GET requests always pass, which covers exports.

- [ ] **Step 1: Write the failing tests.** Mount test-only routes under the `ENVIRONMENT === "test"` gate: `GET /api/_probe/ledger` with `requireFeature("ledger")`, and `POST /api/_probe/write`.
  ```ts
  it("free org → 403 feature_disabled on ledger", ...);
  it("pro_max org → 200 on ledger", ...);
  it.each(["trial","active","grace","past_due"])("%s can write", ...);   // 200
  it("expired org write → 402 subscription_inactive", ...);
  it("expired org can still GET /api/me and POST /api/auth/logout", ...);
  ```
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` at the root (both workspaces). Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "feat(core): requireFeature and subscription write guard"`

---

### Task 9: Local demo seed and developer README

**Files:**
- Create: `apps/api/scripts/seed-local.sql`, `README.md` (root)
- Modify: `apps/api/package.json` scripts: `"dev":"wrangler dev"`, `"db:migrate:local":"wrangler d1 migrations apply salonstation-db --local"`, `"db:seed:local":"wrangler d1 execute salonstation-db --local --file scripts/seed-local.sql"`

**Interfaces:**
- Produces two demo orgs for manual checks:
  - `alpha` (plan `free`, status `active`) and `bravo` (status `trial`, `trial_ends_at` now + 7 days)
  - Each has owner `owner` with password `pass1234`. The hash is generated once with `hashPassword` and pasted in.
  - Settings rows have bill prefixes `ALP` and `BRA`.

- [ ] **Step 1:** Write the seed SQL and README. The README covers: install, `.dev.vars` with `SESSION_SECRET`, migrate, seed, dev, test, the wrangler-account warning from Global Constraints, and links to the spec and this plan.
- [ ] **Step 2:** Verify by hand:
  1. `npm run db:migrate:local -w @ss/api && npm run db:seed:local -w @ss/api && npm run dev -w @ss/api`.
  2. `curl -c j -X POST localhost:8787/api/auth/login -H 'content-type: application/json' -d '{"org":"alpha","username":"owner","password":"pass1234"}'` should give `{"ok":true,"slug":"alpha"}`.
  3. `curl -b j localhost:8787/api/me` should show `features` equal to the free list.
  4. Repeat for `bravo`. The features should include `ledger`.
- [ ] **Step 3:** Commit: `git commit -am "docs: local seed and README"`

---

## Done when
- `npm test` passes at the root.
- `npm run typecheck` is clean.
- The manual curl check in Task 9 works for both demo orgs.
- Plan 2 (porting FM's modules into `tenant/*`, behind `requireFeature`, using `tenantRepo`) can start without changing any interface above.
