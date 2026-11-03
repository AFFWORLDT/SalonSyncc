/**
 * FM Salon import (spec P1b, D16): turns rows read from an `fm-salon-db` export into SalonKit SQL for one org.
 * Pure (no I/O): the CLI (scripts/fm-import.ts) reads the export and writes the files; the tests run the SQL on D1.
 *
 * Every FM row id is shifted by ID_OFFSET, so FM rows never collide with other salons' rows and every reference
 * (foreign keys, ledger_entries.source_id, audit_log.entity_id) maps with the same rule. Statements stay under
 * MAX_STMT bytes (D1 refuses statements over 100 KB); photos are written in chunks.
 * Not carried over: push_tokens (the Firebase project changes, staff re-enable notifications once),
 * login_failures and rate_hits (short-lived throttling rows).
 */

export const ID_OFFSET = 1_000_000;
export const MAX_STMT = 90_000;
const BLOB_CHUNK = 40_000; // bytes; 80 000 hex characters per statement
const ROWS_PER_INSERT = 100;

export type Value = string | number | bigint | null | Uint8Array;
export type Row = Record<string, Value>;
/** FM tables by name, rows in id order (as `SELECT * FROM t ORDER BY id` returns them). */
export type FmSource = Record<string, Row[]>;

export interface ImportOpts {
  orgId: string;
  slug: string;
  now: number;
  ownerEmail?: string | null;
  logo?: { bytes: Uint8Array; type: string } | null;
}

/** FM tables copied with a column map (SalonKit column -> value from the FM row), in foreign-key order. */
const shift = (v: Value) => (v === null || v === undefined ? null : Number(v) + ID_OFFSET);
const uid = (r: Row) => `fm-${r.id}`;
/** FM stores VAT as a fraction (0.05), SalonKit as a percent (5); rounded so 0.05 * 100 is 5, not 5.000000000000001. */
export const percent = (v: Value) => Math.round(Number(v ?? 0) * 10000) / 100;
/** audit_log entity ids that are not row ids (settings/whatsapp rows are 1 or null). */
const NON_ROW_ENTITIES = new Set(["settings", "whatsapp"]);

type ColMap = Record<string, (r: Row) => Value>;
const copy = (...cols: string[]): ColMap => Object.fromEntries(cols.map((c) => [c, (r: Row) => r[c] ?? null]));

const TABLES: { table: string; cols: ColMap }[] = [
  {
    table: "customers",
    cols: { id: (r) => shift(r.id), ...copy("name", "phone", "visits", "spent", "last_visit_at", "created_at", "wa_opt_out", "wa_reminded_at") },
  },
  {
    table: "services",
    cols: { id: (r) => shift(r.id), uid, ...copy("category", "name", "description", "price", "sort_order", "active", "created_at", "updated_at") },
  },
  {
    table: "sales",
    cols: {
      id: (r) => shift(r.id),
      ...copy("bill_no", "token", "day"),
      barber_id: (r) => shift(r.barber_id),
      customer_id: (r) => shift(r.customer_id),
      ...copy("customer_label", "amount", "payment_mode", "note", "commission_pct", "commission"),
      vat_rate: (r) => percent(r.vat_rate),
      vat_amount: (r) => r.vat_amount,
      created_by: (r) => shift(r.created_by),
      ...copy("created_at", "updated_at", "deleted_at", "wa_feedback_at", "wa_feedback_reminded_at", "review_clicked_at"),
    },
  },
  {
    table: "sale_items",
    cols: { id: (r) => shift(r.id), sale_id: (r) => shift(r.sale_id), service_id: (r) => shift(r.service_id), ...copy("name", "price", "qty") },
  },
  {
    table: "expenses",
    cols: { id: (r) => shift(r.id), barber_id: (r) => shift(r.barber_id), ...copy("day", "amount", "note", "created_at", "updated_at") },
  },
  {
    table: "company_expenses",
    cols: { id: (r) => shift(r.id), uid, ...copy("day", "amount", "note", "paid_from"), created_by: (r) => shift(r.created_by), ...copy("created_at", "updated_at") },
  },
  {
    table: "barber_payouts",
    cols: {
      id: (r) => shift(r.id),
      uid,
      barber_id: (r) => shift(r.barber_id),
      ...copy("day", "amount", "paid_from", "note"),
      created_by: (r) => shift(r.created_by),
      ...copy("created_at", "updated_at"),
    },
  },
  {
    table: "money_transfers",
    cols: {
      id: (r) => shift(r.id),
      uid,
      ...copy("day", "amount", "from_account", "to_account", "note"),
      created_by: (r) => shift(r.created_by),
      ...copy("created_at", "updated_at"),
    },
  },
  {
    table: "ledger_entries",
    cols: {
      id: (r) => shift(r.id),
      ...copy("at", "day", "book", "account"),
      barber_id: (r) => shift(r.barber_id),
      ...copy("amount", "kind", "source"),
      // opening lines: 0 = the shop, otherwise the barber's id
      source_id: (r) => (Number(r.source_id) === 0 ? 0 : shift(r.source_id)),
      ...copy("ref", "memo"),
      reverses_id: (r) => shift(r.reverses_id),
      reversed: (r) => r.reversed,
      actor_id: (r) => shift(r.actor_id),
    },
  },
  {
    table: "audit_log",
    cols: {
      id: (r) => shift(r.id),
      at: (r) => r.at,
      actor_id: (r) => shift(r.actor_id),
      ...copy("actor_name", "entity"),
      entity_id: (r) => (r.entity_id === null || Number(r.entity_id) === 0 || NON_ROW_ENTITIES.has(String(r.entity)) ? r.entity_id : shift(r.entity_id)),
      ...copy("ref", "action", "before", "after"),
    },
  },
  {
    table: "notifications",
    cols: { id: (r) => shift(r.id), user_id: (r) => shift(r.user_id), ...copy("title", "body", "path", "created_at", "read_at") },
  },
  {
    table: "announcements",
    cols: {
      id: (r) => shift(r.id),
      sender_id: (r) => shift(r.sender_id),
      audience: (r) => r.audience,
      target_id: (r) => shift(r.target_id),
      ...copy("title", "body", "recipients", "created_at"),
    },
  },
  {
    table: "ratings",
    cols: {
      id: (r) => shift(r.id),
      sale_id: (r) => shift(r.sale_id),
      customer_id: (r) => shift(r.customer_id),
      barber_id: (r) => shift(r.barber_id),
      ...copy("stars", "comment", "created_at", "updated_at"),
    },
  },
  {
    table: "wa_campaigns",
    cols: { id: (r) => shift(r.id), uid, ...copy("template", "language", "params", "total"), created_by: (r) => shift(r.created_by), ...copy("created_at", "finished_at") },
  },
  {
    table: "wa_messages",
    cols: {
      id: (r) => shift(r.id),
      kind: (r) => r.kind,
      customer_id: (r) => shift(r.customer_id),
      ...copy("phone", "template", "params", "status", "wa_id", "error"),
      sale_id: (r) => shift(r.sale_id),
      campaign_id: (r) => shift(r.campaign_id),
      created_by: (r) => shift(r.created_by),
      ...copy("created_at", "sent_at", "delivered_at", "read_at"),
    },
  },
];

/** FM settings columns copied unchanged into org_settings. */
const SETTINGS_COPY = [
  "salon_name_ar", "tagline", "address", "licence_no", "trn", "vat_enabled", "default_commission_pct", "quick_amounts",
  "thank_you_text", "receipt_footer", "notify_sales", "notify_sale_min", "notify_summary", "summary_hour", "notify_reminder",
  "reminder_hour", "notify_barber_changes", "updated_at", "wa_bill_auto", "wa_bill_template", "wa_reminder_enabled",
  "wa_reminder_days", "wa_reminder_hour", "wa_reminder_template", "wa_language", "wa_feedback_enabled", "wa_feedback_delay_min",
  "wa_feedback_template", "wa_feedback_reminder_min", "wa_feedback_reminder_template", "google_review_url", "instagram_url",
] as const;

const USER_COPY = ["username", "name", "password_hash", "active", "session_version", "created_at", "phone", "commission_pct", "sort_order", "updated_at", "avatar_type", "avatar_v", "can_add_expense"] as const;

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** One SQL literal. Throws on values SQL cannot hold exactly (NaN, Infinity). */
export function lit(v: Value | undefined): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Uint8Array) return `X'${hex(v)}'`;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`);
    return String(v);
  }
  return `'${v.replace(/'/g, "''")}'`;
}

/** INSERTs of many rows, packed up to ROWS_PER_INSERT rows and MAX_STMT bytes each. */
function inserts(table: string, cols: string[], rows: string[][]): string[] {
  const head = `INSERT INTO ${table}(${cols.join(",")}) VALUES `;
  const out: string[] = [];
  let batch: string[] = [];
  let size = head.length;
  const flush = () => {
    if (batch.length) out.push(`${head}${batch.join(",")};`);
    batch = [];
    size = head.length;
  };
  for (const r of rows) {
    const tuple = `(${r.join(",")})`;
    if (head.length + tuple.length + 1 > MAX_STMT) throw new Error(`${table}: one row is larger than ${MAX_STMT} bytes`);
    if (batch.length >= ROWS_PER_INSERT || size + tuple.length + 1 > MAX_STMT) flush();
    batch.push(tuple);
    size += tuple.length + 1;
  }
  flush();
  return out;
}

/** Writes a blob column in chunks: the first sets it, the rest append (CAST keeps the bytes a BLOB). */
function blobUpdates(table: string, col: string, where: string, bytes: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += BLOB_CHUNK) {
    const chunk = lit(bytes.subarray(i, i + BLOB_CHUNK));
    out.push(i === 0 ? `UPDATE ${table} SET ${col} = ${chunk} WHERE ${where};` : `UPDATE ${table} SET ${col} = CAST(${col} || ${chunk} AS BLOB) WHERE ${where};`);
  }
  return out;
}

/** The lowest-id active admin becomes the salon's owner (FM has no owner role). */
export function ownerOf(users: Row[]): Row {
  const owner = users.find((u) => u.role === "admin" && Number(u.active) === 1);
  if (!owner) throw new Error("FM has no active admin to make the owner");
  return owner;
}

/** All statements for the import, in foreign-key order. */
export function buildFmImport(src: FmSource, o: ImportOpts): string[] {
  const settings = src.settings?.[0];
  if (!settings) throw new Error("FM settings row missing");
  const users = src.users ?? [];
  const owner = ownerOf(users);
  const org = lit(o.orgId);
  const displayName = String(settings.salon_name);
  const createdAt = Math.min(o.now, ...users.map((u) => Number(u.created_at)));
  const out: string[] = [];

  out.push(
    `INSERT INTO orgs(id,slug,name,status,plan_id,owner_user_id,country,created_at,owner_email) VALUES(${org},${lit(o.slug)},${lit(displayName)},'active','pro_max',${shift(owner.id)},'AE',${createdAt},${lit(o.ownerEmail ?? null)});`,
    `INSERT INTO subscriptions(org_id,provider,status,current_period_end) VALUES(${org},'manual','active',NULL);`,
  );

  const sCols = ["org_id", "display_name", "contact_phone", "vat_rate", "bill_prefix", "wa_bill_pdf_template", ...SETTINGS_COPY];
  const sVals = [org, lit(displayName), lit(settings.phone ?? null), lit(percent(settings.vat_rate)), "'FM'", "'fm_bill_pdf'", ...SETTINGS_COPY.map((c) => lit(settings[c] ?? null))];
  out.push(`INSERT INTO org_settings(${sCols.join(",")}) VALUES(${sVals.join(",")});`);

  const uCols = ["id", "org_id", "role", ...USER_COPY];
  out.push(
    ...inserts(
      "users",
      uCols,
      users.map((u) => [lit(shift(u.id)), org, lit(u.id === owner.id ? "owner" : u.role), ...USER_COPY.map((c) => lit(u[c] ?? null))]),
    ),
  );
  for (const u of users) {
    if (u.avatar instanceof Uint8Array && u.avatar.length) out.push(...blobUpdates("users", "avatar", `org_id = ${org} AND id = ${shift(u.id)}`, u.avatar));
  }

  for (const t of TABLES) {
    const cols = Object.keys(t.cols);
    const rows = (src[t.table] ?? []).map((r) => [lit(t.cols.id!(r)), org, ...cols.slice(1).map((c) => lit(t.cols[c]!(r)))]);
    out.push(...inserts(t.table, ["id", "org_id", ...cols.slice(1)], rows));
  }

  out.push(...inserts("counters", ["org_id", "name", "value"], (src.counters ?? []).map((c) => [org, lit(c.name), lit(c.seq)])));

  if (o.logo?.bytes.length) {
    out.push(`INSERT INTO counters(org_id,name,value) VALUES(${org},'logo_v',1);`);
    out.push(`INSERT INTO org_assets(org_id,kind,bytes,type,v) VALUES(${org},'logo',X'',${lit(o.logo.type)},1);`);
    out.push(...blobUpdates("org_assets", "bytes", `org_id = ${org} AND kind = 'logo'`, o.logo.bytes));
  }

  out.push(`INSERT INTO platform_audit(who,action,org_id,after_json,at) VALUES('fm-import','org.import',${org},${lit(JSON.stringify({ slug: o.slug, users: users.length, sales: (src.sales ?? []).length }))},${o.now});`);
  for (const s of out) if (s.length > MAX_STMT) throw new Error(`statement over ${MAX_STMT} bytes`);
  return out;
}

/** Every table holding the org's rows, children first, so a failed import can be removed and retried. */
const PURGE_ORDER = [
  "wa_messages", "wa_campaigns", "ratings", "announcements", "notifications", "audit_log", "ledger_entries", "money_transfers",
  "barber_payouts", "company_expenses", "expenses", "sale_items", "sales", "services", "customers", "push_tokens", "counters",
  "org_assets", "org_whatsapp", "org_feature_overrides", "login_failures", "login_handoffs", "support_sessions", "email_log",
  "job_runs", "users", "org_settings", "subscriptions", "platform_audit",
];

export function purgeSql(orgId: string): string[] {
  const org = lit(orgId);
  return [...PURGE_ORDER.map((t) => `DELETE FROM ${t} WHERE org_id = ${org};`), `DELETE FROM orgs WHERE id = ${org};`];
}

/** Tables whose row counts must match; push_tokens/login_failures/rate_hits are not imported. */
export const COUNTED = ["users", "customers", "services", "counters", ...TABLES.map((t) => t.table).filter((t) => !["customers", "services"].includes(t))];

/**
 * Queries returning (k, v) rows that must be identical on FM's database and on SalonKit's after the import:
 * row counts, live sales totals, per-day sales, customers' visits/spent, and every ledger balance by book, account
 * and barber (barber ids shifted back on the SalonKit side).
 */
export function totalsSql(side: "fm" | "ss", orgId: string): string[] {
  const where = side === "fm" ? "1 = 1" : `org_id = ${lit(orgId)}`;
  const barber = side === "fm" ? "barber_id" : `barber_id - ${ID_OFFSET}`;
  const parts = [
    // logo_v is SalonKit's own counter (the imported logo), not an FM one
    ...COUNTED.map((t) => `SELECT 'count:${t}' AS k, COUNT(*) AS v FROM ${t} WHERE ${where}${t === "counters" ? " AND name != 'logo_v'" : ""}`),
    `SELECT 'counter:' || name AS k, ${side === "fm" ? "seq" : "value"} AS v FROM counters WHERE ${where} AND name != 'logo_v'`,
    `SELECT 'sales:count' AS k, COUNT(*) AS v FROM sales WHERE ${where} AND deleted_at IS NULL`,
    `SELECT 'sales:amount' AS k, COALESCE(SUM(amount), 0) AS v FROM sales WHERE ${where} AND deleted_at IS NULL`,
    `SELECT 'sales:commission' AS k, COALESCE(SUM(commission), 0) AS v FROM sales WHERE ${where} AND deleted_at IS NULL`,
    `SELECT 'sales:vat' AS k, COALESCE(SUM(vat_amount), 0) AS v FROM sales WHERE ${where} AND deleted_at IS NULL`,
    `SELECT 'items:total' AS k, COALESCE(SUM(price * qty), 0) AS v FROM sale_items WHERE ${where}`,
    `SELECT 'day:' || day AS k, SUM(amount) AS v FROM sales WHERE ${where} AND deleted_at IS NULL GROUP BY day`,
    `SELECT 'customers:visits' AS k, COALESCE(SUM(visits), 0) AS v FROM customers WHERE ${where}`,
    `SELECT 'customers:spent' AS k, COALESCE(SUM(spent), 0) AS v FROM customers WHERE ${where}`,
    `SELECT 'expenses:amount' AS k, COALESCE(SUM(amount), 0) AS v FROM expenses WHERE ${where}`,
    `SELECT 'company_expenses:amount' AS k, COALESCE(SUM(amount), 0) AS v FROM company_expenses WHERE ${where}`,
    `SELECT 'payouts:amount' AS k, COALESCE(SUM(amount), 0) AS v FROM barber_payouts WHERE ${where}`,
    `SELECT 'transfers:amount' AS k, COALESCE(SUM(amount), 0) AS v FROM money_transfers WHERE ${where}`,
    `SELECT 'ledger:' || book || ':' || COALESCE(account, '-') || ':' || COALESCE(${barber}, '-') AS k, SUM(amount) AS v FROM ledger_entries WHERE ${where} GROUP BY 1`,
    `SELECT 'ratings:stars' AS k, COALESCE(SUM(stars), 0) AS v FROM ratings WHERE ${where}`,
    `SELECT 'avatars:bytes' AS k, COALESCE(SUM(LENGTH(avatar)), 0) AS v FROM users WHERE ${where}`,
  ];
  return parts.map((p) => `${p};`); // one per query: D1 caps the terms of a compound SELECT
}

/** Differences between two (k, v) result sets; empty when they match. */
export function compareTotals(fm: { k: string; v: Value }[], ss: { k: string; v: Value }[]): string[] {
  const a = new Map(fm.map((r) => [r.k, Number(r.v)]));
  const b = new Map(ss.map((r) => [r.k, Number(r.v)]));
  const diffs: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) diffs.push(`${k}: fm=${a.get(k) ?? "missing"} salonkit=${b.get(k) ?? "missing"}`);
  return diffs.sort();
}
