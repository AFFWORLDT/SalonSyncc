# SalonStation — White-label Salon SaaS: Design Spec

- **Date:** 2026-11-02
- **Status:** v3 — all open questions answered by the user on 2026-11-02
- **Repo:** `ERP/salonsync`, remote `github.com/AFFWORLDT/SalonSyncc` (`main`)
- **Built from:** `ERP/gents-salon` (FM Salon, live in production)
- **Multi-tenancy ideas from:** `ERP/Properties-Admin-API` and `ERP/crm-propfusion` (PropFusion)

---

## 1. Goal

Turn the FM Salon app into a self-serve, white-label SaaS that any salon owner can sign up for.

1. A salon owner lands on the SalonStation website.
2. They sign up and get a **7-day free trial** straight away.
3. They get a welcome email with their own portal, `<salon>.salonstation.online`.
4. They run their salon on the same features FM Salon uses today.
5. A **super admin** (us) manages every salon: plans, features, trial and subscription state, and deactivating or deleting a salon.

The system should handle 30–40 salons comfortably on one Worker and one D1 database. It is built so that data storage can later move out (to MongoDB or a self-hosted database) without rewriting business logic.

### Decisions made with the user

| # | Decision |
|---|----------|
| D1 | Self-serve signup, 7-day free trial, Stripe subscriptions added after launch. |
| D2 | Marketing: a short salon page on propfusion.io (Vercel) links to the SalonStation landing and signup site (Cloudflare). |
| D3 | Each salon logs in on its own subdomain, `beardsalon.salonstation.online`. |
| D4 | Domain not decided yet. Run on `workers.dev` for now and attach a domain later without code changes. |
| D5 | **One D1 database for now. Salons are separated by `org_id` on every row.** A Durable Object per salon only if a later need appears. |
| D6 | **One Worker** with a clean split between platform code and salon code. |
| D7 | Later scaling: move storage to MongoDB or a self-hosted database. Not needed now, but the data layer must make it possible. |
| D8 | Trial is 7 days. Then a 7-day grace period with a daily upgrade reminder email. Data is kept 14 days in total, after which the super admin may deactivate or delete the salon. |
| D9 | Super admin turns features on and off per plan, and overrides features per salon. |
| D10 | The frontend is dynamic: menu items, pages and actions depend on the salon's features and subscription state (the PropFusion pattern). |
| D11 | UI and components are the same as FM Salon (Next.js static export, shadcn, the FM design language). |
| D12 | Product name **SalonStation** for now. The name and root domain are **config, not code** (see §8.1), because the final domain is still being chosen. |
| D13 | Grace period: the salon **keeps working** for 7 days, with a banner and daily emails. |
| D14 | **Only the super admin** turns features on and off. Salon owners cannot change features. |
| D15 | Three plans: **Free, Pro, Pro Max** (§7.1). |
| D17 | **Free is a permanent plan** with limited features. Signup starts a 7-day Pro Max trial. Before day 14 the owner picks Free, Pro or Pro Max; if they pick nothing, the salon is `expired` (D8). |
| D18 | Prices: **Free AED 0, Pro AED 200/month, Pro Max AED 499/month.** Anything else (yearly, discounts, custom bundles) is agreed by sales or customer success and set by the super admin as a manual plan (`provider=manual`). |
| D16 | **FM Salon moves onto SalonStation** as an org, with its production data imported (§12, P1b). |

### Not in scope for v1
- Multiple branches per salon (one branch per org).
- Languages other than English.
- A separate database per salon (D5).
- Each salon using its own custom domain, e.g. `book.superbeard.com` (later, with Cloudflare for SaaS).

---

## 2. System overview

```
                    propfusion.io (Vercel, existing)
                    └─ /for/salon-software  ──"Start free trial"──┐
                                                                   ▼
┌───────────────────────────── Cloudflare (Affworld0, Workers Paid) ─────────────────────────────┐
│                                                                                                 │
│  salonsync-site  (static Worker)          salonsync-app  (one Worker: Hono API + static assets) │
│  salonstation.online                      *.salonstation.online   admin.salonstation.online     │
│  landing · pricing · /signup ──POST──▶    ├─ /api/public/*   signup, slug check, branding       │
│                                           ├─ /api/platform/* super admin (platform module)      │
│                                           ├─ /api/*          salon app (tenant modules)         │
│                                           ├─ /api/stripe/webhook                                │
│                                           ├─ static: salon dashboard + super admin UI           │
│                                           ├─ cron (hourly): lifecycle, reminders, WA jobs       │
│                                           └─ Queue producer ──▶ email-queue ──▶ consumer        │
│                                                                                                 │
│  D1: salonsync-db   (platform tables + salon tables with org_id)                                │
│  KV: (optional) host→org cache       Turnstile: signup bot check                                │
│  Email: Cloudflare Email Service (welcome, reminders, receipts)                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
          ▲ Stripe (Checkout + Billing Portal + webhooks) — phase 6
```

### Cloudflare pieces and why

| Piece | Used for | Needed in v1? |
|-------|----------|---------------|
| Workers (one app Worker, one static site Worker) | API, dashboard, landing | Yes |
| D1 (one database) | All data | Yes |
| Queues | Sending email with retries, so cron and signup never block on email | Yes (small) |
| Cron Triggers | Trial and grace lifecycle, reminders, existing FM jobs | Yes |
| Turnstile | Stop bot signups | Yes |
| Email Service | Welcome, reminder and expiry emails | Yes |
| KV | Cache from host or slug to org, if D1 lookups show up in latency | Only if needed |
| Durable Objects / Realtime | Live updates (e.g. owner sees a new sale instantly) | No (later) |
| R2 | Logos and staff photos (FM stores them as D1 BLOBs) | Recommended; see §9 |

**The account must be on Workers Paid (~$5/month).** The free plan's 10 ms CPU limit is already tight for FM's password hashing, and cron, queues and email for 40 salons need more room.

---

## 3. Monorepo layout

```
salonsync/
├─ apps/
│  ├─ api/                 Hono Worker (serves web/out as assets)
│  │  ├─ src/
│  │  │  ├─ index.ts       router mount + scheduled + queue handlers
│  │  │  ├─ core/          request context, tenant resolver, auth, errors, rate-limit
│  │  │  ├─ data/          ★ the only code that talks to D1 (repositories)
│  │  │  ├─ platform/      control plane: orgs, plans, features, subscriptions,
│  │  │  │                 lifecycle, signup, super-admin routes, stripe
│  │  │  ├─ tenant/        salon modules, one folder each:
│  │  │  │                 sales/ bills/ expenses/ ledger/ reports/ customers/
│  │  │  │                 services/ staff/ ratings/ whatsapp/ push/ announcements/
│  │  │  │                 audit/ settings/
│  │  │  └─ jobs/          cron + queue consumers (email, WA)
│  │  ├─ migrations/       D1 SQL migrations (single DB)
│  │  └─ wrangler.jsonc
│  ├─ web/                 Next static export: salon dashboard + super admin
│  │  └─ src/app/
│  │     ├─ (salon)/...    FM pages (sales, bills, sheet, ledger…)
│  │     ├─ (platform)/platform/...  super admin pages
│  │     └─ (public)/      login, r (receipt), rate, upgrade, setup
│  └─ site/                Next static export: landing, pricing, signup
├─ packages/
│  ├─ contract/            shared TS types + zod schemas for API (replaces FM's
│  │                       hand-synced contract.ts / types.ts)
│  ├─ features/            feature keys, plan catalog defaults, gating helpers
│  └─ ui/                  shadcn components + FM design tokens (shared by web & site)
├─ docs/superpowers/{specs,plans}/
├─ (npm workspaces, as in FM Salon)
└─ package.json            (workspaces: apps/*, packages/*)
```

**Where the boundaries are:**
- `tenant/*` modules never import from `platform/*`. They see a `TenantContext` (`orgId`, user, effective features, org settings).
- `platform/*` never queries salon tables directly. It goes through `data/` (for example, a delete-org function).
- **Only `data/` runs SQL.** Moving to MongoDB or a self-hosted database later (D7) means rewriting `data/` and nothing else.

---

## 4. Multi-tenancy (shared D1, `org_id` on every row)

### 4.1 Finding the salon for a request

Order of precedence:
1. **Host:** `beardsalon.salonstation.online` gives the slug `beardsalon`. `admin.` and `www.` are reserved.
2. **Before a domain exists (on `workers.dev`):** the login page asks for the **Salon ID** (slug), as PropFusion's workspace field does, and offers lookup by email. After login the slug comes from the session.
3. The slug is turned into an `org` row through a lookup. It is cached in memory per isolate, with optional KV caching.

**The session is tied to one org.** The session cookie holds `{uid, orgId, v, exp}`. On every request the middleware checks:
- if the host names an org, `session.orgId == host org`; otherwise it returns 401. This stops a session being replayed on another salon's subdomain (the PropFusion pattern).
- `users.session_version`, `users.active` and the org's status are rechecked from D1 (FM already reloads the user on each request).

Super admins have a separate session (`ss_platform`) that only works on `admin.` hosts or `/platform` paths. It never touches salon tables except through audited impersonation (§7.4).

### 4.2 Data isolation rules
- Every salon table has `org_id TEXT NOT NULL`. Every index starts with `org_id`, and uniqueness is per org. Examples: `UNIQUE(org_id, username)`, `UNIQUE(org_id, bill_no)`.
- Salon repositories are created per request from `TenantContext`, as `repos(ctx).sales.list(...)`. Every query adds `WHERE org_id = ?` itself, so handlers cannot forget it.
- **Guard test:** a test reads every SQL string in `data/tenant/*` and fails if a salon table is queried without `org_id`.
- **Cross-org test:** create two orgs, then for each salon endpoint check that org B's session cannot read or change org A's IDs.
- FM's single `settings` row (id=1) becomes `org_settings` with `org_id` as the primary key. `counters` gets `org_id` as part of its key.

### 4.3 Scaling path (not v1)
- **When a salon gets busy:** D1 is one writer per database. 40 salons each doing about 100 sales a day is far below its limits.
- **When we move storage:** swap `data/` for a MongoDB or Postgres adapter, with one database per org or `org_id`. Move salons one at a time, using a `storage` column on `orgs`.

---

## 5. Data model

### 5.1 Platform tables (no `org_id`)

| Table | Key columns |
|-------|-------------|
| `orgs` | `id` (ulid), `slug` UNIQUE, `name`, `status` (see §6), `plan_id`, `trial_ends_at`, `grace_ends_at`, `owner_user_id`, `country`, `created_at`, `deactivated_at`, `deleted_at` |
| `reserved_slugs` | `slug` (admin, www, api, app, platform, mail, support, …) |
| `plans` | `id` (`free`, `pro`, `pro_max`), `name`, `price_monthly` (0 / 200 / 499), `currency` (AED), `stripe_price_id`, `limits_json` (`max_staff`, `max_wa_msgs_month`), `active`, `sort` |
| `plan_features` | `plan_id`, `feature_key`. A row means the plan includes that feature. |
| `org_feature_overrides` | `org_id`, `feature_key`, `enabled` (1 forces on, 0 forces off), `reason`, `set_by`, `set_at` |
| `subscriptions` | `org_id` PK, `provider` (`none` or `stripe`), `stripe_customer_id`, `stripe_subscription_id`, `status`, `current_period_end`, `cancel_at` |
| `platform_users` | super admins: `id`, `email`, `password_hash`, `role` (`owner` or `support`), `session_version` |
| `platform_audit` | `who`, `action`, `org_id`, `before_json`, `after_json`, `at` (every super admin change) |
| `email_log` | `org_id`, `kind` (`welcome`, `trial_ending`, `grace_reminder_n`, `expired`, …), `to`, `status`, `sent_at`. Its unique key `(org_id, kind)` stops the same reminder going out twice. |
| `support_sessions` | impersonation: `code_hash`, `platform_user_id`, `org_id`, `expires_at`, `used_at`, `revoked_at` |
| `stripe_events` | `event_id` PK, so each webhook event is processed only once |

### 5.2 Salon tables (`org_id` added)

These are all the FM tables carried over:
- `users` (roles `owner`, `admin`, `barber`, i.e. `staff`)
- `customers`, `sales`, `sale_items`, `services`, `expenses`, `company_expenses`
- `counters`, `login_failures`, `rate_hits`, `push_tokens`
- `announcements`, `notifications`, `audit_log`, `ledger_entries`
- `barber_payouts`, `money_transfers`, `wa_campaigns`, `wa_messages`, `ratings`

Plus `org_settings`, which is FM's ~40 settings columns plus the new per-salon config in §8.

### 5.3 Migrations
FM's 20 migrations are squashed into a clean `0001_platform.sql` + `0002_tenant.sql`. The FM-only seed and backfill migrations (0001 settings row, 0004 sample services, 0012/0015/0020 backfills) are dropped. Signup fills in the starter data instead.

---

## 6. Subscription lifecycle

```
 signup ──▶ TRIAL (7d) ──trial_ends_at──▶ GRACE (7d) ──grace_ends_at──▶ EXPIRED ──super admin──▶ DEACTIVATED
               │                            │                             │                         │
               └──── pays (Stripe) ─────────┴────────── pays ─────────────┘                    or DELETED
                         ▼                                                                    (hard delete)
                      ACTIVE ──payment fails──▶ PAST_DUE (= GRACE rules, 7d) ──▶ EXPIRED
                         │
                         └─ cancels ──▶ active until period end ──▶ EXPIRED
```

| Status | Salon can | Banner | Emails |
|--------|-----------|--------|--------|
| `trial` | Use everything in the trial plan | "Trial: N days left. Upgrade" | Welcome (day 0); "trial ends in 2 days" (day 5) |
| `active` | Use everything in their plan | — | Receipts (from Stripe) |
| `grace` / `past_due` | **Use everything** (D13) | Red: "Trial ended. Your data is deleted in N days. Upgrade" | **One reminder every day for 7 days** (days 7–13) |
| `expired` | Log in to the upgrade page and Excel export only | Full-screen "Upgrade to continue" | "Account expired" (day 14) |
| `deactivated` | Nothing (login blocked: "contact support") | — | "Account deactivated" |
| `deleted` | — (`orgs.deleted_at` is set; salon rows are purged) | — | — |

**How the lifecycle runs:**
- The hourly cron moves each org between states based on `trial_ends_at` and `grace_ends_at`. Each move is idempotent and logged to `platform_audit`.
- Reminder emails are queued, and the `(org_id, kind)` key in `email_log` makes sure each goes out only once.
- **Nothing is deleted automatically.** Expired salons appear in the super admin's "Expired" queue, where they can **Extend trial**, **Deactivate** or **Delete**.
- Delete requires typing the slug to confirm. It first produces a JSON/SQL export of the org, then purges the org's rows table by table in batches, then sets `deleted_at`. The slug stays reserved for 30 days.

**Write guard middleware:** this follows PropFusion's billing guard. When the status is not `trial`, `active`, `grace` or `past_due`, salon write requests (POST/PATCH/DELETE) get `402 subscription_inactive`. Login, logout, billing, export and `/api/me` stay allowed. Super admin routes are not affected.

---

## 7. Plans, features and the super admin

### 7.1 Feature keys (from FM's modules), in `packages/features`

| Key | What it gates | Free | Pro | Pro Max |
|-----|---------------|:----:|:---:|:-------:|
| `core_sales` | Sales, bills, receipts, staff, services (always on) | ✅ | ✅ | ✅ |
| `expenses` | Staff and shop expenses | ✅ | ✅ | ✅ |
| `daily_sheet` | Daily sheet report | ✅ | ✅ | ✅ |
| `customers_crm` | Customer list, visit history, opt-out | — | ✅ | ✅ |
| `ratings` | Rating page and Google review redirect | — | ✅ | ✅ |
| `reports_advanced` | Monthly and yearly reports, dashboard ranges | — | ✅ | ✅ |
| `excel_export` | Excel downloads | — | ✅ | ✅ |
| `push` | Push notifications, end-of-day summary | — | ✅ | ✅ |
| `announcements` | Announcements to staff | — | ✅ | ✅ |
| `ledger` | Shop and barber books, payouts, transfers | — | — | ✅ |
| `audit_log` | Audit log page | — | — | ✅ |
| `whatsapp` | WhatsApp bills, rating requests, reminders | — | — | ✅ |
| `whatsapp_campaigns` | Bulk campaigns, templates | — | — | ✅ |
| `public_services_api` | Public price list API for the salon's own website | — | — | ✅ |
| **Limit: `max_staff`** | Enforced when staff are created (unlike PropFusion's `max_users`) | 2 | 10 | unlimited |

This split is only the starting point. The super admin can change any cell in the plan matrix (§7.4) without a deploy.

**Trial:** a new salon gets **Pro Max features for 7 days**. WhatsApp is the exception, since it needs setup per salon (§9).

### 7.2 Which features a salon gets
```
effective(org) = (plan_features[org.plan_id] ∪ overrides.enabled=1) − overrides.enabled=0
```
This is computed once per request, cached per isolate for 60 s, and dropped from the cache when the super admin changes something.

Only the super admin changes features, through the plan matrix or per-salon overrides. Salon owners see their features as read-only, with an "Upgrade" button for locked ones.

### 7.3 Enforcement in two places
- **API:** `requireFeature('ledger')` middleware on each module's router returns `403 feature_disabled`. Without this check, hiding a menu item would be cosmetic only.
- **Frontend:** `GET /api/me` returns:
  ```
  { user, org: {name, slug, logo, currency, tz…}, features: [...], limits, subscription: {status, trialEndsAt, graceEndsAt, plan} }
  ```
  The `useMe()` hook feeds:
  - Navigation (FM's `nav.ts`), where each item has `feature?: FeatureKey` and `roles: Role[]`.
  - `<FeatureGate feature="ledger">` for routes. When locked, it shows an "Upgrade to unlock" card instead of a 404.
  - `<SubscriptionBanner/>` and the full-screen expired state.

### 7.4 Super admin panel (`admin.<domain>` or `/platform` on workers.dev)

| Page | Contents |
|------|----------|
| **Overview** | Salon counts by status, trials ending this week, salons in grace, monthly revenue (once Stripe is in), signups chart |
| **Salons** | Table: name, slug, status, plan, trial or grace end, staff count, sales in the last 30 days, last activity, created date. Filters by status and plan; search. |
| **Salon detail** | Profile and owner contact. Change plan. Extend trial or grace (+N days). **Per-salon feature overrides** (a toggle per feature, showing what the plan gives vs. the override, with a reason). Limits override. Deactivate or reactivate. Delete (type the slug, export first). **Log in as salon** (60-second single-use code, 2-hour session, audited, red "Support mode" banner). Email log. Audit trail. |
| **Plans** | Plan editor: name, price, Stripe price ID, limits, a **feature matrix** (rows are features, columns are plans, toggles in the cells), active or hidden |
| **Expired queue** | Salons past day 14 with bulk Deactivate, Delete or Extend |
| **Platform users** | Super admin accounts (owner or support role) |
| **Audit** | Every platform change |

No global master password (a PropFusion anti-pattern). Support access only through audited impersonation.

---

## 8. Settings per salon (replacing what FM hardcodes)

| FM hardcode | SalonStation `org_settings` field | Default for a new salon |
|-------------|--------------------------------|-------------------------|
| "FM Salon" / "Faizan Mohammed…" | `display_name`, `legal_name` | from signup |
| Logo PNGs / base64 logo | `logo_url` (R2) | generated monogram |
| Brand colour | `brand_color` | SalonStation accent |
| AED / fils, `en-AE` | `currency` (ISO), `currency_minor` (100), `locale` | by country (AE gives AED / en-AE) |
| UTC+4, `Asia/Dubai` | `timezone` (IANA) | by country |
| 4 AM day start | `day_start_hour` | 4 |
| UAE phone rules, +971 | `phone_country` (E.164 calling code); phone code generalised | by country |
| `FM-` bill prefix | `bill_prefix` | first 2–3 letters of the slug, upper case |
| `fm_session` cookie | `ss_session` (one for all salons, holds `orgId`) | — |
| 5% VAT, TRN, licence | already settings: `vat_enabled`, `vat_rate`, `trn`, `licence_no` | VAT off |
| Salon WhatsApp number, address, Instagram, Google review URL | `contact_phone`, `address`, `instagram_url`, `google_review_url` | blank (setup checklist) |
| Admin "Faizan" + 8 starter barbers | Signup creates **only the owner**. The owner adds staff. | — |
| Sample services | Optional "add starter services" button in setup | — |

Money, date and phone helpers (`money.ts`, `format.ts`, `pdf.ts`, `bill.tsx`, `excel.ts`, `scheduled.ts`) take the org's settings as input instead of constants. Unit tests cover AED/Dubai and one other setup (e.g. INR/Kolkata).

---

### 8.1 Product brand is config (D12)
The product name, root domain and sender email are **not hardcoded anywhere**. They live in one place:
- **API:** wrangler `vars`: `BRAND_NAME="SalonStation"`, `ROOT_DOMAIN` (empty means workers.dev mode), `ADMIN_HOST`, `MAIL_FROM`, `SUPPORT_EMAIL`.
- **Web and site:** `packages/brand` exports the same values at build time (`NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_ROOT_DOMAIN`), plus logo and favicon files.

Changing the domain or name later means editing those values, adding the DNS and routes (P7) and redeploying. Email templates, the landing page, page titles and the PWA manifest all read from `brand`.

## 9. Integrations per salon

- **Email (platform):** Cloudflare Email Service from `no-reply@<domain>`, with branding via the FM templates. Used for welcome, trial and grace reminders, expiry and password reset. Sent through the Queue, with three retries.
- **WhatsApp (v1: a setting per salon, set up by the super admin):**
  - Each salon brings its own Meta WhatsApp Business account (WABA): phone ID, WABA ID and token.
  - The token is stored encrypted (AES-GCM, key in the `SECRETS_KEY` secret) on `org_settings`.
  - Template names lose the `fm_` prefix (`ss_bill`, `ss_rating`, …), and setup creates them for each WABA.
  - The webhook finds the org by `phone_number_id`.
  - **Fixes FM's gap:** the webhook GET must check a verify token.
- **Push:** one **SalonStation Firebase project** for all salons, replacing the hardcoded `fm-salon-app`. Push tokens carry `org_id`.
- **Google review:** already the per-salon `google_review_url`.
- **Images:** logos and staff photos move from D1 BLOBs to **R2** under `org/<id>/…`. This keeps the shared D1 small. It's optional for v1 but recommended.

---

## 10. Signup flow

```
site /signup form
  salon name → slug (auto, live availability check: GET /api/public/slug?s=)
  owner name, email, phone, password, country, Turnstile token
        │ POST /api/public/signup
        ▼
API (one D1 batch = all or nothing, avoiding PropFusion's half-built tenants)
  1. validate + Turnstile verify + rate-limit per IP + reserved/duplicate slug
  2. INSERT orgs (status=trial, trial_ends_at=now+7d, grace_ends_at=now+14d)
  3. INSERT org_settings (country defaults), subscriptions (provider=none)
  4. INSERT users (role=owner)
  5. INSERT email_log(welcome) + enqueue welcome email
        ▼
response: { loginUrl: https://<slug>.<domain>/  (or /login?org=<slug> on workers.dev) }
site redirects → dashboard, already signed in (one-time login token in URL, 60s, single use)
        ▼
first login: Setup checklist (logo, services, staff, VAT, Google review link)
```

The welcome email includes the salon's portal link, the Salon ID, the trial end date and an "Upgrade" link.

---

## 11. Stripe (phase 6)

- **Upgrade page:** pick a plan. `POST /api/billing/checkout` creates a Stripe Checkout Session in `subscription` mode with the org's Stripe customer, and redirects to Stripe.
- **Webhook `POST /api/stripe/webhook`:**
  - The signature is checked, and `stripe_events` makes each event processed only once.
  - Events handled: `checkout.session.completed`, `customer.subscription.updated` / `deleted`, `invoice.payment_failed` / `paid`.
  - The handler updates `subscriptions` and `orgs.status` / `plan_id`.
- **Manage billing:** links to the Stripe Billing Portal.
- **Super admin:** can still set a plan by hand (`provider=manual`) for salons paying offline.

---

## 12. Build phases

| Phase | Delivers | Exit check |
|-------|----------|------------|
| **P0 Foundation** | Monorepo, `packages/ui` from FM, wrangler with the Affworld0 account (Workers Paid), D1 platform and salon schema, `data/` layer with `org_id` scoping and its guard test, tenant resolver, org-bound session | Two seeded orgs; the cross-org test passes |
| **P1 Port FM features** | All FM modules under `tenant/*`, settings per salon (§8), FM UI working for any org | FM's full flow works for an AED org and an INR org |
| **P1b FM Salon import** (D16) | Script that reads the `fm-salon-db` export and writes it into SalonStation as org `fm`. It adds `org_id`, maps settings to `org_settings`, re-keys counters, and keeps bill numbers and the `FM-` prefix. Carries over WhatsApp credentials, encrypted. Staff re-enable push once, because the Firebase project changes. | Dry run on staging matches FM's totals (sales, ledger balances, customers) exactly. Cutover in the early hours with FM's Worker redirecting to `fm.<domain>`. FM is on a manually assigned plan (`provider=manual`). |
| **P2 Features and plans** | `packages/features`, plans tables, effective features, `requireFeature`, `/api/me`, dynamic nav, `FeatureGate`, banners | Turning a feature off hides it in the UI and returns 403 from the API |
| **P3 Signup and onboarding** | `apps/site` (landing, pricing, signup), Turnstile, signup API, welcome email via Queue, setup checklist | A new salon is live in under 1 minute from signup |
| **P4 Super admin** | Platform auth, salon list and detail, overrides, plan matrix, impersonation, audit | Rahul can run every salon from the panel |
| **P5 Lifecycle** | Cron state machine, reminder emails, write guard, expired queue, deactivate, delete with export | A salon with a fake clock goes through trial → grace → expired correctly |
| **P6 Stripe** | Checkout, webhook, portal, manual plans | A test-mode payment moves the salon to `active` |
| **P7 Domain go-live** | Buy the domain, move its nameservers to Cloudflare, wildcard DNS `*`, Worker routes, site on the root domain, propfusion.io salon page | `anything.<domain>` reaches the right salon |
| **P8 WhatsApp per salon** | Encrypted credentials, template setup, webhook routing by `phone_number_id` | One pilot salon sends bills over WhatsApp |

P0 to P5 make up the **launchable trial product**. Stripe (P6) must ship before the first trials end, i.e. within 7 days of the first real signup.

---

## 13. Testing
- Vitest with `@cloudflare/vitest-pool-workers` and a local D1.
- **Must-have suites:**
  - Cross-org isolation for every salon route.
  - The SQL guard test from §4.2.
  - Lifecycle state machine with an injected clock.
  - `effective features` maths.
  - Money and timezone helpers for two locales.
  - Signup being all-or-nothing (a failure anywhere leaves nothing behind).
  - Stripe webhook processing each event only once.
- **Staging:** a Worker `salonsync-staging` with its own D1, as FM does.

## 14. Open questions
None. All were answered on 2026-11-02 (D12–D18).

**Downgrading to Free:**
- Free is permanent, so Free salons never go through the grace or expiry path.
- When a paid salon downgrades, or a trial salon picks Free, the salon keeps all its data. Features above Free are locked (data hidden, not deleted).
- If staff exceed 2, the extra staff are deactivated by the owner's choice. Nobody is deleted.
