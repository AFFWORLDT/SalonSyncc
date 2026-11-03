# AI connect (MCP) Implementation Plan

> Executed inline (superpowers:executing-plans), per the user's standing preference.

**Goal:** Salon owners/admins connect Claude to their salon over MCP; super-admin-only switch.
**Spec:** `docs/superpowers/specs/2026-11-03-mcp-connect-design.md`
**Architecture:** Hand-rolled stateless JSON-RPC MCP endpoint at `POST /mcp` on the salon host; tokens/OAuth in D1;
each tool calls the app's own `/api/*` route in-process with a 2-minute signed session for the token's user, so
features, roles, read-only rules and audit stay identical to the app.

## Global Constraints
- Workers free plan: no new bindings; CPU < 10 ms; ≤ 50 D1 statements per call.
- Tokens `skt_` + 40 url-safe chars, SHA-256 at rest, shown once. Access 1 h, refresh 30 d rotating, auth code 5 min, request 10 min.
- Limits: 60/min per connection, 120/min per salon; 20 auth failures/10 min per IP → 1 h block; 5 active connections per salon; body ≤ 64 KB.
- Owner/admin only; not in support mode; `mcp_api` only via super-admin override.

## Rulings made while planning (spec deviations)
- R1: No `@modelcontextprotocol/sdk` at runtime — a ~150-line JSON-RPC handler (initialize, ping, tools/list, tools/call, notifications) is cheaper on the free plan's CPU; the SDK's `Client` is a devDependency used in the protocol test, so conformance is still proven. Cost if wrong: swap the handler for the SDK transport later.
- R2: Tools proxy existing routes in-process instead of re-implementing queries. Audit actor gets " via AI connect (<name>)" through an env-only marker (`MCP_VIA`), never a header.
- R3: Money stays in the routes' minor units; every tool result carries `currency: { code, minor_per_unit }`, and tool descriptions say so. Write tools take major units (as the app does). Cost if wrong: an LLM mis-scales; mitigated by the descriptions.
- R4: Tools map to the routes that exist: `get_overview(from,to)` (today by default), `get_daily_sheet(month)`, `get_monthly_report(year)`, `add_expense` = company expense (note, amount, day, paid_from).
- R5: `/mcp`, `/oauth/*`, `/.well-known/*` added to `run_worker_first`.

## Tasks
1. Feature gate: `mcp_api`, `OVERRIDE_ONLY`, label, plan editor refuses, pro_max/trial exclude. Tests in `packages/features` + `apps/api/test/mcp-feature.test.ts`.
2. Migration `0014_mcp.sql` + `src/data/mcp.ts` (clients, requests, tokens, calls, prune).
3. `src/mcp/auth.ts`: issue/verify tokens (one joined query), IP block, rate limits, guard errors.
4. `src/mcp/server.ts` + `src/mcp/tools.ts`: JSON-RPC handler and tool registry proxying routes; `MCP_VIA` relabel in tenantAuth.
5. `src/mcp/oauth.ts`: well-known, DCR, authorize, token, revoke; tenant `/api/mcp/*` (keys, consent, calls); platform `/api/platform/orgs/:id/mcp`.
6. Cron prune; wrangler `run_worker_first`; security headers on the new paths.
7. Web: `/ai-connect/`, `/connect/authorize/`, super-admin section, nav + ⌘K entry; tests.
8. Full suites, review, merge, deploy, live check with `claude mcp add`.

## Review Focus
- Token for org A on org B's host → refused.
- Feature switched off on another isolate → refused at once (D1 read, not cache).
- Refresh-token reuse → whole connection revoked.
- A barber's or demoted admin's token → refused.
- Writes on an expired salon → `read_only`, nothing written.
