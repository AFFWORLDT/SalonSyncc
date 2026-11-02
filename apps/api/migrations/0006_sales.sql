-- Plan 2a sales: customers, sales, sale_items, ledger_entries (FM final DDL + org_id; FM's rebuilds are not replayed).
-- audit_log already exists (0004). Child-to-parent references are composite (org_id, x_id) FKs; FM's ON DELETE SET NULL
-- actor columns (ledger_entries.actor_id) stay plain INTEGERs (a composite SET NULL would null org_id too).

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT,
  phone TEXT, -- canonical for the org's phone_country
  visits INTEGER NOT NULL DEFAULT 0,
  spent INTEGER NOT NULL DEFAULT 0, -- minor units
  last_visit_at INTEGER,
  created_at INTEGER NOT NULL,
  wa_opt_out INTEGER NOT NULL DEFAULT 0,
  wa_reminded_at INTEGER,
  UNIQUE (org_id, phone)
);
CREATE UNIQUE INDEX customers_org_id ON customers(org_id, id);
CREATE INDEX customers_last_visit ON customers(org_id, last_visit_at);

CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  bill_no TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE, -- public receipt link: globally unique, the org comes from this row
  day TEXT NOT NULL,
  barber_id INTEGER NOT NULL,
  customer_id INTEGER,
  customer_label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash','card')),
  note TEXT,
  commission_pct REAL NOT NULL, -- percent
  commission INTEGER NOT NULL,
  vat_rate REAL NOT NULL, -- percent; 0 when VAT was off
  vat_amount INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  wa_feedback_at INTEGER,
  wa_feedback_reminded_at INTEGER,
  review_clicked_at INTEGER,
  UNIQUE (org_id, bill_no),
  FOREIGN KEY (org_id, barber_id) REFERENCES users(org_id, id),
  FOREIGN KEY (org_id, created_by) REFERENCES users(org_id, id),
  FOREIGN KEY (org_id, customer_id) REFERENCES customers(org_id, id)
);
CREATE UNIQUE INDEX sales_org_id ON sales(org_id, id);
CREATE INDEX sales_day ON sales(org_id, day, barber_id) WHERE deleted_at IS NULL;
CREATE INDEX sales_barber_day ON sales(org_id, barber_id, day);
CREATE INDEX sales_customer ON sales(org_id, customer_id);
CREATE INDEX sales_created ON sales(org_id, created_at);
CREATE INDEX sales_created_by ON sales(org_id, created_by);
CREATE INDEX sales_review_clicked ON sales(org_id, review_clicked_at);

CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  sale_id INTEGER NOT NULL,
  service_id INTEGER, -- NULL: a one-off item, or the service was deleted
  name TEXT NOT NULL, -- snapshot
  price INTEGER NOT NULL, -- minor units per unit, snapshot
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  FOREIGN KEY (org_id, sale_id) REFERENCES sales(org_id, id),
  FOREIGN KEY (org_id, service_id) REFERENCES services(org_id, id)
);
CREATE INDEX sale_items_sale ON sale_items(org_id, sale_id);
CREATE INDEX sale_items_service ON sale_items(org_id, service_id);

-- Never rewritten: an edit or delete adds reversal rows (reverses_id) and marks the original reversed.
CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  at INTEGER NOT NULL,
  day TEXT NOT NULL,
  book TEXT NOT NULL CHECK (book IN ('shop','barber')),
  account TEXT CHECK (account IN ('cash','bank')),
  barber_id INTEGER,
  amount INTEGER NOT NULL, -- signed minor units
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id INTEGER NOT NULL, -- opening: 0 = shop, else the barber id
  ref TEXT,
  memo TEXT NOT NULL,
  reverses_id INTEGER,
  reversed INTEGER NOT NULL DEFAULT 0,
  actor_id INTEGER, -- no FK: FM's ON DELETE SET NULL cannot be composite
  FOREIGN KEY (org_id, barber_id) REFERENCES users(org_id, id),
  FOREIGN KEY (org_id, reverses_id) REFERENCES ledger_entries(org_id, id)
);
CREATE UNIQUE INDEX ledger_org_id ON ledger_entries(org_id, id);
CREATE INDEX ledger_book_day ON ledger_entries(org_id, book, day);
CREATE INDEX ledger_source ON ledger_entries(org_id, source, source_id);
CREATE INDEX ledger_barber_day ON ledger_entries(org_id, barber_id, day);
