# SalonKit

Multi-salon SaaS on Cloudflare Workers + D1 (Hono). Monorepo: `apps/api`, `packages/*`.

> **Cloudflare account warning:** this project belongs to the Affworld0 account (account_id `dd501fac7d8aa896ead9530b9cd1b913`). Run wrangler only with `XDG_CONFIG_HOME=~/.wrangler-affworld`, and never deploy to any other account. Plan 1 does not deploy at all.

## Setup

```sh
npm install
printf 'SESSION_SECRET=%s\nSECRETS_KEY=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -base64 32)" > apps/api/.dev.vars   # gitignored, never commit
npm run db:migrate:local -w @ss/api
npm run db:seed:local -w @ss/api      # demo orgs alpha (free) and bravo (trial); owner, barber1, barber2 / pass1234
npm run dev -w @ss/api                # http://localhost:8787
```

Try it (`npm run dev -w @ss/api` clears `ROOT_DOMAIN` locally, so the org comes from the request body; in production `ROOT_DOMAIN=salonkit.online` and the org comes from the `<slug>.salonkit.online` host. Images on the workers.dev fallback host 404 because only tenant hosts resolve a salon):

```sh
curl -c j -X POST localhost:8787/api/auth/login -H 'content-type: application/json' \
  -d '{"org":"alpha","username":"owner","password":"pass1234"}'
curl -b j localhost:8787/api/me
```

The seed is re-runnable. It inserts a few services, two barbers, four sales (with items), one barber expense and one company expense per org, directly in SQL (bravo also gets WhatsApp automations off, no `org_whatsapp` row, three ratings and three notifications), together with the ledger lines the API would post for them, so the demo ledger balances agree with the demo reports.

## Modules and routes

All tenant routes are under `/api`, need a session (`ss_session`), and keep FM's paths. Each router is gated by a feature key (`core_sales` is always on):

| Feature key | Routes or jobs |
|---|---|
| `core_sales` | `/me`, `/settings`, staff (`/users`, avatars), `/services`, `/sales`, receipts, `/reports/me`, `/reports/overview`, `/customers` (barber autocomplete) |
| `expenses` | `/expenses`, `/company-expenses` |
| `daily_sheet` | `/reports/daily` |
| `reports_advanced` | `/reports/monthly` |
| `excel_export` | no routes yet (reserved) |
| `ledger` | `/ledger/*`, `/payouts`, `/transfers` |
| `customers_crm` | admin customer list and detail (`/customers`, `/customers/:id`) |
| `audit_log` | `/sales/:id/history` and the audit viewer |
| `ratings` | `/ratings`; public rating page `/api/public/feedback/:token`, `/api/public/review/:token` |
| `push` | `/push/tokens`, `/notifications`, `/notifications/read`; cron jobs: end-of-day summary and barber reminder (push) |
| `announcements` | `/announcements` (in-app plus push) |
| `whatsapp` | `/whatsapp/config`, `/sales/:id/whatsapp`, `/customers/:id/whatsapp` (opt-out), `/wa/reminders/run`, `/wa/feedback/run`, webhook `/api/wa/webhook`; cron jobs: visit reminders, rating requests and their reminder |
| `whatsapp_campaigns` | `/wa/templates`, `/wa/test`, `/wa/audience`, `/wa/campaigns`, `/wa/campaigns/:id/next`, `/wa/media`; cron job: campaign drain |
| `public_services_api` | `/api/public/services` |

Public routes (no session) live on `publicApi` at `/api/public` (avatars, services list, receipts), rate-limited per IP.

**Stale edits (409):** edits and deletes that reverse and repost ledger lines (sales, company expenses, barber expenses, payouts, transfers, opening balances) are compare-and-set on `updated_at`. If another write won, the API answers `409 {"error": ..., "code": "stale"}` and changes nothing; the client should reload and retry. Paged lists clamp `?page` to 100000.

## Secrets

Set with `wrangler secret put <NAME>` (never commit values; local ones go in the gitignored `apps/api/.dev.vars`):

| Name | Purpose |
|---|---|
| `SESSION_SECRET` | Signs session cookies |
| `SECRETS_KEY` | Base64 of 32 random bytes; AES-GCM key that encrypts each org's WhatsApp access token (`org_whatsapp.token_enc`) |
| `FCM_SERVICE_ACCOUNT` | Firebase service-account JSON, one FCM project for all salons. Unset: push sends are skipped |
| `WA_APP_SECRET` | Meta app secret; verifies the `X-Hub-Signature-256` on webhook POSTs (503 without it) |
| `WA_VERIFY_TOKEN` | Token for Meta's webhook GET handshake |
| `DEV_ALLOWED_ORIGINS` | **Local only, in `.dev.vars`; never set in production.** Comma-separated origins allowed to write cross-origin, e.g. `http://localhost:3000` for `next dev` |

## WhatsApp webhook

Give Meta the callback URL `https://<app host>/api/wa/webhook` and set its verify token to the value of `WA_VERIFY_TOKEN`. The signature is required on every POST. The org is resolved from the payload's `phone_number_id` (unique in `org_whatsapp`).

## Cron

`wrangler.jsonc` runs the Worker on `*/10 * * * *`. Each invocation is held to the Workers free plan: a budget of **40 subrequests** (WhatsApp Graph calls; FCM costs 1 per token plus 1 OAuth) and **45 D1 statements** (every statement in a batch counts). Within that:

- It loads every served org in one statement and works in each org's local hours (`org_settings.timezone` and `day_start_hour`), not UTC.
- Once-a-day push jobs (end-of-day summary, barber reminder) claim `job_runs(org_id, job, day)` with `INSERT OR IGNORE`, so exactly one tick runs each per org per business day. `job_runs` rows older than 7 days are pruned (with `rate_hits` and `login_failures`) at the top of the hour.
- Orgs are visited in a rotation: the start offset steps by a stride coprime to the org count, so every org is reached over consecutive ticks when the budget cannot cover all of them.
- A campaign batch may use at most half a tick's statements, so a big campaign never starves the other jobs. Due work that does not fit stays due for the next tick.

## Free-plan campaign limits

A WhatsApp campaign goes to at most 1000 recipients (a bigger audience is refused with 400), and an org may have one unfinished campaign at a time (409 `campaign_running`).

## Migrations

`0001_platform`, `0002_tenant_core`, `0003_seed_plans` (frozen), `0004_core` (services, audit_log, rate_hits), `0005_users_ci` (case-insensitive usernames), `0006_sales` (customers, sales, sale_items), `0007_expenses` (expenses, company_expenses), `0008_ledger` (ledger_entries, barber_payouts, money_transfers), `0009_engagement` (org_settings wa_*, org_whatsapp, org_assets, push_tokens, notifications, announcements, ratings, wa_campaigns, wa_messages), `0010_jobs` (job_runs).

## Test

```sh
npm test
npm run typecheck
```

## Plan seed

`apps/api/migrations/0003_seed_plans.sql` is an applied migration and is frozen. Future plan or price changes go in a new numbered migration or the super-admin UI, not by regenerating it with `scripts/gen-plan-seed.ts`.

## Docs

- Spec: [docs/superpowers/specs/2026-11-02-salonsync-saas-design.md](docs/superpowers/specs/2026-11-02-salonsync-saas-design.md)
- Plan 1: [docs/superpowers/plans/2026-11-02-plan-1-foundation.md](docs/superpowers/plans/2026-11-02-plan-1-foundation.md)

## Salon dashboard (apps/web)

FM Salon's web app, ported per salon. It is a Next static export that the API Worker serves on the same origin (`wrangler.jsonc` `assets`, `run_worker_first: ["/api/*"]`). Menus, pages and buttons follow `GET /api/me`:
- the user's role (the owner counts as admin)
- the salon's features: locked pages show an Upgrade card and make no API calls
- the subscription: a trial or grace banner, and a read-only screen once expired
- the salon's settings: currency and its decimals, time zone, day start, phone country, name and logo

```bash
npm run build -w @ss/web                 # -> apps/web/out, served by `npm run dev -w @ss/api` on :8787
npm run dev -w @ss/web                   # next dev on :3000, /api proxied to :8787
                                         # needs DEV_ALLOWED_ORIGINS=http://localhost:3000 in apps/api/.dev.vars
npm run e2e -w @ss/web                   # Playwright smoke (build + migrate + seed first)
```

Build env (`NEXT_PUBLIC_*`, not secret):
- `NEXT_PUBLIC_BRAND_NAME` (default SalonKit)
- `NEXT_PUBLIC_ROOT_DOMAIN`: `salonkit.online` in `.env.production`. On `<slug>.salonkit.online` login needs no salon ID.
- `NEXT_PUBLIC_SUPPORT_EMAIL`: the Upgrade card's contact address.
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_VAPID_KEY`: one SalonKit Firebase project. While these are unset, push is off and the service worker does nothing.

`test/brand-guard.test.ts` fails the build if FM, AED, Dubai or +971 values are hardcoded in `apps/web/src`.

## Domain

Salons live at `<slug>.salonkit.online` and the super admin at `admin.salonkit.online`. The zone is on the Affworld0 Cloudflare account, and the route `*.salonkit.online/*` is in `wrangler.jsonc`. The zone needs one proxied DNS record, `*` → AAAA `100::`, so the subdomains reach the Worker. The apex is kept for the marketing site (Plan 4).

## Marketing site and signup (apps/site)

`salonkit.online` (and `www`) is the marketing site: landing, pricing, signup and sign-in. It is a static export served by the assets-only Worker `salonkit-site`. `salonkit.online/api/*` goes to `salonkit-app`, which is a more specific route, so the signup form posts same-origin.

How signup works:
- `GET /api/public/slug?s=` checks whether a Salon ID is free.
- `POST /api/public/signup` creates a 7-day Pro Max trial salon in one D1 batch (all or nothing). It is limited to 5 per IP per hour, and the Turnstile check is optional.
- The response gives a single-use, 120-second `handoff_url`. Opening it on `<slug>.salonkit.online` signs the owner in, and the owner signs in later with their email and password.
- The dashboard shows a setup checklist from `GET /api/settings/setup` until every step is done.

```bash
npm run dev -w @ss/site                 # :3001, /api proxied to wrangler on :8787
npm run build -w @ss/site               # -> apps/site/out
npm run e2e -w @ss/web                  # includes the signup -> handoff -> dashboard flow
```

Going live needs:
- **DNS** in the `salonkit.online` zone: apex `@` and `www`, AAAA `100::`, proxied. The wildcard `*` record already exists.
- **Turnstile (optional):** create a widget for `salonkit.online` in the Cloudflare dashboard.
  - Run `wrangler secret put TURNSTILE_SECRET` in apps/api.
  - Put `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>` in `apps/site/.env.production.local`, which is gitignored.
- **Deploy:**
  - Run `npm run db:migrate:remote` (or `wrangler d1 migrations apply salonkit-db --remote`) in apps/api, then build and deploy the web app and the API as before.
  - Then deploy the site: `cd apps/site && npm run build && wrangler deploy`. Use `XDG_CONFIG_HOME=~/.wrangler-affworld`.

## Super admin panel (`admin.salonkit.online`)

The `/platform/*` pages of `apps/web`, served by the same Worker. On `admin.<domain>` every other page redirects there; on
workers.dev or localhost open `/platform/`. The API is `/api/platform/*` (`apps/api/src/platform/admin.ts`) with its own
cookie `ss_platform` (12 hours), which only works on the admin host.

- **Roles:** `owner` changes anything; `support` can look and use "Log in as salon", but can't change plans or delete.
- **Log in as salon:** a 60-second single-use link opens a 2-hour session as the salon's owner, with a red Support mode
  banner. Every link and every sign-in is in the platform audit.
- **Every change** (plan, trial/grace extension, mark as paid, feature override with a reason, staff limit,
  deactivate/reactivate, delete) writes `platform_audit` and refreshes the salon's features.
- **Delete** is a soft delete: you type the salon ID, nobody can sign in, and the owner's email is free again.

Add a super admin (prints the SQL; the password is shown once and never stored in git):

```sh
cd apps/api
node --experimental-strip-types scripts/platform-user.ts you@example.com owner > /tmp/pu.sql
XDG_CONFIG_HOME=~/.wrangler-affworld npx wrangler d1 execute salonkit-db --remote --file /tmp/pu.sql && rm /tmp/pu.sql
```

Running it again for the same email resets the password and signs that person out everywhere.
