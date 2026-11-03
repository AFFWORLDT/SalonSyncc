/**
 * AI connect (MCP) credentials, approvals in progress and the call log, all scoped to one org. Secrets are never stored:
 * only their SHA-256 (lib/hash) and last 4 characters. OAuth clients (mcp_clients) are global and live in data/mcp-clients.ts.
 */
import { sha256 } from "../../lib/hash";
import { randomToken } from "../../core/crypto";

export type McpKind = "key" | "access" | "refresh";
export type McpScope = "read" | "write";

export const TOKEN_PREFIX = "skt_";
/** `skt_` + 40 url-safe characters (30 random bytes). */
export const newSecret = (): string => TOKEN_PREFIX + randomToken(30);
export const TOKEN_RE = /^skt_[A-Za-z0-9_-]{40}$/;

/** Live credentials of one connection count once: a key, or one OAuth grant (its access + refresh share connection_id). */
export const MAX_CONNECTIONS = 5;

export interface McpPrincipal {
  token_id: string;
  kind: McpKind;
  connection_id: string;
  name: string;
  scopes: McpScope[];
  user_id: number;
  role: "owner" | "admin" | "barber";
  active: 0 | 1;
  session_version: number;
  user_name: string;
  last_used_at: number | null;
  client_id: string | null;
  /** The org's mcp_api override, read straight from D1 (not the 60 s features cache): 1, 0 or null (none). */
  feature_on: 0 | 1 | null;
}

export interface McpConnection {
  connection_id: string;
  kind: "key" | "oauth";
  name: string;
  scopes: McpScope[];
  last4: string;
  user_id: number;
  user_name: string;
  client_id: string | null;
  created_at: number;
  expires_at: number | null;
  last_used_at: number | null;
}

export interface McpCall {
  id: number;
  connection_id: string;
  name: string | null;
  tool: string;
  ok: 0 | 1;
  error: string | null;
  ms: number;
  at: number;
}

export interface McpAuthRequest {
  id: string;
  client_id: string;
  redirect_uri: string;
  state: string | null;
  code_challenge: string;
  scopes: string;
  user_id: number | null;
  expires_at: number;
}

export const parseScopes = (s: string): McpScope[] => {
  const set = new Set(s.split(/[\s,]+/));
  return set.has("write") ? ["read", "write"] : ["read"];
};

export function mcpRepo(db: D1Database, orgId: string) {
  return {
    /** Stores a new credential and returns its one-time secret. */
    async issue(t: { userId: number; kind: McpKind; connectionId: string; name: string; scopes: McpScope[]; clientId?: string | null; expiresAt: number | null }): Promise<{ id: string; secret: string }> {
      const secret = newSecret();
      const id = `mt_${randomToken(12)}`;
      await this.issueStmt(id, secret, t).then((s) => s.run());
      return { id, secret };
    },

    async issueStmt(id: string, secret: string, t: { userId: number; kind: McpKind; connectionId: string; name: string; scopes: McpScope[]; clientId?: string | null; expiresAt: number | null }): Promise<D1PreparedStatement> {
      return db
        .prepare(
          `INSERT INTO mcp_tokens (id, org_id, user_id, kind, connection_id, name, token_hash, last4, scopes, client_id, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, orgId, t.userId, t.kind, t.connectionId, t.name, await sha256(secret), secret.slice(-4), t.scopes.join(" "), t.clientId ?? null, t.expiresAt, Date.now());
    },

    /** One statement: the live credential with its user and the org's mcp_api override. Kind filter: `access`/`key` for /mcp, `refresh` for the token endpoint. */
    async principal(secret: string, kinds: McpKind[], now = Date.now()): Promise<McpPrincipal | null> {
      const r = await db
        .prepare(
          `SELECT t.id AS token_id, t.kind, t.connection_id, t.name, t.scopes, t.user_id, t.last_used_at, t.client_id,
                  u.role, u.active, u.session_version, u.name AS user_name,
                  (SELECT enabled FROM org_feature_overrides WHERE org_id = t.org_id AND feature_key = 'mcp_api') AS feature_on
             FROM mcp_tokens t JOIN users u ON u.id = t.user_id AND u.org_id = t.org_id
            WHERE t.org_id = ? AND t.token_hash = ? AND t.revoked_at IS NULL AND COALESCE(t.expires_at, 9e15) > ?`,
        )
        .bind(orgId, await sha256(secret), now)
        .first<Omit<McpPrincipal, "scopes"> & { scopes: string }>();
      if (!r || !kinds.includes(r.kind)) return null;
      return { ...r, scopes: parseScopes(r.scopes) };
    },

    /** last_used_at / last_ip, at most once a minute per credential. */
    touch(tokenId: string, ip: string, now = Date.now()): D1PreparedStatement {
      return db
        .prepare("UPDATE mcp_tokens SET last_used_at = ?, last_ip = ? WHERE org_id = ? AND id = ? AND COALESCE(last_used_at, 0) < ?")
        .bind(now, ip.slice(0, 64), orgId, tokenId, now - 60_000);
    },

    logCall(c: { connectionId: string; tool: string; ok: boolean; error: string | null; ms: number }): D1PreparedStatement {
      return db
        .prepare("INSERT INTO mcp_calls (org_id, connection_id, tool, ok, error, ms, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(orgId, c.connectionId, c.tool.slice(0, 64), c.ok ? 1 : 0, c.error, Math.round(c.ms), Date.now());
    },

    /** Live connections, newest first: one row per key or per OAuth grant (its live refresh token, else its access token). */
    async connections(now = Date.now()): Promise<McpConnection[]> {
      const r = await db
        .prepare(
          `SELECT t.connection_id, CASE WHEN t.kind = 'key' THEN 'key' ELSE 'oauth' END AS kind, t.name, t.scopes, t.last4, t.user_id,
                  u.name AS user_name, t.client_id, MIN(t.created_at) AS created_at, MAX(t.expires_at) AS expires_at, MAX(t.last_used_at) AS last_used_at
             FROM mcp_tokens t JOIN users u ON u.id = t.user_id AND u.org_id = t.org_id
            WHERE t.org_id = ? AND t.revoked_at IS NULL AND COALESCE(t.expires_at, 9e15) > ?
            GROUP BY t.connection_id
            ORDER BY created_at DESC`,
        )
        .bind(orgId, now)
        .all<Omit<McpConnection, "scopes"> & { scopes: string }>();
      return r.results.map((c) => ({ ...c, scopes: parseScopes(c.scopes) }));
    },

    async countConnections(now = Date.now()): Promise<number> {
      const r = await db
        .prepare("SELECT COUNT(DISTINCT connection_id) AS n FROM mcp_tokens WHERE org_id = ? AND revoked_at IS NULL AND COALESCE(expires_at, 9e15) > ?")
        .bind(orgId, now)
        .first<{ n: number }>();
      return r?.n ?? 0;
    },

    /** Revokes every live credential of one connection; false when there was none. */
    async revokeConnection(connectionId: string, now = Date.now()): Promise<boolean> {
      const r = await db.prepare("UPDATE mcp_tokens SET revoked_at = ? WHERE org_id = ? AND connection_id = ? AND revoked_at IS NULL").bind(now, orgId, connectionId).run();
      return (r.meta.changes ?? 0) > 0;
    },

    async revokeAll(now = Date.now()): Promise<number> {
      const r = await db.prepare("UPDATE mcp_tokens SET revoked_at = ? WHERE org_id = ? AND revoked_at IS NULL").bind(now, orgId).run();
      return r.meta.changes ?? 0;
    },

    /** New scopes (and name) for every live credential of a connection. */
    async updateConnection(connectionId: string, patch: { scopes?: McpScope[]; name?: string }): Promise<boolean> {
      const r = await db
        .prepare("UPDATE mcp_tokens SET scopes = COALESCE(?, scopes), name = COALESCE(?, name) WHERE org_id = ? AND connection_id = ? AND revoked_at IS NULL")
        .bind(patch.scopes ? patch.scopes.join(" ") : null, patch.name ?? null, orgId, connectionId)
        .run();
      return (r.meta.changes ?? 0) > 0;
    },

    /**
     * Refresh rotation: revokes the presented refresh token only if it is still live, so of two racing refreshes exactly
     * one wins (the loser sees false and the caller treats it as reuse).
     */
    async consumeRefresh(tokenId: string, now = Date.now()): Promise<boolean> {
      const r = await db.prepare("UPDATE mcp_tokens SET revoked_at = ? WHERE org_id = ? AND id = ? AND revoked_at IS NULL").bind(now, orgId, tokenId).run();
      return (r.meta.changes ?? 0) > 0;
    },

    /** A refresh token that was already used (rotated away): the connection it belonged to, for reuse revocation. */
    async rotatedRefresh(secret: string): Promise<string | null> {
      const r = await db
        .prepare("SELECT connection_id FROM mcp_tokens WHERE org_id = ? AND token_hash = ? AND kind = 'refresh' AND revoked_at IS NOT NULL")
        .bind(orgId, await sha256(secret))
        .first<{ connection_id: string }>();
      return r?.connection_id ?? null;
    },

    async calls(limit = 50): Promise<McpCall[]> {
      const r = await db
        .prepare(
          `SELECT c.id, c.connection_id, (SELECT name FROM mcp_tokens WHERE org_id = c.org_id AND connection_id = c.connection_id LIMIT 1) AS name,
                  c.tool, c.ok, c.error, c.ms, c.at
             FROM mcp_calls c WHERE c.org_id = ? ORDER BY c.at DESC LIMIT ?`,
        )
        .bind(orgId, Math.min(200, Math.max(1, limit)))
        .all<McpCall>();
      return r.results;
    },

    // ---------- OAuth approvals in progress ----------
    async createRequest(r: Omit<McpAuthRequest, "id" | "user_id" | "expires_at">, ttlMs: number): Promise<string> {
      const id = `ar_${randomToken(18)}`;
      const now = Date.now();
      await db
        .prepare(
          `INSERT INTO mcp_auth_requests (id, org_id, client_id, redirect_uri, state, code_challenge, scopes, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, orgId, r.client_id, r.redirect_uri, r.state, r.code_challenge, r.scopes, now + ttlMs, now)
        .run();
      return id;
    },

    async request(id: string, now = Date.now()): Promise<McpAuthRequest | null> {
      return db
        .prepare(
          `SELECT id, client_id, redirect_uri, state, code_challenge, scopes, user_id, expires_at
             FROM mcp_auth_requests WHERE org_id = ? AND id = ? AND code_hash IS NULL AND expires_at > ?`,
        )
        .bind(orgId, id, now)
        .first<McpAuthRequest>();
    },

    /** Consent: binds the approver, the granted scopes and a one-time code (valid `ttlMs`). False when already used or expired. */
    async approve(id: string, userId: number, scopes: McpScope[], code: string, ttlMs: number, now = Date.now()): Promise<boolean> {
      const r = await db
        .prepare(
          `UPDATE mcp_auth_requests SET user_id = ?, scopes = ?, code_hash = ?, expires_at = ?
            WHERE org_id = ? AND id = ? AND code_hash IS NULL AND expires_at > ?`,
        )
        .bind(userId, scopes.join(" "), await sha256(code), now + ttlMs, orgId, id, now)
        .run();
      return (r.meta.changes ?? 0) > 0;
    },

    /** Single use: returns the approved request for `code` and deletes it. */
    async redeem(code: string, now = Date.now()): Promise<McpAuthRequest | null> {
      const r = await db
        .prepare(
          `DELETE FROM mcp_auth_requests WHERE org_id = ? AND code_hash = ? AND expires_at > ?
           RETURNING id, client_id, redirect_uri, state, code_challenge, scopes, user_id, expires_at`,
        )
        .bind(orgId, await sha256(code), now)
        .first<McpAuthRequest>();
      return r ?? null;
    },

    async deny(id: string): Promise<void> {
      await db.prepare("DELETE FROM mcp_auth_requests WHERE org_id = ? AND id = ?").bind(orgId, id).run();
    },

    /** Super admin's salon view: live connection count and the last call. */
    async summary(now = Date.now()): Promise<{ connections: number; last_call_at: number | null; calls_30d: number }> {
      const [c, l] = await db.batch<{ n: number; last: number | null }>([
        db.prepare("SELECT COUNT(DISTINCT connection_id) AS n, NULL AS last FROM mcp_tokens WHERE org_id = ? AND revoked_at IS NULL AND COALESCE(expires_at, 9e15) > ?").bind(orgId, now),
        db.prepare("SELECT COUNT(*) AS n, MAX(at) AS last FROM mcp_calls WHERE org_id = ?").bind(orgId),
      ]);
      return { connections: c.results[0]?.n ?? 0, last_call_at: l.results[0]?.last ?? null, calls_30d: l.results[0]?.n ?? 0 };
    },
  };
}
