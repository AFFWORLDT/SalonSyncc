/**
 * AI connect over HTTP, on the salon host (https://<slug>.<root>): the MCP endpoint POST /mcp, OAuth 2.1 for Claude's
 * custom connector (RFC 9728 / 8414 metadata, RFC 7591 registration, PKCE S256 authorization code, rotating refresh
 * tokens, RFC 7009 revocation) and the per-call guard: body cap, IP block, bearer check, rate limits.
 * Spec: docs/superpowers/specs/2026-11-03-mcp-connect-design.md. Every path here is outside /api (wrangler run_worker_first).
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import type { Org } from "../data/platform";
import { platformRepo } from "../data/platform";
import { slugFromHost } from "../core/tenant";
import { featuresFor } from "../core/features-cache";
import { settingsRepo } from "../data/tenant/settings";
import { mcpRepo, parseScopes, TOKEN_RE, MAX_CONNECTIONS, type McpPrincipal, type McpScope } from "../data/tenant/mcp";
import { mcpClientById, mcpClientCreate, mcpClientTouch, rateHit } from "../data/infra";
import { hourWindow, minuteWindow } from "../lib/limits";
import { b64url, randomToken } from "../core/crypto";
import { handleRpc, type Fetcher } from "./server";

export const MAX_BODY = 64 * 1024;
export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_TTL_MS = 30 * 86_400_000;
export const REQUEST_TTL_MS = 10 * 60_000;
export const CODE_TTL_MS = 5 * 60_000;
export const PER_CONNECTION_PER_MIN = 60;
export const PER_SALON_PER_MIN = 120;
export const AUTH_FAILS_BEFORE_BLOCK = 20;
const FAIL_WINDOW_MS = 10 * 60_000;
const BLOCK_MS = 60 * 60_000;
const REGISTER_PER_HOUR = 10;
const AUTHORIZE_PER_MIN = 20;
const MAX_STATE = 500;
const TOKEN_PER_MIN = 30;

const ip = (c: Context<AppEnv>) => c.req.header("CF-Connecting-IP") ?? "unknown";
const origin = (c: Context<AppEnv>) => new URL(c.req.url).origin;
export const resourceUrl = (o: string) => `${o}/mcp`;
const metadataUrl = (o: string) => `${o}/.well-known/oauth-protected-resource`;

/** The salon of this host, or null (not a salon host, unknown, deactivated or deleted). */
async function hostOrg(c: Context<AppEnv>): Promise<Org | null> {
  const h = slugFromHost(new URL(c.req.url).host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST);
  if (h.kind !== "tenant") return null;
  const org = await platformRepo(c.env.DB).orgBySlug(h.slug);
  if (!org || org.status === "deactivated" || org.status === "deleted") return null;
  return org;
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id", "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function json(c: Context<AppEnv>, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors, ...headers } });
}
const guardError = (c: Context<AppEnv>, status: number, error: string, message: string, extra: { retry_after?: number; www?: boolean } = {}) =>
  json(c, { error, message, ...(extra.retry_after ? { retry_after: extra.retry_after } : {}) }, status, {
    ...(extra.retry_after ? { "Retry-After": String(extra.retry_after) } : {}),
    ...(extra.www ? { "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl(origin(c))}"` } : {}),
  });

// ---------- IP block, per salon (Claude's connectors share egress IPs, so one salon's noise must never block another) ----------
// rate_hits rows are in minute units so the cron prune (data/infra.ts) keeps the live ones: mcp-fail:<org>:<ip> counts
// unknown tokens in a 10-minute bucket (window = the bucket's first minute); mcp-block:<org>:<ip> stores the minute it ends.

async function blockedFor(db: D1Database, orgId: string, addr: string, now: number): Promise<number> {
  const r = await db.prepare("SELECT window FROM rate_hits WHERE key = ?").bind(`mcp-block:${orgId}:${addr}`).first<{ window: number }>();
  const left = r ? (r.window - minuteWindow(now)) * 60 : 0;
  return left > 0 ? left : 0;
}

async function authFailed(db: D1Database, orgId: string, addr: string, now: number): Promise<void> {
  const n = await rateHit(db, `mcp-fail:${orgId}:${addr}`, Math.floor(now / FAIL_WINDOW_MS) * (FAIL_WINDOW_MS / 60_000));
  if (n >= AUTH_FAILS_BEFORE_BLOCK) {
    await db
      .prepare("INSERT INTO rate_hits (key, window, n) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window = excluded.window, n = 1")
      .bind(`mcp-block:${orgId}:${addr}`, minuteWindow(now + BLOCK_MS))
      .run();
  }
}

const bearer = (c: Context<AppEnv>): string | null => {
  const h = c.req.header("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1]! : null;
};

/** Live owner/admin with the feature on: null when allowed, else the guard's refusal. */
function refusal(p: McpPrincipal): { status: number; error: string; message: string } | null {
  if (!p.active || (p.role !== "owner" && p.role !== "admin")) return { status: 401, error: "invalid", message: "This connection's user can no longer use AI connect. Ask an owner or admin to connect again." };
  if (p.feature_on !== 1) return { status: 403, error: "disabled", message: "AI connect is switched off for this salon. Ask SalonKit support to switch it on." };
  return null;
}

/** The body as text, or null over MAX_BODY bytes (counted on the wire, not in characters). */
async function readBody(c: Context<AppEnv>): Promise<string | null> {
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > MAX_BODY) return null;
  const buf = await c.req.arrayBuffer();
  return buf.byteLength > MAX_BODY ? null : new TextDecoder().decode(buf);
}

async function formOrJson(c: Context<AppEnv>): Promise<Record<string, string>> {
  const text = (await readBody(c)) ?? "";
  const type = c.req.header("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const o = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    }
  } catch {
    return {};
  }
  return Object.fromEntries(new URLSearchParams(text));
}

async function pkceOk(verifier: string, challenge: string): Promise<boolean> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))) === challenge;
}

/** Redirect URIs a public client may register: https, or a loopback http address (Claude Code, MCP Inspector). */
export function redirectAllowed(u: string): boolean {
  if (u.length > 500) return false;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
}

/**
 * The access + refresh pair for an OAuth connection. A new connection (`cap`) is refused (null) when the salon already
 * has MAX_CONNECTIONS; a rotation reuses its connection and passes no cap.
 */
async function issuePair(db: D1Database, orgId: string, t: { userId: number; connectionId: string; name: string; scopes: McpScope[]; clientId: string }, cap?: number) {
  const repo = mcpRepo(db, orgId);
  const now = Date.now();
  const access = await repo.issue({ ...t, kind: "access", expiresAt: now + ACCESS_TTL_MS }, cap);
  if (!access) return null;
  const refresh = await repo.issue({ ...t, kind: "refresh", expiresAt: now + REFRESH_TTL_MS });
  if (!refresh) return null;
  await mcpClientTouch(db, t.clientId, now);
  return { access_token: access.secret, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh.secret, scope: t.scopes.join(" ") };
}

export function mcpHttp(inner: Fetcher): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  for (const p of ["/mcp", "/oauth/token", "/oauth/register", "/oauth/revoke", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp"]) {
    r.options(p, (c) => new Response(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "86400" } }));
  }

  // ---------- metadata ----------
  const resourceMeta = async (c: Context<AppEnv>) => {
    if (!(await hostOrg(c))) return json(c, { error: "Not found" }, 404);
    const o = origin(c);
    return json(c, { resource: resourceUrl(o), authorization_servers: [o], scopes_supported: ["read", "write"], bearer_methods_supported: ["header"], resource_name: "SalonKit" });
  };
  r.get("/.well-known/oauth-protected-resource", resourceMeta);
  r.get("/.well-known/oauth-protected-resource/mcp", resourceMeta);
  const serverMeta = async (c: Context<AppEnv>) => {
    if (!(await hostOrg(c))) return json(c, { error: "Not found" }, 404);
    const o = origin(c);
    return json(c, {
      issuer: o,
      authorization_endpoint: `${o}/oauth/authorize`,
      token_endpoint: `${o}/oauth/token`,
      registration_endpoint: `${o}/oauth/register`,
      revocation_endpoint: `${o}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read", "write"],
    });
  };
  r.get("/.well-known/oauth-authorization-server", serverMeta);
  r.get("/.well-known/oauth-authorization-server/mcp", serverMeta);

  // ---------- the MCP endpoint ----------
  r.on(["GET", "DELETE", "PUT", "PATCH"], "/mcp", (c) => json(c, { error: "method_not_allowed", message: "Use POST (stateless Streamable HTTP, JSON responses)." }, 405, { Allow: "POST, OPTIONS" }));

  r.post("/mcp", async (c) => {
    const now = Date.now();
    const db = c.env.DB;
    const text = await readBody(c);
    if (text === null) return guardError(c, 413, "too_large", `Requests are limited to ${MAX_BODY / 1024} KB`);
    const org = await hostOrg(c);
    if (!org) return json(c, { error: "not_found", message: "No salon at this address" }, 404);

    const addr = ip(c);
    const secret = bearer(c);
    if (!secret) return guardError(c, 401, "invalid", "Connect with an API key or sign in with OAuth", { www: true });
    const repo = mcpRepo(db, org.id);
    // A live token always gets through; the block only stops guessing (unknown tokens) from this IP on this salon.
    const principal = TOKEN_RE.test(secret) ? await repo.principal(secret, ["key", "access"], now) : null;
    if (!principal) {
      const blocked = await blockedFor(db, org.id, addr, now);
      if (blocked) return guardError(c, 429, "blocked", "Too many failed sign-ins from this network. Try again later.", { retry_after: blocked });
      if (!TOKEN_RE.test(secret) || !(await repo.known(secret))) await authFailed(db, org.id, addr, now);
      return guardError(c, 401, "invalid", "This key or token is not valid for this salon (wrong salon, expired or revoked)", { www: true });
    }
    const no = refusal(principal);
    if (no) return guardError(c, no.status, no.error, no.message);

    const win = minuteWindow(now);
    const [conn, salon] = await db.batch<{ n: number }>([
      db.prepare(RATE_SQL).bind(`mcp-c:${principal.connection_id}`, win),
      db.prepare(RATE_SQL).bind(`mcp-o:${org.id}`, win),
    ]);
    if ((conn.results[0]?.n ?? 0) > PER_CONNECTION_PER_MIN || (salon.results[0]?.n ?? 0) > PER_SALON_PER_MIN) {
      return guardError(c, 429, "rate_limited", "Too many requests. Slow down a little.", { retry_after: 60 - Math.floor((now % 60_000) / 1000) });
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json(c, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }

    const [{ features }, settings] = await Promise.all([featuresFor(db, org), settingsRepo(db, org.id).get()]);
    const logs: D1PreparedStatement[] = [repo.touch(principal.token_id, addr, now)];
    let exec: ExecutionContext;
    try {
      exec = c.executionCtx as unknown as ExecutionContext;
    } catch {
      exec = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    }
    const out = await handleRpc(body, {
      env: c.env,
      exec,
      org,
      origin: origin(c),
      principal,
      features,
      currency: { code: settings.currency, minor_per_unit: settings.currency_minor },
      fetch: inner,
      onCall: (tool, ok, error, ms) => logs.push(repo.logCall({ connectionId: principal.connection_id, tool, ok, error, ms })),
    });
    await db.batch(logs);
    if (out === null) return new Response(null, { status: 202, headers: cors });
    return json(c, out);
  });

  // ---------- OAuth 2.1 ----------
  r.post("/oauth/register", async (c) => {
    if (!(await hostOrg(c))) return json(c, { error: "Not found" }, 404);
    if ((await rateHit(c.env.DB, `mcp-reg:${ip(c)}`, hourWindow(Date.now()) * 60)) > REGISTER_PER_HOUR) return json(c, { error: "rate_limited", error_description: "Too many registrations" }, 429);
    const text = await readBody(c);
    let b: Record<string, unknown> = {};
    try {
      b = JSON.parse(text ?? "") as Record<string, unknown>;
    } catch {
      return json(c, { error: "invalid_client_metadata", error_description: "Send JSON" }, 400);
    }
    const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
    if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed)) return json(c, { error: "invalid_redirect_uri", error_description: "1 to 5 https (or loopback http) redirect URIs" }, 400);
    if (b.token_endpoint_auth_method !== undefined && b.token_endpoint_auth_method !== "none") return json(c, { error: "invalid_client_metadata", error_description: "Only public clients (token_endpoint_auth_method none)" }, 400);
    const name = (typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim() : "AI app").slice(0, 80);
    const id = `mc_${randomToken(16)}`;
    await mcpClientCreate(c.env.DB, { id, name, redirect_uris: uris });
    return json(c, { client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000) }, 201);
  });

  r.get("/oauth/authorize", async (c) => {
    const org = await hostOrg(c);
    if (!org) return json(c, { error: "Not found" }, 404);
    if ((await rateHit(c.env.DB, `mcp-auth:${ip(c)}`, minuteWindow(Date.now()))) > AUTHORIZE_PER_MIN) return json(c, { error: "rate_limited", error_description: "Too many requests" }, 429, { "Retry-After": "60" });
    const q = c.req.query();
    const client = q.client_id ? await mcpClientById(c.env.DB, q.client_id) : null;
    // Unknown client or redirect URI: never redirect (RFC 6749 4.1.2.1).
    if (!client) return json(c, { error: "invalid_client", error_description: "Unknown client_id" }, 400);
    if (!q.redirect_uri || !client.redirect_uris.includes(q.redirect_uri)) return json(c, { error: "invalid_request", error_description: "redirect_uri is not registered for this client" }, 400);
    const back = (error: string, description: string) => {
      const u = new URL(q.redirect_uri!);
      u.searchParams.set("error", error);
      u.searchParams.set("error_description", description);
      if (q.state) u.searchParams.set("state", q.state);
      return c.redirect(u.toString(), 302);
    };
    if (!(await mcpRepo(c.env.DB, org.id).featureOn())) return back("access_denied", "AI connect isn't switched on for this salon. Ask SalonKit support.");
    if (q.response_type !== "code") return back("unsupported_response_type", "Only response_type=code");
    if (q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge ?? "")) return back("invalid_request", "PKCE with S256 is required");
    if (q.resource && q.resource.replace(/\/$/, "") !== resourceUrl(origin(c))) return back("invalid_target", "Unknown resource");
    // State comes back to the client verbatim; one too long to keep is refused rather than silently cut.
    if (q.state && q.state.length > MAX_STATE) return json(c, { error: "invalid_request", error_description: `state is limited to ${MAX_STATE} characters` }, 400);
    await mcpClientTouch(c.env.DB, client.id);
    const scopes = parseScopes(q.scope ?? "read write").join(" ");
    const id = await mcpRepo(c.env.DB, org.id).createRequest({ client_id: client.id, redirect_uri: q.redirect_uri, state: q.state ?? null, code_challenge: q.code_challenge!, scopes }, REQUEST_TTL_MS);
    return c.redirect(`/connect/authorize/?req=${encodeURIComponent(id)}`, 302);
  });

  r.post("/oauth/token", async (c) => {
    const org = await hostOrg(c);
    if (!org) return json(c, { error: "Not found" }, 404);
    if ((await rateHit(c.env.DB, `mcp-tok:${ip(c)}`, minuteWindow(Date.now()))) > TOKEN_PER_MIN) return json(c, { error: "rate_limited", error_description: "Too many requests" }, 429, { "Retry-After": "60" });
    const b = await formOrJson(c);
    const repo = mcpRepo(c.env.DB, org.id);
    const grant = (description: string) => json(c, { error: "invalid_grant", error_description: description }, 400);

    if (b.grant_type === "authorization_code") {
      if (!b.code || !b.code_verifier || !b.redirect_uri || !b.client_id) return json(c, { error: "invalid_request", error_description: "code, code_verifier, redirect_uri and client_id are required" }, 400);
      const req = await repo.redeem(b.code);
      if (!req || req.user_id === null) return grant("The code is invalid, expired or already used");
      if (req.client_id !== b.client_id || req.redirect_uri !== b.redirect_uri) return grant("The code was issued to another client or redirect URI");
      if (!(await pkceOk(b.code_verifier, req.code_challenge))) return grant("PKCE verification failed");
      const client = await mcpClientById(c.env.DB, req.client_id);
      const scopes = parseScopes(req.scopes);
      const pair = await issuePair(c.env.DB, org.id, { userId: req.user_id, connectionId: `cn_${randomToken(12)}`, name: client?.name ?? "AI app", scopes, clientId: req.client_id }, MAX_CONNECTIONS);
      if (!pair) return grant(`This salon already has ${MAX_CONNECTIONS} AI connections. Revoke one on the AI connect page, then connect again.`);
      return json(c, pair);
    }

    if (b.grant_type === "refresh_token") {
      if (!b.client_id) return json(c, { error: "invalid_request", error_description: "client_id is required" }, 400);
      if (!b.refresh_token || !TOKEN_RE.test(b.refresh_token)) return grant("Unknown refresh token");
      const p = await repo.principal(b.refresh_token, ["refresh"]);
      if (!p) {
        const dead = await repo.deadRefresh(b.refresh_token);
        // A rotated (already used) refresh token came back: it leaked or was replayed, so the whole connection goes.
        if (dead?.why === "rotated") {
          await repo.revokeConnection(dead.connection_id);
          return grant("This refresh token was already used; the connection was revoked. Connect again.");
        }
        return grant(dead ? "This connection was revoked. Connect again." : "Unknown or expired refresh token");
      }
      if (p.client_id !== b.client_id) return grant("The refresh token was issued to another client");
      const no = refusal(p);
      if (no) return json(c, { error: "invalid_grant", error_description: no.message }, 400);
      if (!(await repo.consumeRefresh(p.token_id))) {
        await repo.revokeConnection(p.connection_id);
        return grant("This refresh token was already used; the connection was revoked. Connect again.");
      }
      const pair = await issuePair(c.env.DB, org.id, { userId: p.user_id, connectionId: p.connection_id, name: p.name, scopes: p.scopes, clientId: p.client_id ?? "" });
      return pair ? json(c, pair) : grant("This connection's user can no longer use AI connect");
    }

    return json(c, { error: "unsupported_grant_type", error_description: "authorization_code or refresh_token" }, 400);
  });

  r.post("/oauth/revoke", async (c) => {
    const org = await hostOrg(c);
    if (!org) return json(c, { error: "Not found" }, 404);
    const b = await formOrJson(c);
    if (b.token && TOKEN_RE.test(b.token)) {
      const repo = mcpRepo(c.env.DB, org.id);
      const p = await repo.principal(b.token, ["access", "refresh", "key"]);
      if (p) await repo.revokeConnection(p.connection_id);
    }
    return new Response(null, { status: 200, headers: cors });
  });

  return r;
}

const RATE_SQL = `INSERT INTO rate_hits (key, window, n) VALUES (?, ?, 1)
  ON CONFLICT(key) DO UPDATE SET n = CASE WHEN window = excluded.window THEN n + 1 ELSE 1 END, window = excluded.window
  RETURNING n`;
