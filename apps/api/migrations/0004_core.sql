-- Plan 2a core: FM settings/users columns, services catalogue, audit log, global rate_hits.
ALTER TABLE org_settings ADD COLUMN salon_name_ar TEXT;
ALTER TABLE org_settings ADD COLUMN tagline TEXT;
ALTER TABLE org_settings ADD COLUMN default_commission_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE org_settings ADD COLUMN quick_amounts TEXT NOT NULL DEFAULT '15,20,25,30,35,50';
ALTER TABLE org_settings ADD COLUMN thank_you_text TEXT NOT NULL DEFAULT 'Thank you {name} for visiting {salon}! Your bill: {amount}. {link}';
ALTER TABLE org_settings ADD COLUMN receipt_footer TEXT;
ALTER TABLE org_settings ADD COLUMN notify_sales INTEGER NOT NULL DEFAULT 1;
ALTER TABLE org_settings ADD COLUMN notify_sale_min INTEGER NOT NULL DEFAULT 0;
ALTER TABLE org_settings ADD COLUMN notify_summary INTEGER NOT NULL DEFAULT 1;
ALTER TABLE org_settings ADD COLUMN summary_hour INTEGER NOT NULL DEFAULT 23;
ALTER TABLE org_settings ADD COLUMN notify_reminder INTEGER NOT NULL DEFAULT 1;
ALTER TABLE org_settings ADD COLUMN reminder_hour INTEGER NOT NULL DEFAULT 13;
ALTER TABLE org_settings ADD COLUMN notify_barber_changes INTEGER NOT NULL DEFAULT 1;
ALTER TABLE org_settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN commission_pct REAL;
ALTER TABLE users ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN avatar BLOB;
ALTER TABLE users ADD COLUMN avatar_type TEXT;
ALTER TABLE users ADD COLUMN avatar_v INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN can_add_expense INTEGER NOT NULL DEFAULT 0;
-- Target for composite (org_id, user_id) foreign keys from later tables.
CREATE UNIQUE INDEX users_org_id ON users(org_id, id);

CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  uid TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (org_id, uid)
);
CREATE UNIQUE INDEX services_org_id ON services(org_id, id);
CREATE INDEX services_order ON services(org_id, sort_order, id);

-- Append-only. actor_id is a plain INTEGER (no FK: ON DELETE SET NULL cannot be composite); actor_name is the snapshot.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  at INTEGER NOT NULL,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  ref TEXT,
  action TEXT NOT NULL,
  before TEXT,
  after TEXT
);
CREATE INDEX audit_entity ON audit_log(org_id, entity, entity_id);
CREATE INDEX audit_at ON audit_log(org_id, at);

-- Global infra table (public-link rate limiter): deliberately no org_id, not a tenant table.
CREATE TABLE rate_hits (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  n INTEGER NOT NULL
);
