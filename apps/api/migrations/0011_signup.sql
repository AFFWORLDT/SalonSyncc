-- Plan 4: self-serve signup. The owner's contact on the org (for platform emails, Plan 6), and single-use handoff tokens
-- that sign a new owner in on their own subdomain right after signup (sha-256 of the token is stored, never the token).
ALTER TABLE orgs ADD COLUMN owner_email TEXT;
ALTER TABLE orgs ADD COLUMN owner_phone TEXT;
CREATE UNIQUE INDEX idx_orgs_owner_email ON orgs(lower(owner_email)) WHERE owner_email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE login_handoffs (
  token_hash TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
