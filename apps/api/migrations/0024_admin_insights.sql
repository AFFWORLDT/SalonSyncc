-- Atlantic Portal insights (App usage, People, Notifications).
-- One row per person per platform per day they used SalonKit; written by tenantAuth at most every 10 minutes per
-- person per isolate (src/core/activity.ts), so a busy salon costs a handful of writes a day. Kept 180 days.
CREATE TABLE activity_daily (
  day TEXT NOT NULL,                 -- UTC yyyy-mm-dd
  org_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  platform TEXT NOT NULL,            -- web | ios | android
  app_version TEXT,                  -- phone app only
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,   -- recorded touches (not every request)
  PRIMARY KEY (day, user_id, platform)
);
CREATE INDEX activity_daily_org ON activity_daily(org_id, day);
CREATE INDEX activity_daily_user ON activity_daily(user_id, last_at);

-- Push broadcasts from the portal: sent in slices (free plan: ~35 pushes per request), so the row keeps the cursor.
CREATE TABLE push_broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target TEXT NOT NULL,              -- all | org | user
  org_id TEXT,
  user_id INTEGER,
  target_label TEXT NOT NULL,
  recipients INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  cursor TEXT,                       -- last push_tokens.token handled; NULL until started
  done INTEGER NOT NULL DEFAULT 0,
  sent_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Cross-salon date ranges for the portal (the existing indexes all lead with org_id).
CREATE INDEX sales_created_all ON sales(created_at) WHERE deleted_at IS NULL;
CREATE INDEX wa_messages_created_all ON wa_messages(created_at);
CREATE INDEX orgs_created ON orgs(created_at);
