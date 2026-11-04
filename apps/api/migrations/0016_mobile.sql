-- The phone app: one bearer-token session per (user, device), stored as the token's SHA-256 only.
CREATE TABLE mobile_sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android')),
  app_version TEXT,
  session_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (org_id, user_id, device_id),
  FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)
);
CREATE INDEX mobile_sessions_user ON mobile_sessions(org_id, user_id);

-- Per-role switches set by the super admin: enabled = 0 hides a salon feature from that role (web and app).
-- Role 'admin' covers owner and admin.
CREATE TABLE org_role_features (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  role TEXT NOT NULL CHECK (role IN ('barber','admin')),
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, role, feature_key)
);

-- The phone app's minimum and latest versions, per platform.
CREATE TABLE app_config (
  platform TEXT PRIMARY KEY CHECK (platform IN ('ios','android')),
  min_version TEXT NOT NULL,
  latest_version TEXT NOT NULL,
  store_url TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO app_config(platform,min_version,latest_version,store_url,updated_at) VALUES
  ('ios','1.0.0','1.0.0','https://apps.apple.com/app/salonkit',0),
  ('android','1.0.0','1.0.0','https://play.google.com/store/apps/details?id=online.salonkit.app',0);
