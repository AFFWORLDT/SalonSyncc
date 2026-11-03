import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { b64url } from "../src/core/crypto";
import { PLAN_DEFAULTS } from "@ss/features";
import { featuresFor, invalidateFeatures } from "../src/core/features-cache";
import { AUTH_FAILS_BEFORE_BLOCK, MAX_BODY, PER_CONNECTION_PER_MIN } from "../src/mcp/http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "salonkit.online", ADMIN_HOST: "admin" };
const host = (slug: string) => `https://${slug}.salonkit.online`;
const go = (url: string, init: RequestInit = {}) => app.fetch(new Request(url, init), E, ctx);
const j = async (r: Response): Promise<any> => r.json();
let ipN = 0;
const freshIp = () => `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`;

async function salon(slug: string, opts: { on?: boolean; plan?: "free" | "pro" | "pro_max"; status?: "active" | "expired" } = {}) {
  const org = await makeOrg({ slug, plan: opts.plan ?? "pro_max", status: opts.status ?? "active" });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const adm = await makeUser(org.id, { username: "adm", role: "admin" });
  const bar = await makeUser(org.id, { username: "bar", role: "barber" });
  if (opts.on !== false) await setFeature(org.id, 1);
  const ck = await loginAs(slug, "own", "pass1234", `${slug}.salonkit.online`);
  return { org, own, adm, bar, ck };
}
async function setFeature(orgId: string, enabled: 0 | 1) {
  await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,?,?) ON CONFLICT(org_id, feature_key) DO UPDATE SET enabled = excluded.enabled")
    .bind(orgId, "mcp_api", enabled, Date.now()).run();
  invalidateFeatures(orgId);
}
const api = (slug: string, method: string, path: string, cookie: string, body?: unknown) =>
  go(`${host(slug)}/api${path}`, { method, headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });

async function newKey(slug: string, cookie: string, scope: "read" | "write" = "write", expires_days: number | null = 30) {
  const r = await api(slug, "POST", "/mcp/keys", cookie, { name: "Laptop", scope, expires_days });
  expect(r.status).toBe(201);
  return (await j(r)) as { secret: string; connection_id: string; command: string; server_url: string };
}

let rpcId = 0;
const rpc = (slug: string, token: string | null, method: string, params?: unknown, ip = "10.0.0.1") =>
  go(`${host(slug)}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "cf-connecting-ip": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
const callTool = async (slug: string, token: string, name: string, args: unknown = {}) => {
  const r = await rpc(slug, token, "tools/call", { name, arguments: args });
  expect(r.status).toBe(200);
  const b = await j(r);
  const text = b.result.content[0].text as string;
  return { isError: !!b.result.isError, body: JSON.parse(text) };
};

describe("AI connect: who gets the feature", () => {
  it("no plan and no trial grants mcp_api; only the super admin's override does", async () => {
    expect(PLAN_DEFAULTS.pro_max.features).not.toContain("mcp_api");
    const a = await makeOrg({ slug: "mcp-plan-a", plan: "pro_max" });
    await env.DB.prepare("INSERT INTO plan_features(plan_id, feature_key) VALUES('pro_max','mcp_api')").run();
    try {
      expect((await featuresFor(env.DB, a)).features).not.toContain("mcp_api");
      await setFeature(a.id, 1);
      expect((await featuresFor(env.DB, a)).features).toContain("mcp_api");
    } finally {
      await env.DB.prepare("DELETE FROM plan_features WHERE plan_id='pro_max' AND feature_key='mcp_api'").run();
    }
  });

  it("the AI connect page says off until the super admin switches it on; keys need it", async () => {
    const s = await salon("mcp-off", { on: false });
    expect(await j(await api("mcp-off", "GET", "/mcp", s.ck))).toEqual({ enabled: false });
    expect((await api("mcp-off", "POST", "/mcp/keys", s.ck, { name: "x", scope: "read", expires_days: 7 })).status).toBe(403);
    await setFeature(s.org.id, 1);
    const page = await j(await api("mcp-off", "GET", "/mcp", s.ck));
    expect(page).toMatchObject({ enabled: true, server_url: "https://mcp-off.salonkit.online/mcp", max_connections: 5, connections: [], calls: [] });
  });

  it("barbers can't see or create keys", async () => {
    const s = await salon("mcp-barber");
    const bk = await loginAs("mcp-barber", "bar", "pass1234", "mcp-barber.salonkit.online");
    expect((await api("mcp-barber", "GET", "/mcp", bk)).status).toBe(403);
    expect((await api("mcp-barber", "POST", "/mcp/keys", bk, { name: "x", scope: "read", expires_days: 7 })).status).toBe(403);
    expect(s.org.id).toBeTruthy();
  });
});

describe("AI connect: API keys and the /mcp endpoint", () => {
  it("a key is shown once with the Claude Code command, stored hashed, and lists as a connection", async () => {
    const s = await salon("mcp-key");
    const k = await newKey("mcp-key", s.ck, "read", 7);
    expect(k.secret).toMatch(/^skt_[A-Za-z0-9_-]{40}$/);
    expect(k.command).toBe(`claude mcp add --transport http salonkit https://mcp-key.salonkit.online/mcp --header "Authorization: Bearer ${k.secret}"`);
    const row = await env.DB.prepare("SELECT token_hash, last4 FROM mcp_tokens WHERE org_id = ?").bind(s.org.id).first<any>();
    expect(row.token_hash).not.toContain(k.secret.slice(4));
    expect(row.last4).toBe(k.secret.slice(-4));
    const page = await j(await api("mcp-key", "GET", "/mcp", s.ck));
    expect(page.connections).toHaveLength(1);
    expect(page.connections[0]).toMatchObject({ kind: "key", name: "Laptop", scopes: ["read"], user_name: "own" });
    expect(JSON.stringify(page)).not.toContain(k.secret);
  });

  it("initialize, tools/list filtered by scope and features, and a read tool with the salon's currency", async () => {
    const s = await salon("mcp-read", { plan: "pro" });
    const k = await newKey("mcp-read", s.ck, "read");
    const init = await j(await rpc("mcp-read", k.secret, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }));
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeTruthy();
    const names = (await j(await rpc("mcp-read", k.secret, "tools/list"))).result.tools.map((t: any) => t.name);
    expect(names).toContain("get_overview");
    expect(names).toContain("search_customers");
    // Read-only key: no write tools. Pro plan: no ledger or audit log.
    expect(names).not.toContain("add_expense");
    expect(names).not.toContain("get_ledger_balances");
    expect(names).not.toContain("get_audit_log");
    const r = await callTool("mcp-read", k.secret, "get_overview");
    expect(r.isError).toBe(false);
    expect(r.body.currency).toEqual({ code: "AED", minor_per_unit: 100 });
    expect(r.body.data).toBeTruthy();
    const calls = await env.DB.prepare("SELECT tool, ok FROM mcp_calls WHERE org_id = ?").bind(s.org.id).all<any>();
    expect(calls.results).toEqual([{ tool: "get_overview", ok: 1 }]);
  });

  it("notifications get 202; unknown methods a JSON-RPC error; bad arguments a bad_input tool error", async () => {
    await salon("mcp-proto");
    const own = await loginAs("mcp-proto", "own", "pass1234", "mcp-proto.salonkit.online");
    const k = await newKey("mcp-proto", own);
    const n = await go(`${host("mcp-proto")}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${k.secret}` }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(n.status).toBe(202);
    expect((await j(await rpc("mcp-proto", k.secret, "nope/nope"))).error.code).toBe(-32601);
    const bad = await callTool("mcp-proto", k.secret, "get_daily_sheet", { month: "June" });
    expect(bad).toEqual({ isError: true, body: { error: "bad_input", message: '"month" has the wrong format' } });
    expect((await callTool("mcp-proto", k.secret, "get_overview", { extra: 1 })).body.error).toBe("bad_input");
    expect((await go(`${host("mcp-proto")}/mcp`, { method: "GET" })).status).toBe(405);
  });

  it("a write tool goes through the app's route, and the audit log says via AI connect", async () => {
    const s = await salon("mcp-write");
    const k = await newKey("mcp-write", s.ck, "write");
    const r = await callTool("mcp-write", k.secret, "add_expense", { amount: 40, note: "Cleaning supplies" });
    expect(r.isError).toBe(false);
    const row = await env.DB.prepare("SELECT amount, note, paid_from FROM company_expenses WHERE org_id = ?").bind(s.org.id).first<any>();
    expect(row).toEqual({ amount: 4000, note: "Cleaning supplies", paid_from: "cash" });
    const audit = await env.DB.prepare("SELECT actor_name, entity FROM audit_log WHERE org_id = ? AND entity = 'company_expense'").bind(s.org.id).first<any>();
    expect(audit.actor_name).toBe("own via AI connect (Laptop)");
    // The app's own validation answers for the route: a future day is refused.
    const future = await callTool("mcp-write", k.secret, "add_expense", { amount: 5, note: "x", day: "2999-01-01" });
    expect(future.body).toMatchObject({ error: "bad_input", message: "Pick a valid day (not in the future)" });
  });

  it("a read-only key can't write; an expired salon reads but never writes", async () => {
    const s = await salon("mcp-ro");
    const k = await newKey("mcp-ro", s.ck, "read");
    expect((await callTool("mcp-ro", k.secret, "add_expense", { amount: 1, note: "x" })).body.error).toBe("scope");
    const w = await newKey("mcp-ro", s.ck, "write");
    await env.DB.prepare("UPDATE orgs SET status = 'expired' WHERE id = ?").bind(s.org.id).run();
    invalidateFeatures(s.org.id);
    expect((await callTool("mcp-ro", w.secret, "get_overview")).isError).toBe(false);
    expect((await callTool("mcp-ro", w.secret, "add_expense", { amount: 1, note: "x" })).body.error).toBe("read_only");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM company_expenses WHERE org_id = ?").bind(s.org.id).first<any>()).n).toBe(0);
  });

  it("refusals: no token (with resource metadata), another salon's host, switched off, demoted user, revoked, expired", async () => {
    const a = await salon("mcp-ref-a");
    const b = await salon("mcp-ref-b");
    const k = await newKey("mcp-ref-a", a.ck, "read");
    const none = await rpc("mcp-ref-a", null, "tools/list");
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toBe('Bearer resource_metadata="https://mcp-ref-a.salonkit.online/.well-known/oauth-protected-resource"');
    expect((await rpc("mcp-ref-b", k.secret, "tools/list")).status).toBe(401);
    expect(b.org.id).not.toBe(a.org.id);

    await setFeature(a.org.id, 0);
    const off = await rpc("mcp-ref-a", k.secret, "tools/list");
    expect(off.status).toBe(403);
    expect((await j(off)).error).toBe("disabled");
    await setFeature(a.org.id, 1);
    expect((await rpc("mcp-ref-a", k.secret, "tools/list")).status).toBe(200);

    await env.DB.prepare("UPDATE users SET role = 'barber' WHERE org_id = ? AND id = ?").bind(a.org.id, a.own.id).run();
    expect((await rpc("mcp-ref-a", k.secret, "tools/list")).status).toBe(401);
    await env.DB.prepare("UPDATE users SET role = 'owner' WHERE org_id = ? AND id = ?").bind(a.org.id, a.own.id).run();

    expect((await api("mcp-ref-a", "DELETE", `/mcp/connections/${k.connection_id}`, a.ck)).status).toBe(200);
    expect((await rpc("mcp-ref-a", k.secret, "tools/list")).status).toBe(401);

    const e = await newKey("mcp-ref-a", a.ck, "read", 7);
    await env.DB.prepare("UPDATE mcp_tokens SET expires_at = ? WHERE org_id = ? AND connection_id = ?").bind(Date.now() - 1, a.org.id, e.connection_id).run();
    expect((await rpc("mcp-ref-a", e.secret, "tools/list")).status).toBe(401);
  });

  it("five connections per salon at most", async () => {
    const s = await salon("mcp-cap");
    for (let i = 0; i < 5; i++) await newKey("mcp-cap", s.ck, "read");
    const r = await api("mcp-cap", "POST", "/mcp/keys", s.ck, { name: "6th", scope: "read", expires_days: 7 });
    expect(r.status).toBe(409);
  });

  it("rate limit per connection, IP block after repeated bad tokens, and the 64 KB cap", async () => {
    const s = await salon("mcp-limit");
    const k = await newKey("mcp-limit", s.ck, "read");
    const conn = await env.DB.prepare("SELECT connection_id FROM mcp_tokens WHERE org_id = ?").bind(s.org.id).first<any>();
    await env.DB.prepare("INSERT INTO rate_hits(key, window, n) VALUES(?, ?, ?)").bind(`mcp-c:${conn.connection_id}`, Math.floor(Date.now() / 60_000), PER_CONNECTION_PER_MIN).run();
    const limited = await rpc("mcp-limit", k.secret, "tools/list");
    expect(limited.status).toBe(429);
    expect((await j(limited)).error).toBe("rate_limited");

    const ip = freshIp();
    const fake = `skt_${"a".repeat(40)}`;
    for (let i = 0; i < AUTH_FAILS_BEFORE_BLOCK; i++) expect((await rpc("mcp-limit", fake, "tools/list", undefined, ip)).status).toBe(401);
    const blocked = await rpc("mcp-limit", fake, "tools/list", undefined, ip);
    expect(blocked.status).toBe(429);
    expect((await j(blocked)).error).toBe("blocked");

    const big = await go(`${host("mcp-limit")}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${k.secret}` }, body: "x".repeat(MAX_BODY + 1) });
    expect(big.status).toBe(413);
  });

  it("tools only ever see their own salon", async () => {
    const a = await salon("mcp-iso-a");
    const b = await salon("mcp-iso-b");
    const kb = await newKey("mcp-iso-b", b.ck, "write");
    expect((await callTool("mcp-iso-b", kb.secret, "add_expense", { amount: 9, note: "B secret rent" })).isError).toBe(false);
    const k = await newKey("mcp-iso-a", a.ck, "write");
    expect((await callTool("mcp-iso-a", k.secret, "add_expense", { amount: 7, note: "A own rent" })).isError).toBe(false);
    const r = await callTool("mcp-iso-a", k.secret, "list_expenses");
    expect(JSON.stringify(r.body)).toContain("A own rent");
    expect(JSON.stringify(r.body)).not.toContain("B secret rent");
  });
});

describe("AI connect: review fixes", () => {
  it("bad tokens block that IP for one salon only, valid tokens still work, and expired tokens don't count", async () => {
    const a = await salon("mcp-blk-a");
    await salon("mcp-blk-b");
    const ka = await newKey("mcp-blk-a", a.ck, "read");
    const b = await loginAs("mcp-blk-b", "own", "pass1234", "mcp-blk-b.salonkit.online");
    const kb = await newKey("mcp-blk-b", b, "read");
    const ip = freshIp();
    // An expired (known) token is not a guess: it never counts toward the block.
    const old = await newKey("mcp-blk-a", a.ck, "read");
    await env.DB.prepare("UPDATE mcp_tokens SET expires_at = 1 WHERE org_id = ? AND connection_id = ?").bind(a.org.id, old.connection_id).run();
    for (let i = 0; i < AUTH_FAILS_BEFORE_BLOCK + 2; i++) expect((await rpc("mcp-blk-a", old.secret, "tools/list", undefined, ip)).status).toBe(401);
    expect((await rpc("mcp-blk-a", `skt_${"q".repeat(40)}`, "tools/list", undefined, ip)).status).toBe(401);
    for (let i = 0; i < AUTH_FAILS_BEFORE_BLOCK; i++) await rpc("mcp-blk-a", `skt_${"z".repeat(40)}`, "tools/list", undefined, ip);
    expect((await j(await rpc("mcp-blk-a", `skt_${"z".repeat(40)}`, "tools/list", undefined, ip))).error).toBe("blocked");
    expect((await rpc("mcp-blk-a", ka.secret, "tools/list", undefined, ip)).status).toBe(200);
    expect((await rpc("mcp-blk-b", kb.secret, "tools/list", undefined, ip)).status).toBe(200);
    expect((await rpc("mcp-blk-b", `skt_${"z".repeat(40)}`, "tools/list", undefined, ip)).status).toBe(401);
  });

  it("JSON-RPC batches are refused", async () => {
    const s = await salon("mcp-batch");
    const k = await newKey("mcp-batch", s.ck, "write");
    const one = { jsonrpc: "2.0", method: "tools/call", params: { name: "add_expense", arguments: { amount: 1, note: "x" } } };
    const r = await go(`${host("mcp-batch")}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${k.secret}` }, body: JSON.stringify([{ ...one, id: 1 }, { ...one, id: 2 }]) });
    expect((await j(r)).error.code).toBe(-32600);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM company_expenses WHERE org_id = ?").bind(s.org.id).first<any>()).n).toBe(0);
  });

  it("a password change or sign-out-everywhere ends the user's AI credentials", async () => {
    const s = await salon("mcp-sv");
    const k = await newKey("mcp-sv", s.ck, "read");
    expect((await rpc("mcp-sv", k.secret, "tools/list")).status).toBe(200);
    await env.DB.prepare("UPDATE users SET session_version = session_version + 1 WHERE org_id = ? AND id = ?").bind(s.org.id, s.own.id).run();
    expect((await rpc("mcp-sv", k.secret, "tools/list")).status).toBe(401);
  });

  it("/oauth/authorize refuses when the feature is off", async () => {
    const s = await salon("mcp-az", { on: false });
    const o = host("mcp-az");
    const reg = await j(await go(`${o}/oauth/register`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": freshIp() }, body: JSON.stringify({ client_name: "X", redirect_uris: ["https://claude.ai/cb"] }) }));
    const r = await go(`${o}/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: "https://claude.ai/cb", code_challenge: "c".repeat(43), code_challenge_method: "S256" })}`, { redirect: "manual" });
    expect(new URL(r.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM mcp_auth_requests WHERE org_id = ?").bind(s.org.id).first<any>()).n).toBe(0);
  });
});

describe("AI connect: OAuth for Claude's custom connector", () => {
  const verifier = "v".repeat(20) + "-verifier-0123456789abcdefghij";
  const challenge = async () => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": freshIp() }, body: new URLSearchParams(o).toString() });

  async function connect(slug: string, cookie: string, opts: { write?: boolean } = {}) {
    const o = host(slug);
    const meta = await j(await go(`${o}/.well-known/oauth-authorization-server`));
    expect(meta).toMatchObject({ issuer: o, code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
    const reg = await go(meta.registration_endpoint, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": freshIp() }, body: JSON.stringify({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }) });
    expect(reg.status).toBe(201);
    const { client_id } = await j(reg);
    const q = new URLSearchParams({ response_type: "code", client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: await challenge(), code_challenge_method: "S256", state: "st8", scope: "read write", resource: `${o}/mcp` });
    const auth = await go(`${o}/oauth/authorize?${q}`, { redirect: "manual" });
    expect(auth.status).toBe(302);
    const loc = auth.headers.get("location")!;
    expect(loc).toMatch(/^\/connect\/authorize\/\?req=ar_/);
    const req = new URL(loc, o).searchParams.get("req")!;
    const info = await j(await api(slug, "GET", `/mcp/requests/${req}`, cookie));
    expect(info).toMatchObject({ app_name: "Claude", redirect_host: "claude.ai", scopes: ["read", "write"] });
    const ok = await j(await api(slug, "POST", `/mcp/requests/${req}`, cookie, { approve: true, write: !!opts.write }));
    const back = new URL(ok.redirect);
    expect(back.origin + back.pathname).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(back.searchParams.get("state")).toBe("st8");
    const code = back.searchParams.get("code")!;
    const tok = await go(meta.token_endpoint, form({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: "https://claude.ai/api/mcp/auth_callback", client_id }));
    expect(tok.status).toBe(200);
    return { client_id, code, meta, tokens: await j(tok) };
  }

  it("register → authorize → consent → token → call, with read always granted and write only if ticked", async () => {
    const s = await salon("mcp-oauth");
    const { tokens } = await connect("mcp-oauth", s.ck);
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "read" });
    expect(tokens.access_token).toMatch(/^skt_/);
    const names = (await j(await rpc("mcp-oauth", tokens.access_token, "tools/list"))).result.tools.map((t: any) => t.name);
    expect(names).toContain("get_overview");
    expect(names).not.toContain("add_expense");
    const page = await j(await api("mcp-oauth", "GET", "/mcp", s.ck));
    expect(page.connections).toHaveLength(1);
    expect(page.connections[0]).toMatchObject({ kind: "oauth", name: "Claude", scopes: ["read"] });
  });

  it("a code is single use; a wrong PKCE verifier or redirect fails", async () => {
    const s = await salon("mcp-code");
    const { client_id, code, meta } = await connect("mcp-code", s.ck);
    const again = await go(meta.token_endpoint, form({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: "https://claude.ai/api/mcp/auth_callback", client_id }));
    expect((await j(again)).error).toBe("invalid_grant");
    const o = host("mcp-code");
    const bad = await go(`${o}/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id, redirect_uri: "https://evil.example/cb", code_challenge: await challenge(), code_challenge_method: "S256" })}`, { redirect: "manual" });
    expect(bad.status).toBe(400);
    const plain = await go(`${o}/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: "x", code_challenge_method: "plain" })}`, { redirect: "manual" });
    expect(new URL(plain.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
  });

  it("refresh rotates; reusing the old refresh token revokes the connection", async () => {
    const s = await salon("mcp-refresh");
    const { client_id, meta, tokens } = await connect("mcp-refresh", s.ck, { write: true });
    expect(tokens.scope).toBe("read write");
    const r1 = await j(await go(meta.token_endpoint, form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id })));
    expect(r1.access_token).toBeTruthy();
    expect(r1.refresh_token).not.toBe(tokens.refresh_token);
    expect((await rpc("mcp-refresh", r1.access_token, "tools/list")).status).toBe(200);
    const reuse = await go(meta.token_endpoint, form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id }));
    expect((await j(reuse)).error).toBe("invalid_grant");
    expect((await rpc("mcp-refresh", r1.access_token, "tools/list")).status).toBe(401);
    expect((await j(await go(meta.token_endpoint, form({ grant_type: "refresh_token", refresh_token: r1.refresh_token, client_id })))).error).toBe("invalid_grant");
  });

  it("declining sends access_denied back; support mode can't approve", async () => {
    const s = await salon("mcp-deny");
    const o = host("mcp-deny");
    const reg = await j(await go(`${o}/oauth/register`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": freshIp() }, body: JSON.stringify({ client_name: "X", redirect_uris: ["http://localhost:5555/cb"] }) }));
    const auth = await go(`${o}/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: "http://localhost:5555/cb", code_challenge: await challenge(), code_challenge_method: "S256" })}`, { redirect: "manual" });
    const req = new URL(auth.headers.get("location")!, o).searchParams.get("req")!;
    const no = await j(await api("mcp-deny", "POST", `/mcp/requests/${req}`, s.ck, { approve: false }));
    expect(new URL(no.redirect).searchParams.get("error")).toBe("access_denied");
    expect((await api("mcp-deny", "POST", `/mcp/requests/${req}`, s.ck, { approve: true })).status).toBe(404);
  });

  it("registration refuses non-https redirect URIs", async () => {
    await salon("mcp-reg");
    const r = await go(`${host("mcp-reg")}/oauth/register`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": freshIp() }, body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) });
    expect(r.status).toBe(400);
  });
});

describe("AI connect: the official MCP client", () => {
  it("connects, lists tools and calls one over Streamable HTTP", async () => {
    const s = await salon("mcp-sdk");
    const k = await newKey("mcp-sdk", s.ck, "read");
    const transport = new StreamableHTTPClientTransport(new URL(`${host("mcp-sdk")}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${k.secret}` } },
      fetch: ((input: RequestInfo | URL, init?: RequestInit) => go(String(input instanceof Request ? input.url : input), init)) as typeof fetch,
    });
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);
    expect(client.getServerVersion()?.name).toBe("salonkit");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("list_services");
    const res = await client.callTool({ name: "list_services", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse((res.content as { text: string }[])[0]!.text).currency.code).toBe("AED");
    await client.close();
  });
});
