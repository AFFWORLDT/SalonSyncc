-- Plan 2a expenses: per-barber daily expenses and shop (company) expenses (FM final DDL + org_id).
-- created_by is a plain INTEGER (FM's ON DELETE SET NULL cannot be a composite FK); the app sets it from the session user.

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  barber_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0), -- minor units
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (org_id, barber_id, day),
  FOREIGN KEY (org_id, barber_id) REFERENCES users(org_id, id)
);
CREATE INDEX expenses_day ON expenses(org_id, day);

CREATE TABLE company_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  uid TEXT NOT NULL, -- per-row token so a batch can find the row it just inserted (no MAX(id))
  day TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0), -- minor units
  note TEXT NOT NULL,
  paid_from TEXT NOT NULL DEFAULT 'cash' CHECK (paid_from IN ('cash','bank')),
  created_by INTEGER, -- no FK: see header
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (org_id, uid)
);
CREATE INDEX company_expenses_day ON company_expenses(org_id, day);
