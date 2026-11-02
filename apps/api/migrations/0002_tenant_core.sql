-- Tenant core tables: every table carries org_id; every index starts with org_id
CREATE TABLE org_settings (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id),
  display_name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  brand_color TEXT,
  currency TEXT NOT NULL DEFAULT 'AED',
  currency_minor INTEGER NOT NULL DEFAULT 100,
  locale TEXT NOT NULL DEFAULT 'en-AE',
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  day_start_hour INTEGER NOT NULL DEFAULT 4,
  phone_country TEXT NOT NULL DEFAULT '971',
  bill_prefix TEXT NOT NULL,
  vat_enabled INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 5,
  trn TEXT,
  licence_no TEXT,
  contact_phone TEXT,
  address TEXT,
  instagram_url TEXT,
  google_review_url TEXT
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','barber')),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, username)
);

CREATE TABLE counters (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (org_id, name)
);

CREATE TABLE login_failures (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_login_failures ON login_failures(org_id, key, at);
