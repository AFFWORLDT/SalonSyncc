-- Sign in with an emailed code: one live 6-digit code per user (a new request replaces it). Only a hash of the code is
-- stored; it expires after 10 minutes and dies after 5 wrong tries.
CREATE TABLE login_codes (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, user_id)
);
