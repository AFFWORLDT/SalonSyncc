# SalonStation

Multi-salon SaaS on Cloudflare Workers + D1 (Hono). Monorepo: `apps/api`, `packages/*`.

> **Cloudflare account warning:** this project belongs to the Affworld0 account (account_id `dd501fac7d8aa896ead9530b9cd1b913`). Run wrangler only with `XDG_CONFIG_HOME=~/.wrangler-affworld`, and never deploy to any other account. Plan 1 does not deploy at all.

## Setup

```sh
npm install
printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)" > apps/api/.dev.vars   # gitignored, never commit
npm run db:migrate:local -w @ss/api
npm run db:seed:local -w @ss/api      # demo orgs alpha (free) and bravo (trial); owner, barber1, barber2 / pass1234
npm run dev -w @ss/api                # http://localhost:8787
```

Try it (local mode has `ROOT_DOMAIN=""`, so the org comes from the request body):

```sh
curl -c j -X POST localhost:8787/api/auth/login -H 'content-type: application/json' \
  -d '{"org":"alpha","username":"owner","password":"pass1234"}'
curl -b j localhost:8787/api/me
```

The seed is re-runnable. It inserts a few services, two barbers, four sales (with items), one barber expense and one company expense per org, directly in SQL, together with the ledger lines the API would post for them, so the demo ledger balances agree with the demo reports.

## Modules and routes

All tenant routes are under `/api`, need a session (`ss_session`), and keep FM's paths. Each router is gated by a feature key (`core_sales` is always on):

| Feature key | Routes |
|---|---|
| `core_sales` | `/me`, `/settings`, staff (`/users`, avatars), `/services`, `/sales`, receipts, `/reports/me`, `/reports/overview`, `/customers` (barber autocomplete) |
| `expenses` | `/expenses`, `/company-expenses` |
| `daily_sheet` | `/reports/daily` |
| `reports_advanced` | `/reports/monthly` |
| `ledger` | `/ledger/*`, `/payouts`, `/transfers` |
| `customers_crm` | admin customer list and detail (`/customers`, `/customers/:id`) |
| `public_services_api` | `/api/public/services` |

Public routes (no session) live on `publicApi` at `/api/public` (avatars, services list, receipts), rate-limited per IP.

**Stale edits (409):** edits and deletes that reverse and repost ledger lines (sales, company expenses, barber expenses, payouts, transfers, opening balances) are compare-and-set on `updated_at`. If another write won, the API answers `409 {"error": ..., "code": "stale"}` and changes nothing; the client should reload and retry. Paged lists clamp `?page` to 100000.

## Migrations

`0001_platform`, `0002_tenant_core`, `0003_seed_plans` (frozen), `0004_core` (services, audit_log, rate_hits), `0005_users_ci` (case-insensitive usernames), `0006_sales` (customers, sales, sale_items), `0007_expenses` (expenses, company_expenses), `0008_ledger` (ledger_entries, barber_payouts, money_transfers).

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
