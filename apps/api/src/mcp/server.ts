/**
 * The MCP protocol over stateless Streamable HTTP with JSON responses (no SSE, no sessions): JSON-RPC 2.0 for
 * initialize, ping, tools/list and tools/call; notifications are accepted and ignored. Hand-rolled instead of the SDK's
 * server to stay inside the Workers free plan's CPU budget (plan ruling R1); test/mcp-protocol.test.ts drives it with
 * the SDK's own client.
 */
import type { FeatureKey } from "@ss/features";
import type { Env } from "../env";
import type { Org } from "../data/platform";
import type { McpPrincipal } from "../data/tenant/mcp";
import { COOKIE } from "../core/session";
import { sign } from "../core/crypto";
import { describe, toolByName, validate, visibleTools, type RouteCall } from "./tools";

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
const SERVER_INFO = { name: "salonkit", title: "SalonKit", version: "1.0.0" };

export type Fetcher = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

export interface RpcContext {
  env: Env;
  exec: ExecutionContext;
  org: Org;
  /** The salon host's origin, e.g. https://beard.salonkit.online. */
  origin: string;
  principal: McpPrincipal;
  features: readonly FeatureKey[];
  currency: { code: string; minor_per_unit: number };
  fetch: Fetcher;
  /** Called once per tools/call with the outcome, for the call log. */
  onCall: (tool: string, ok: boolean, error: string | null, ms: number) => void;
}

type Id = string | number;
interface RpcRequest {
  jsonrpc: "2.0";
  id?: Id | null;
  method: string;
  params?: Record<string, unknown>;
}

const rpcError = (id: Id | null, code: number, message: string) => ({ jsonrpc: "2.0" as const, id, error: { code, message } });
const rpcResult = (id: Id, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });

/** A tool failure the model can read: `{ error, message, retry_after? }` as JSON text, with isError. */
export const toolError = (error: string, message: string, extra: Record<string, unknown> = {}) => ({
  content: [{ type: "text", text: JSON.stringify({ error, message, ...extra }) }],
  isError: true,
});

/** Handles one parsed body (a message or a batch). Null when nothing needs answering (notifications only): HTTP 202. */
export async function handleRpc(body: unknown, ctx: RpcContext): Promise<unknown | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return rpcError(null, -32600, "Empty batch");
    const out = (await Promise.all(body.slice(0, 20).map((m) => handleOne(m, ctx)))).filter((r) => r !== null);
    return out.length ? out : null;
  }
  return handleOne(body, ctx);
}

async function handleOne(m: unknown, ctx: RpcContext): Promise<unknown | null> {
  if (!m || typeof m !== "object" || (m as RpcRequest).jsonrpc !== "2.0" || typeof (m as RpcRequest).method !== "string") {
    // A response or junk: JSON-RPC responses sent to a server are ignored; anything else is invalid.
    if (m && typeof m === "object" && ("result" in m || "error" in m)) return null;
    return rpcError(null, -32600, "Invalid request");
  }
  const req = m as RpcRequest;
  const isNotification = req.id === undefined || req.id === null;
  if (isNotification) return null;
  const id = req.id as Id;
  const params = req.params && typeof req.params === "object" ? req.params : {};
  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          `SalonKit data for the salon "${ctx.org.name}". Dates are the salon's business days (YYYY-MM-DD). Money in results is in minor units of ` +
          `${ctx.currency.code} (divide by ${ctx.currency.minor_per_unit}); write tools take normal amounts. Errors come back as JSON {error, message, retry_after?}.`,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: visibleTools(ctx.features, ctx.principal.scopes).map(describe) });
    case "tools/call":
      return rpcResult(id, await callTool(params, ctx));
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${req.method}`);
  }
}

async function callTool(params: Record<string, unknown>, ctx: RpcContext) {
  const started = Date.now();
  const name = typeof params.name === "string" ? params.name : "";
  const done = (r: ReturnType<typeof toolError> | { content: { type: string; text: string }[] }, error: string | null) => {
    ctx.onCall(name || "(none)", error === null, error, Date.now() - started);
    return r;
  };
  const tool = toolByName(name);
  if (!tool || !ctx.features.includes(tool.feature)) return done(toolError("not_found", `No tool named "${name}" for this salon`), "not_found");
  if (!ctx.principal.scopes.includes(tool.scope)) {
    return done(toolError("scope", "This connection can only read. Give it the write permission on the AI connect page."), "scope");
  }
  const v = validate(tool, params.arguments);
  if (!v.ok) return done(toolError("bad_input", v.message), "bad_input");

  const res = await callRoute(tool.route(v.args), ctx);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.ok) return done({ content: [{ type: "text", text: JSON.stringify({ currency: ctx.currency, data }) }] }, null);

  const message = (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : "") || "Something went wrong";
  const code = (data && typeof data === "object" ? (data as { code?: unknown }).code : undefined) as string | undefined;
  const err =
    res.status === 402 ? "read_only"
    : res.status === 404 ? "not_found"
    : res.status === 429 ? "rate_limited"
    : res.status === 403 && code === "feature_disabled" ? "not_found"
    : res.status === 401 || res.status === 403 ? "invalid"
    : res.status >= 500 ? "server_error"
    : "bad_input";
  const extra = err === "rate_limited" ? { retry_after: Number(res.headers.get("Retry-After")) || 60 } : {};
  return done(toolError(err, err === "read_only" ? "This salon's subscription has ended, so it is read-only. Reading still works." : message, extra), err);
}

/**
 * Calls the app's own route in-process as the token's user with a 2-minute signed session. `MCP_VIA` (env, never a
 * header) makes tenantAuth label the audit actor "<name> via AI connect (<connection name>)".
 */
async function callRoute(call: RouteCall, ctx: RpcContext): Promise<Response> {
  const url = new URL(call.path, ctx.origin);
  for (const [k, v] of Object.entries(call.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const p = ctx.principal;
  const session = await sign({ uid: p.user_id, orgId: ctx.org.id, v: p.session_version, exp: Date.now() + 120_000 }, ctx.env.SESSION_SECRET);
  const headers = new Headers({ cookie: `${COOKIE}=${session}`, "cf-connecting-ip": "mcp" });
  let body: string | undefined;
  if (call.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(call.body);
  }
  const env: Env = { ...ctx.env, MCP_VIA: `AI connect (${p.name})` };
  return ctx.fetch(new Request(url, { method: call.method, headers, body }), env, ctx.exec);
}
