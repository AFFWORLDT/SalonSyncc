-- AI connect (MCP): OAuth clients (global, registered before any salon is known), approvals in progress, credentials
-- (API keys and OAuth access/refresh tokens, SHA-256 at rest) and a 30-day call log. Spec 2026-11-03-mcp-connect-design.

CREATE TABLE mcp_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE mcp_auth_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  state TEXT,
  code_challenge TEXT NOT NULL,
  scopes TEXT NOT NULL,
  user_id INTEGER,
  code_hash TEXT UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX mcp_auth_requests_exp ON mcp_auth_requests(expires_at);

CREATE TABLE mcp_tokens (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id INTEGER NOT NULL,
  -- The user's session_version at issue: a password change or sign-out-everywhere ends their AI credentials too.
  user_sv INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('key', 'access', 'refresh')),
  connection_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last4 TEXT NOT NULL,
  scopes TEXT NOT NULL,
  client_id TEXT,
  expires_at INTEGER,
  revoked_at INTEGER,
  replaced_by TEXT,
  last_used_at INTEGER,
  last_ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX mcp_tokens_conn ON mcp_tokens(org_id, connection_id);
CREATE INDEX mcp_tokens_exp ON mcp_tokens(expires_at);
CREATE INDEX mcp_tokens_revoked ON mcp_tokens(revoked_at);

CREATE TABLE mcp_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  connection_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  ms INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX mcp_calls_org_at ON mcp_calls(org_id, at);
CREATE INDEX mcp_calls_at ON mcp_calls(at);
