-- Online bookings (feature online_bookings, switched on per salon by the super admin).
-- One settings row per salon: opening hours, slot step, notice, how far ahead, which staff take bookings,
-- per-service durations, alert email and the website origins allowed to call the public booking API.
CREATE TABLE booking_settings (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id),
  hours TEXT NOT NULL,                 -- JSON: 7 entries, Sunday first: [open_min, close_min] or null (closed)
  slot_min INTEGER NOT NULL DEFAULT 30,
  lead_min INTEGER NOT NULL DEFAULT 60,
  days_ahead INTEGER NOT NULL DEFAULT 30,
  default_duration INTEGER NOT NULL DEFAULT 60,
  durations TEXT NOT NULL DEFAULT '{}', -- JSON: { "<service id>": minutes }
  staff TEXT,                          -- JSON array of user ids; NULL = every active barber
  notify_email TEXT,                   -- NULL = the owner's email
  site_origins TEXT,                   -- comma-separated, e.g. https://styleeleganzladiessalon.com
  wa_template TEXT,                    -- approved WhatsApp template for the client's confirmation; NULL = none
  updated_at INTEGER NOT NULL
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  ref TEXT NOT NULL,                   -- shown to the client, e.g. B7K2QX
  token TEXT NOT NULL,                 -- the client's view/cancel link
  staff_id INTEGER NOT NULL,
  day TEXT NOT NULL,                   -- salon-local yyyy-mm-dd
  start_min INTEGER NOT NULL,          -- minutes after local midnight
  end_min INTEGER NOT NULL,
  services TEXT NOT NULL,              -- JSON: [{ id, name, price, minutes }]
  total INTEGER NOT NULL,              -- minor units
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','completed','no_show','cancelled')),
  source TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website','manual')),
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (org_id, ref)
);
CREATE INDEX bookings_day ON bookings(org_id, day, staff_id);
CREATE UNIQUE INDEX bookings_token ON bookings(token);
