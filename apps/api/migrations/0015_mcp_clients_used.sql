-- AI connect: when a registered OAuth client was last used (authorize, code exchange, refresh), so the cron can drop
-- registrations nobody uses (dynamic registration is open, rate-limited per IP) without touching live connections.
ALTER TABLE mcp_clients ADD COLUMN last_used_at INTEGER;
UPDATE mcp_clients SET last_used_at = created_at;
CREATE INDEX mcp_clients_used ON mcp_clients(last_used_at);
