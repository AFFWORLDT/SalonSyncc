/**
 * The salon side of AI connect (owner/admin): the AI connect page's data, API keys, connection edits and revokes, and the
 * consent step of the OAuth flow (mcp/http.ts sends the browser to /connect/authorize/?req=<id>, which calls these).
 * Everything is mounted at "/" with the gate on each route, so unknown paths still fall through to the JSON 404.
 */
import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireAdmin } from "../../core/roles";
import { randomToken } from "../../core/crypto";
import { mcpRepo, MAX_CONNECTIONS, type McpScope } from "../../data/tenant/mcp";
import { mcpClientById } from "../../data/infra";
import { CODE_TTL_MS, resourceUrl } from "../../mcp/http";

export const mcp = new Hono<AppEnv>();

const bad = (m: string) => new HttpError(400, m);
const EXPIRY_DAYS = [7, 30, 90, 365] as const;

/** On only when the super admin switched AI connect on for this salon. */
const enabled: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.tenant.features.includes("mcp_api")) throw new HttpError(403, "AI connect isn't switched on for this salon. Ask SalonKit support.", "feature_disabled");
  await next();
};
/** Support mode (the super admin signed in as the owner) can look but never create credentials. */
const notSupport: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.tenant.supportBy !== null) throw new HttpError(403, "Support mode can't connect AI apps for the salon");
  await next();
};
const gate = [requireAdmin, enabled] as const;

const serverUrl = (c: Context<AppEnv>) => resourceUrl(new URL(c.req.url).origin);
const repoOf = (c: Context<AppEnv>) => mcpRepo(c.env.DB, c.var.tenant.org.id);
const scopesOf = (v: unknown): McpScope[] | null => (v === "read" ? ["read"] : v === "write" ? ["read", "write"] : null);

async function readJson(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const raw = await c.req.json().catch(() => null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

mcp.get("/mcp", requireAdmin, async (c) => {
  if (!c.var.tenant.features.includes("mcp_api")) return c.json({ enabled: false });
  const repo = repoOf(c);
  const [connections, calls] = await Promise.all([repo.connections(), repo.calls(50)]);
  return c.json({ enabled: true, server_url: serverUrl(c), max_connections: MAX_CONNECTIONS, connections, calls });
});

mcp.post("/mcp/keys", ...gate, notSupport, async (c) => {
  const b = await readJson(c);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) throw bad("Give the key a name, e.g. Claude on my laptop");
  const scopes = scopesOf(b.scope);
  if (!scopes) throw bad("Choose Read only or Read and write");
  const days = b.expires_days;
  if (!(days === null || EXPIRY_DAYS.includes(days as (typeof EXPIRY_DAYS)[number]))) throw bad("Expiry must be 7, 30, 90 or 365 days, or never");
  const repo = repoOf(c);
  const full = () => new HttpError(409, `A salon can have ${MAX_CONNECTIONS} AI connections. Revoke one first.`, "mcp_limit");
  if ((await repo.countConnections()) >= MAX_CONNECTIONS) throw full();
  const connection_id = `cn_${randomToken(12)}`;
  const made = await repo.issue({
    userId: c.var.tenant.user.id,
    kind: "key",
    connectionId: connection_id,
    name,
    scopes,
    expiresAt: days === null ? null : Date.now() + (days as number) * 86_400_000,
  }, MAX_CONNECTIONS);
  // The cap is re-checked inside the INSERT: a racing creation that filled the last slot wins.
  if (!made) throw full();
  const { secret } = made;
  const url = serverUrl(c);
  return c.json({ secret, connection_id, server_url: url, command: `claude mcp add --transport http salonkit ${url} --header "Authorization: Bearer ${secret}"` }, 201);
});

mcp.put("/mcp/connections/:id", ...gate, notSupport, async (c) => {
  const b = await readJson(c);
  const scopes = b.scope === undefined ? undefined : scopesOf(b.scope);
  if (scopes === null) throw bad("Choose Read only or Read and write");
  const name = b.name === undefined ? undefined : typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 60) : null;
  if (name === null) throw bad("Give the connection a name");
  if (!(await repoOf(c).updateConnection(c.req.param("id"), { scopes, name }))) throw new HttpError(404, "Not found");
  return c.json({ ok: true });
});

mcp.delete("/mcp/connections/:id", ...gate, async (c) => {
  if (!(await repoOf(c).revokeConnection(c.req.param("id")))) throw new HttpError(404, "Not found");
  return c.json({ ok: true });
});

// ---------- consent (OAuth) ----------

mcp.get("/mcp/requests/:id", ...gate, async (c) => {
  const req = await repoOf(c).request(c.req.param("id"));
  if (!req) throw new HttpError(404, "This connection request has expired. Start again from the AI app.");
  const client = await mcpClientById(c.env.DB, req.client_id);
  return c.json({
    id: req.id,
    app_name: client?.name ?? "AI app",
    redirect_host: new URL(req.redirect_uri).host,
    scopes: req.scopes.split(" "),
    salon: c.var.tenant.org.name,
    user: c.var.tenant.user.name,
    support: c.var.tenant.supportBy !== null,
  });
});

mcp.post("/mcp/requests/:id", ...gate, notSupport, async (c) => {
  const repo = repoOf(c);
  const req = await repo.request(c.req.param("id"));
  if (!req) throw new HttpError(404, "This connection request has expired. Start again from the AI app.");
  const b = await readJson(c);
  const back = new URL(req.redirect_uri);
  if (req.state) back.searchParams.set("state", req.state);
  if (b.approve !== true) {
    await repo.deny(req.id);
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "The salon declined the connection");
    return c.json({ redirect: back.toString() });
  }
  // Consent can only narrow what the app asked for; read is always granted.
  const asked = req.scopes.split(" ");
  const scopes: McpScope[] = b.write === true && asked.includes("write") ? ["read", "write"] : ["read"];
  if ((await repo.countConnections()) >= MAX_CONNECTIONS) throw new HttpError(409, `A salon can have ${MAX_CONNECTIONS} AI connections. Revoke one on the AI connect page first.`, "mcp_limit");
  const code = randomToken(30);
  if (!(await repo.approve(req.id, c.var.tenant.user.id, scopes, code, CODE_TTL_MS))) throw new HttpError(404, "This connection request has expired. Start again from the AI app.");
  back.searchParams.set("code", code);
  return c.json({ redirect: back.toString() });
});
