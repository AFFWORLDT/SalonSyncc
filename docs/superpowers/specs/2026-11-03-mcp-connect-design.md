# AI connect (MCP) for SalonKit — design

Date: 2026-11-03 · Status: draft for review · Reference: deHertz MCP (`dehertz-Api/docs/superpowers/specs/2026-10-10-mcp-server-design.md`, `dehertz-Api/tests/mcp_server/`, `dehertz-app` dashboard/mcp + connect/authorize)

## 1. Goal

A salon owner or admin can connect Claude (or any MCP client) to their salon and ask things like "what were today's sales?",
"who are my top customers this month?" or "add a 40 AED cleaning expense". It is a premium feature that **only the super admin
can switch on** for a salon; no plan includes it.

Success: on a salon the super admin enabled, an owner connects Claude in under two minutes (custom connector or Claude Code),
gets correct answers scoped to their salon only, and loses access the moment the feature, their role or their key is removed.

Decided with the user: powers = read + safe writes; who = owner and admins only.

## 2. Constraints

- Workers free plan: no Durable Objects, Queues or KV; keep CPU per request under 10 ms; D1 only.
- Same Worker (`salonkit-app`), same D1 (`salonkit-db`), same tenant rules (every query filtered by `org_id`).
- No secrets in git; tokens stored only as SHA-256 hashes and shown once.
- Brand copy says "AI connect"; currency always from the salon's settings (no hard-coded "AED" in code, brand-guard test).

## 3. Architecture

- **Server:** official `@modelcontextprotocol/sdk` with its web-standard Streamable HTTP transport, **stateless** and
  `enableJsonResponse: true` (no SSE, no sessions), mounted in Hono at `POST /mcp` on the salon host
  (`https://<slug>.salonkit.online/mcp`). `GET`/`DELETE /mcp` answer 405. A fresh `McpServer` is built per request with only
  the tools the caller may use.
  - Risk check, first plan task: bundle size and CPU of the SDK on Workers. If one call costs over ~8 ms CPU, fall back to
    a small hand-rolled JSON-RPC handler for `initialize`, `tools/list`, `tools/call` and `ping` with the same tool registry.
- **Auth:** our own OAuth 2.1 and API keys on D1, modelled on deHertz (no `workers-oauth-provider`, which needs KV).
- **Tenant binding:** the token's `org_id` must equal the org resolved from the host; a mismatch is `invalid`.
- **Code layout:** `apps/api/src/mcp/` — `routes.ts` (Hono mount, well-known, oauth), `auth.ts` (tokens, verify, guard),
  `oauth.ts` (DCR, authorize, token, revoke), `tools/*.ts` (one file per area, reusing the existing tenant repos), `server.ts`
  (build McpServer from the registry). Web: `apps/web/src/app/ai-connect/`, `apps/web/src/app/connect/authorize/`, and a
  section on `apps/web/src/app/platform/salons/view/`.

## 4. Feature gate

- New feature key `mcp_api`, label "AI connect".
- New export `OVERRIDE_ONLY: readonly FeatureKey[] = ["mcp_api"]` in `@ss/features`:
  - `effectiveFeatures` ignores `mcp_api` coming from plan features; only an `org_feature_overrides` row with `enabled = 1` adds it.
  - `PLAN_DEFAULTS.pro_max.features` becomes `FEATURE_KEYS` minus `OVERRIDE_ONLY` (so trials don't get it either).
  - The super-admin plan matrix editor refuses `mcp_api` ("switch it per salon").
  - `/plan` page lists it as "On request".
- Switched on/off only from the super-admin salon page (existing `PUT /platform/orgs/:id/features/mcp_api`, reason required, audited).
- **Off means off at once:** the `/mcp` verify query reads the override row from D1 directly (not the 60 s isolate cache).
  Turning it off keeps tokens but refuses every call with `disabled`; turning it back on restores them. "Revoke all" is a separate button.

## 5. Tools (v1)

All tools return JSON text content; money as `{ amount, display }` (`amount` in major units, `display` with the salon's currency).
Dates are the salon's local `YYYY-MM-DD`. A tool is listed only if the salon has the feature it depends on.

| Tool | Scope | Needs feature | Reuses |
|---|---|---|---|
| `get_today` (sales, expenses, net, bills, per barber) | read | core_sales | dashboard |
| `search_sales` (q, date range, barber, page) | read | core_sales | sales list |
| `get_bill` (bill no) | read | core_sales | sales |
| `get_daily_sheet` (date) | read | daily_sheet | daily sheet |
| `get_monthly_summary` (month) | read | reports_advanced | reports |
| `get_ledger_balances` | read | ledger | ledger |
| `search_customers` (q, page) | read | customers_crm | customers |
| `get_customer` (id) with recent visits | read | customers_crm | customers |
| `list_ratings` (date range) | read | ratings | ratings |
| `list_staff` | read | core_sales | users |
| `list_services` | read | core_sales | services |
| `list_expenses` (date range) | read | expenses | expenses |
| `get_audit_log` (date range, page) | read | audit_log | audit |
| `add_expense` (amount, category, note, date ≤ today) | write | expenses | expenses create |
| `send_announcement` (title, body) | write | announcements | announcements create |

- "Add customer note" from the earlier draft is **dropped**: customers have no notes column; not worth a migration in v1.
- Writes go through the same repo functions as the app, so validation, read-only (expired) rules and audit rows are identical;
  the audit actor reads "<user name> via AI connect (<key or app name>)".
- Page sizes capped at 50; date ranges capped at 92 days.

## 6. Connecting

### 6.1 Claude custom connector (OAuth 2.1)
- `GET /.well-known/oauth-protected-resource` → resource `https://<slug>.salonkit.online/mcp`, auth server = same host.
- `GET /.well-known/oauth-authorization-server` → endpoints below, `code_challenge_methods_supported: ["S256"]`,
  `token_endpoint_auth_methods_supported: ["none"]`, scopes `read write`.
- `POST /oauth/register` (DCR): public clients only; `redirect_uris` must be https (or `http://localhost`/`127.0.0.1`); max 5 URIs, name ≤ 80 chars.
- `GET /oauth/authorize`: validates client, redirect URI, `response_type=code`, PKCE S256 (required), stores an `mcp_auth_requests`
  row (10 min) and redirects to `/connect/authorize/?req=<id>` on the same host.
- Consent page (web, needs the normal salon login; owner/admin only; not in support mode): shows app name, salon, scopes.
  The user can only narrow scopes; `read` is always granted. Approve → `POST /api/mcp/consent` → one-time code (5 min) → redirect.
- `POST /oauth/token`: `authorization_code` (PKCE verify) and `refresh_token`. Access token 1 h, refresh 30 d,
  refresh **rotates**; reusing an old refresh token revokes the whole connection.
- `POST /oauth/revoke` (RFC 7009, always 200).
- 401 from `/mcp` carries `WWW-Authenticate: Bearer resource_metadata="https://<slug>.salonkit.online/.well-known/oauth-protected-resource"`.

### 6.2 API keys (Claude Code and scripts)
- Created on the AI connect page: name, scopes (read / read+write), expiry 7/30/90/365 days or never.
- Shown once with a ready command: `claude mcp add --transport http salonkit https://<slug>.salonkit.online/mcp --header "Authorization: Bearer <key>"`.

### 6.3 Token format
`skt_` + 40 url-safe random chars. Stored as SHA-256 hex; the list shows `skt_…last4`.

## 7. Data (migration `0014_mcp.sql`)

```
mcp_clients        id TEXT PK, name, redirect_uris_json, created_at          -- global (DCR is pre-tenant), like rate_hits
mcp_auth_requests  id TEXT PK, org_id, client_id, redirect_uri, state, code_challenge, scopes, user_id NULL,
                   code_hash NULL, expires_at, created_at
mcp_tokens         id TEXT PK, org_id, user_id, kind ('key'|'access'|'refresh'), connection_id, name,
                   token_hash UNIQUE, last4, scopes, client_id NULL, expires_at NULL, revoked_at NULL,
                   replaced_by NULL, last_used_at NULL, last_ip NULL, created_at
mcp_calls          id INTEGER PK, org_id, connection_id, tool, ok (0/1), error NULL, ms, at
```
- Indexes: `mcp_tokens(org_id, connection_id)`, `mcp_calls(org_id, at)`.
- A **connection** = one API key, or one OAuth grant (its access + refresh tokens share `connection_id`).
- Max **5 active connections per salon**; the 6th is refused with a clear message.
- Hourly cron prunes expired auth requests, expired/revoked tokens older than 7 days, and `mcp_calls` older than 30 days.

## 8. Per-call checks (in order)

1. Body ≤ 64 KB, `Content-Type: application/json`, else 413/415.
2. IP blocked? (20 auth failures from one IP in 10 min → blocked 1 h, `rate_hits` key `mcp-authfail:<ip>`) → 429 `blocked`.
3. Bearer → one D1 query joining token + user + org + override: token unrevoked and unexpired, `org_id` = host org,
   user active and role owner/admin, org not deleted/deactivated, `mcp_api` override on. Failure → 401 `invalid`
   (counts toward the IP block) or 403 `disabled`.
4. Rate limit via `rate_hits`: 60/min per connection, 120/min per salon → 429 `rate_limited` with `retry_after`.
5. Tool scope (`write` tools need the write scope) → `scope`; salon expired/read-only → writes refused with `read_only`.
6. Run the tool; write an `mcp_calls` row; update `last_used_at`/`last_ip` at most once a minute.

Errors inside tools are MCP tool results with `isError: true` and JSON `{ error, message, retry_after? }`; codes:
`invalid`, `disabled`, `blocked`, `rate_limited`, `scope`, `read_only`, `not_found`, `bad_input`.
About 5 D1 operations per call.

## 9. Screens

- **Salon "AI connect" page** (sidebar under Settings, owner/admin, only when `mcp_api` is on; otherwise the page explains
  "Ask SalonKit support to switch on AI connect"): server URL with Copy, Claude connector steps, Claude Code command,
  connections list (name, kind, scopes, created, last used, expiry) with Edit scopes / Revoke, "New API key" dialog,
  last 50 calls.
- **Consent page** `/connect/authorize/`.
- **Super admin** (salon view): AI connect switch (the existing override control), connection count, last call time,
  recent calls, "Revoke all connections". No separate global dashboard in v1.
- ⌘K palette: "AI connect" page entry when available.

## 10. Edge cases

| Situation | Result |
|---|---|
| Super admin switches it off | Calls refused `disabled`; switched on again → work again |
| Salon expired (read-only) | Reads work, writes `read_only` |
| Admin demoted to barber / deactivated | Their connections fail `invalid` on the next call |
| Support mode | Cannot create keys or approve consent |
| Token for salon A used on salon B's host | `invalid` |
| Refresh token reused | Whole connection revoked |
| Salon deleted | All tokens refused; pruned with the org |

## 11. Testing

- **API (vitest + `@cloudflare/vitest-plugin`, existing setup):** OAuth happy path (DCR → authorize → consent → token → call),
  PKCE mismatch, expired code, redirect URI mismatch, refresh rotation and reuse revocation; key create/expiry/revoke;
  refusals for scope, disabled, barber, wrong host, deleted org, rate limit, IP block, 64 KB cap; each tool's tenant isolation
  (two orgs, data never crosses); `OVERRIDE_ONLY` (pro_max and trial don't get `mcp_api`, plan matrix refuses it);
  protocol test with the SDK's client: `initialize`, `tools/list` (filtered by features and scope), `tools/call`.
- **Web (vitest + Testing Library):** AI connect page (off state, key dialog shows the key once), consent page (narrow scopes,
  read locked on), super-admin switch and revoke all.
- **Live check after deploy:** on a test salon, `claude mcp add` with a key, ask "what were today's sales?", revoke, confirm refusal.
  Then add it as a Claude custom connector and repeat. No FM data.

## 12. Out of scope (v1)

AI-generated summaries inside tools, MCP resources/prompts, SSE streaming, per-plan limit tiers, a global super-admin MCP dashboard,
customer notes, barber access.
