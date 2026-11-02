-- Platform tables (no tenant org_id scoping)
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_monthly INTEGER NOT NULL,
  currency TEXT NOT NULL,
  stripe_price_id TEXT,
  limits_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL
);

CREATE TABLE plan_features (
  plan_id TEXT NOT NULL REFERENCES plans(id),
  feature_key TEXT NOT NULL,
  PRIMARY KEY (plan_id, feature_key)
);

CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('trial','active','grace','past_due','expired','deactivated','deleted')),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  trial_ends_at INTEGER,
  grace_ends_at INTEGER,
  owner_user_id INTEGER,
  country TEXT NOT NULL DEFAULT 'AE',
  created_at INTEGER NOT NULL,
  deactivated_at INTEGER,
  deleted_at INTEGER
);
CREATE INDEX idx_orgs_status ON orgs(status);

CREATE TABLE reserved_slugs (slug TEXT PRIMARY KEY);
INSERT INTO reserved_slugs(slug) VALUES
  ('admin'),('www'),('api'),('app'),('platform'),('mail'),('support'),
  ('help'),('billing'),('status'),('static'),('assets'),('login'),('signup');

CREATE TABLE org_feature_overrides (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  reason TEXT,
  set_by INTEGER,
  set_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, feature_key)
);

CREATE TABLE subscriptions (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id),
  provider TEXT NOT NULL DEFAULT 'none' CHECK (provider IN ('none','stripe','manual')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT,
  current_period_end INTEGER,
  cancel_at INTEGER
);

CREATE TABLE platform_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','support')),
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE platform_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  who TEXT NOT NULL,
  action TEXT NOT NULL,
  org_id TEXT,
  before_json TEXT,
  after_json TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX idx_platform_audit_org ON platform_audit(org_id, at);

CREATE TABLE email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  kind TEXT NOT NULL,
  "to" TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at INTEGER,
  UNIQUE (org_id, kind)
);

CREATE TABLE support_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  platform_user_id INTEGER NOT NULL REFERENCES platform_users(id),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER
);

CREATE TABLE stripe_events (
  event_id TEXT PRIMARY KEY,
  received_at INTEGER
);
