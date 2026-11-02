-- Plan 2b engagement: WhatsApp settings + per-org credentials, org logo, push tokens, notifications, announcements,
-- ratings, WhatsApp campaigns and messages (FM final DDL + org_id; FM's 0016 wa_messages rebuild is not replayed).
-- Child-to-parent references are composite (org_id, x_id) FKs where FM had a real FK. FM's ON DELETE SET NULL columns
-- (wa_messages.customer_id/sale_id/created_by, ratings.customer_id, wa_campaigns.created_by) stay plain INTEGERs:
-- a composite SET NULL would null org_id too. FM's ON DELETE CASCADE parents (ratings.sale_id -> sales,
-- wa_messages.campaign_id -> wa_campaigns) keep a composite FK without the cascade: sales are soft-deleted and
-- campaigns are never deleted.

-- Template names default to the SalonKit set; the FM org (Plan 2c) stores its fm_* names.
ALTER TABLE org_settings ADD COLUMN wa_bill_auto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE org_settings ADD COLUMN wa_bill_template TEXT NOT NULL DEFAULT 'ss_bill';
ALTER TABLE org_settings ADD COLUMN wa_bill_pdf_template TEXT NOT NULL DEFAULT 'ss_bill_pdf';
ALTER TABLE org_settings ADD COLUMN wa_reminder_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE org_settings ADD COLUMN wa_reminder_days INTEGER NOT NULL DEFAULT 15;
ALTER TABLE org_settings ADD COLUMN wa_reminder_hour INTEGER NOT NULL DEFAULT 11; -- org-local hour
ALTER TABLE org_settings ADD COLUMN wa_reminder_template TEXT NOT NULL DEFAULT 'ss_fresh_cut';
ALTER TABLE org_settings ADD COLUMN wa_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE org_settings ADD COLUMN wa_feedback_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE org_settings ADD COLUMN wa_feedback_delay_min INTEGER NOT NULL DEFAULT 0;
ALTER TABLE org_settings ADD COLUMN wa_feedback_template TEXT NOT NULL DEFAULT 'ss_rating';
ALTER TABLE org_settings ADD COLUMN wa_feedback_reminder_min INTEGER NOT NULL DEFAULT 120;
ALTER TABLE org_settings ADD COLUMN wa_feedback_reminder_template TEXT NOT NULL DEFAULT 'ss_rating_reminder';
ALTER TABLE org_settings ADD COLUMN wa_rating_image_url TEXT; -- NULL: ${APP_ORIGIN}/wa/rating.jpg
ALTER TABLE org_settings ADD COLUMN wa_rating_reminder_image_url TEXT; -- NULL: ${APP_ORIGIN}/wa/rating-reminder.jpg
ALTER TABLE org_settings ADD COLUMN wa_fresh_cut_image_url TEXT; -- NULL: ${APP_ORIGIN}/wa/fresh-cut.jpg

-- One WhatsApp Cloud API number per org. phone_number_id is globally unique: the webhook resolves the org from it.
-- token_enc = lib/secrets encryptSecret(token, SECRETS_KEY); the plaintext token is never stored, logged or returned.
CREATE TABLE org_whatsapp (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id),
  phone_number_id TEXT NOT NULL UNIQUE,
  waba_id TEXT NOT NULL,
  token_enc TEXT NOT NULL,
  test_numbers TEXT, -- comma-separated; when set only these numbers are messaged
  updated_at INTEGER NOT NULL
);

-- Org images. v only ever increases (from counters 'logo_v'), so a cleared-then-replaced logo never reuses a URL.
CREATE TABLE org_assets (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  kind TEXT NOT NULL CHECK (kind IN ('logo')),
  bytes BLOB NOT NULL,
  type TEXT NOT NULL,
  v INTEGER NOT NULL,
  PRIMARY KEY (org_id, kind)
);

-- token stays the primary key: it is device-global and follows whoever signs in on that device.
CREATE TABLE push_tokens (
  token TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)
);
CREATE INDEX push_tokens_user ON push_tokens(org_id, user_id);

CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  sender_id INTEGER NOT NULL,
  audience TEXT NOT NULL, -- 'all' (every active user) or 'barber' (one person)
  target_id INTEGER, -- the barber, when audience = 'barber'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  recipients INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id, sender_id) REFERENCES users(org_id, id),
  FOREIGN KEY (org_id, target_id) REFERENCES users(org_id, id)
);
CREATE INDEX announcements_created ON announcements(org_id, created_at);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  path TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  FOREIGN KEY (org_id, user_id) REFERENCES users(org_id, id)
);
CREATE INDEX notifications_user ON notifications(org_id, user_id, created_at);

-- One rating per bill (the public rating page upserts on (org_id, sale_id)).
CREATE TABLE ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  sale_id INTEGER NOT NULL,
  customer_id INTEGER, -- no FK: see header
  barber_id INTEGER NOT NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (org_id, sale_id),
  FOREIGN KEY (org_id, sale_id) REFERENCES sales(org_id, id),
  FOREIGN KEY (org_id, barber_id) REFERENCES users(org_id, id)
);
CREATE INDEX ratings_barber ON ratings(org_id, barber_id, created_at);
CREATE INDEX ratings_created ON ratings(org_id, created_at);

CREATE TABLE wa_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  uid TEXT NOT NULL, -- the create batch finds its row by uid (no MAX(id))
  template TEXT NOT NULL,
  language TEXT NOT NULL,
  params TEXT NOT NULL, -- JSON WaParam[]
  total INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER, -- no FK: see header
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE (org_id, uid)
);
CREATE UNIQUE INDEX wa_campaigns_org_id ON wa_campaigns(org_id, id);
CREATE INDEX wa_campaigns_created ON wa_campaigns(org_id, created_at);

-- sent_at doubles as the campaign-drain claim marker (FM wa-jobs).
CREATE TABLE wa_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  kind TEXT NOT NULL CHECK (kind IN ('bill','reminder','announcement','test','feedback')),
  customer_id INTEGER, -- no FK: see header
  phone TEXT NOT NULL,
  template TEXT NOT NULL,
  params TEXT, -- JSON
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','skipped')),
  wa_id TEXT,
  error TEXT,
  sale_id INTEGER, -- no FK: see header
  campaign_id INTEGER,
  created_by INTEGER, -- no FK: see header
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  delivered_at INTEGER,
  read_at INTEGER,
  FOREIGN KEY (org_id, campaign_id) REFERENCES wa_campaigns(org_id, id)
);
CREATE INDEX wa_messages_campaign ON wa_messages(org_id, campaign_id, status);
CREATE INDEX wa_messages_sale ON wa_messages(org_id, sale_id);
CREATE INDEX wa_messages_created ON wa_messages(org_id, created_at);
CREATE INDEX wa_messages_wa_id ON wa_messages(org_id, wa_id);
