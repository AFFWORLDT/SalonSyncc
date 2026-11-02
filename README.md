# SalonStation

Multi-salon SaaS on Cloudflare Workers + D1 (Hono). Monorepo: `apps/api`, `packages/*`.

> **Cloudflare account warning:** this project belongs to the Affworld0 account (account_id `dd501fac7d8aa896ead9530b9cd1b913`). Run wrangler only with `XDG_CONFIG_HOME=~/.wrangler-affworld`, and never deploy to any other account. Plan 1 does not deploy at all.

## Setup

```sh
npm install
printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)" > apps/api/.dev.vars   # gitignored, never commit
npm run db:migrate:local -w @ss/api
npm run db:seed:local -w @ss/api      # demo orgs alpha (free) and bravo (trial); owner / pass1234
npm run dev -w @ss/api                # http://localhost:8787
```

Try it (local mode has `ROOT_DOMAIN=""`, so the org comes from the request body):

```sh
curl -c j -X POST localhost:8787/api/auth/login -H 'content-type: application/json' \
  -d '{"org":"alpha","username":"owner","password":"pass1234"}'
curl -b j localhost:8787/api/me
```

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
