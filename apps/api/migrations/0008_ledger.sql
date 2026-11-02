-- Plan 2a ledger: barber payouts and money moves between the cash drawer and the bank (FM 0012 DDL + org_id).
-- ledger_entries already exists (0006). Each row has a per-row uid so the create batch finds it without MAX(id).
-- created_by is a plain INTEGER (FM's ON DELETE SET NULL cannot be a composite FK); the app sets it from the session user.

CREATE TABLE barber_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  uid TEXT NOT NULL,
  barber_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0), -- minor units
  paid_from TEXT NOT NULL CHECK (paid_from IN ('cash','bank')),
  note TEXT,
  created_by INTEGER, -- no FK: see header
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (org_id, uid),
  FOREIGN KEY (org_id, barber_id) REFERENCES users(org_id, id)
);
CREATE INDEX payouts_day ON barber_payouts(org_id, day);
CREATE INDEX payouts_barber ON barber_payouts(org_id, barber_id);

CREATE TABLE money_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  uid TEXT NOT NULL,
  day TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0), -- minor units
  from_account TEXT NOT NULL CHECK (from_account IN ('cash','bank')),
  to_account TEXT NOT NULL CHECK (to_account IN ('cash','bank')),
  note TEXT,
  created_by INTEGER, -- no FK: see header
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (from_account <> to_account),
  UNIQUE (org_id, uid)
);
CREATE INDEX transfers_day ON money_transfers(org_id, day);
