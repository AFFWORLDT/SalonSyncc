import type { Sale, SaleItem, PaymentMode } from "@ss/contract";
import { auditRepo, type AuditInput } from "./audit";
import { customersRepo, likeEscape } from "./customers";
import { ledgerRepo } from "./ledger";
import { needsRepost, saleLines } from "../../lib/ledger";
import { randomToken } from "../../core/crypto";

/** Sale rows with the barber's name, the customer's phone and the items (JSON). Every join and subquery stays in the org. */
const SALE_SELECT = `
  SELECT s.id, s.bill_no, s.token, s.day, s.barber_id, u.name AS barber_name, s.customer_id, s.customer_label,
         c.phone AS customer_phone, s.amount, s.payment_mode, s.note, s.commission_pct, s.commission,
         s.vat_rate, s.vat_amount, s.created_at,
         (SELECT json_group_array(json_object('service_id', i.service_id, 'name', i.name, 'price', i.price, 'qty', i.qty))
            FROM (SELECT service_id, name, price, qty FROM sale_items WHERE org_id = s.org_id AND sale_id = s.id ORDER BY id) i) AS items_json
  FROM sales s
  JOIN users u ON u.org_id = s.org_id AND u.id = s.barber_id
  LEFT JOIN customers c ON c.org_id = s.org_id AND c.id = s.customer_id
  WHERE s.org_id = ? AND s.deleted_at IS NULL`;

type SaleRow = Omit<Sale, "items"> & { items_json: string | null };

function toSale(r: SaleRow): Sale {
  const { items_json, ...rest } = r;
  let items: SaleItem[] = [];
  try {
    items = items_json ? (JSON.parse(items_json) as SaleItem[]) : [];
  } catch {}
  return { ...rest, items };
}

export interface SaleFilters {
  day?: string;
  from?: string;
  to?: string;
  barberId?: number;
  customerId?: number;
  q?: string;
  paymentMode?: PaymentMode;
}

export interface SaleBarber {
  id: number;
  name: string;
  commission_pct: number | null;
}

export interface SaleServiceRow {
  id: number;
  name: string;
  price: number;
}

/** Everything a new bill needs; amounts in minor units, rates in percent. */
export interface NewSale {
  bill_no: string;
  day: string;
  barber: SaleBarber;
  customer: { phone: string; name: string | null; rename: boolean } | null;
  customer_label: string;
  amount: number;
  payment_mode: PaymentMode;
  note: string | null;
  commission_pct: number;
  commission: number;
  vat_rate: number;
  vat_amount: number;
  items: SaleItem[];
}

/** An edit's new values (FM PUT /sales/:id); bill_no, token and created_by never change. */
export interface SaleEdit {
  day: string;
  barber: { id: number; name: string };
  customer: { phone: string; name: string | null; rename: boolean } | null;
  customer_label: string;
  amount: number;
  payment_mode: PaymentMode;
  note: string | null;
  commission_pct: number;
  commission: number;
  vat_amount: number;
  items: SaleItem[];
}

const linesOf = (s: Pick<Sale, "day" | "amount" | "payment_mode" | "barber_id" | "commission" | "bill_no" | "customer_label">) =>
  saleLines({ day: s.day, amount: s.amount, payment_mode: s.payment_mode, barber_id: s.barber_id, commission: s.commission, bill_no: s.bill_no, customer_label: s.customer_label });

/** What the audit log keeps of a bill (FM saleSnapshot). */
export function saleSnapshot(s: Omit<Sale, "id" | "token" | "bill_no" | "created_at" | "customer_id">) {
  return {
    day: s.day,
    barber_id: s.barber_id,
    barber_name: s.barber_name,
    customer_label: s.customer_label,
    customer_phone: s.customer_phone,
    amount: s.amount,
    payment_mode: s.payment_mode,
    note: s.note,
    commission_pct: s.commission_pct,
    commission: s.commission,
    vat_rate: s.vat_rate,
    vat_amount: s.vat_amount,
    items: s.items.map((i) => ({ name: i.name, price: i.price, qty: i.qty })),
  };
}

/** Every query here is scoped by org_id; test/sql-guard.test.ts enforces it. */
export function salesRepo(db: D1Database, orgId: string) {
  const audit = auditRepo(db, orgId);
  const ledger = ledgerRepo(db, orgId);
  const customers = customersRepo(db, orgId);

  return {
    /** An active user of this org who can take a sale; null otherwise (another org's id, inactive, unknown). */
    barberForSale(id: number): Promise<SaleBarber | null> {
      return db
        .prepare("SELECT id, name, commission_pct FROM users WHERE org_id = ? AND id = ? AND active = 1 AND role IN ('owner','admin','barber')")
        .bind(orgId, id)
        .first<SaleBarber>();
    },

    /** This org's catalogue services among `ids`, hidden ones included (FM: only a missing service is an error). */
    async servicesByIds(ids: number[]): Promise<Map<number, SaleServiceRow>> {
      const out = new Map<number, SaleServiceRow>();
      if (!ids.length) return out;
      const r = await db
        .prepare(`SELECT id, name, price FROM services WHERE org_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
        .bind(orgId, ...ids)
        .all<SaleServiceRow>();
      for (const s of r.results) out.set(s.id, s);
      return out;
    },

    /** A live (not deleted) sale of this org. */
    async byId(id: number): Promise<Sale | null> {
      const r = await db.prepare(`${SALE_SELECT} AND s.id = ?`).bind(orgId, id).first<SaleRow>();
      return r ? toSale(r) : null;
    },

    /** A live sale of this org by its receipt token. */
    async byToken(token: string): Promise<Sale | null> {
      const r = await db.prepare(`${SALE_SELECT} AND s.token = ?`).bind(orgId, token).first<SaleRow>();
      return r ? toSale(r) : null;
    },

    /**
     * FM PUT /sales/:id in one batch: customer upsert, the row, items deleted and reinserted, the audit row (before/after),
     * and the ledger reversed and reposted only when the money lines differ (needsRepost).
     */
    async update(old: Sale, e: SaleEdit, actor: AuditInput["actor"]): Promise<void> {
      const at = Date.now();
      const cust = e.customer ? customers.idByPhone(e.customer.phone) : { sql: "NULL", binds: [] };
      const next = {
        ...old,
        day: e.day,
        barber_id: e.barber.id,
        barber_name: e.barber.name,
        customer_label: e.customer_label,
        customer_phone: e.customer?.phone ?? null,
        amount: e.amount,
        payment_mode: e.payment_mode,
        note: e.note,
        commission_pct: e.commission_pct,
        commission: e.commission,
        vat_amount: e.vat_amount,
        items: e.items,
      };
      const oldLines = linesOf(old);
      const newLines = linesOf(next);
      const stmts: D1PreparedStatement[] = [];
      if (e.customer) stmts.push(customers.upsertStmt(e.customer.name, e.customer.phone, e.customer.rename));
      stmts.push(
        db
          .prepare(
            `UPDATE sales SET day = ?, barber_id = ?, customer_id = ${cust.sql}, customer_label = ?, amount = ?, payment_mode = ?, note = ?,
                    commission_pct = ?, commission = ?, vat_amount = ?, updated_at = ?
             WHERE org_id = ? AND id = ? AND deleted_at IS NULL`,
          )
          .bind(e.day, e.barber.id, ...cust.binds, e.customer_label, e.amount, e.payment_mode, e.note, e.commission_pct, e.commission, e.vat_amount, at, orgId, old.id),
        db.prepare("DELETE FROM sale_items WHERE org_id = ? AND sale_id = ?").bind(orgId, old.id),
        ...e.items.map((i) =>
          db
            .prepare("INSERT INTO sale_items (org_id, sale_id, service_id, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(orgId, old.id, i.service_id, i.name, i.price, i.qty),
        ),
        audit.stmt({ actor, entity: "sale", entityId: old.id, ref: old.bill_no, action: "update", before: saleSnapshot(old), after: saleSnapshot(next) }),
      );
      if (needsRepost(oldLines, newLines)) {
        stmts.push(...ledger.reverseStmts("sale", old.id, actor.id), ...ledger.postStmts("sale", old.id, old.bill_no, actor.id, newLines));
      }
      await db.batch(stmts);
    },

    /** FM DELETE /sales/:id: soft delete, audit, and every live ledger line reversed, in one batch. */
    async remove(old: Sale, actor: AuditInput["actor"]): Promise<void> {
      const at = Date.now();
      await db.batch([
        db.prepare("UPDATE sales SET deleted_at = ?, updated_at = ? WHERE org_id = ? AND id = ? AND deleted_at IS NULL").bind(at, at, orgId, old.id),
        audit.stmt({ actor, entity: "sale", entityId: old.id, ref: old.bill_no, action: "delete", before: saleSnapshot(old), after: null }),
        ...ledger.reverseStmts("sale", old.id, actor.id),
      ]);
    },

    /** Writes the bill, its items, the customer upsert, the audit row and the ledger lines in one batch. */
    async create(n: NewSale, actor: AuditInput["actor"]): Promise<Sale> {
      const at = Date.now();
      const saleId = { sql: "(SELECT id FROM sales WHERE org_id = ? AND bill_no = ?)", binds: [orgId, n.bill_no] };
      const cust = n.customer ? customers.idByPhone(n.customer.phone) : { sql: "NULL", binds: [] };
      const snapshot = saleSnapshot({
        day: n.day,
        barber_id: n.barber.id,
        barber_name: n.barber.name,
        customer_label: n.customer_label,
        customer_phone: n.customer?.phone ?? null,
        amount: n.amount,
        payment_mode: n.payment_mode,
        note: n.note,
        commission_pct: n.commission_pct,
        commission: n.commission,
        vat_rate: n.vat_rate,
        vat_amount: n.vat_amount,
        items: n.items,
      });
      const stmts: D1PreparedStatement[] = [];
      if (n.customer) stmts.push(customers.upsertStmt(n.customer.name, n.customer.phone, n.customer.rename));
      const saleIdx = stmts.length;
      stmts.push(
        db
          .prepare(
            `INSERT INTO sales (org_id, bill_no, token, day, barber_id, customer_id, customer_label, amount, payment_mode, note,
                                commission_pct, commission, vat_rate, vat_amount, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ${cust.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING id, bill_no, token, day, barber_id, customer_id, customer_label, amount, payment_mode, note,
                       commission_pct, commission, vat_rate, vat_amount, created_at`,
          )
          .bind(
            orgId, n.bill_no, randomToken(12), n.day, n.barber.id, ...cust.binds, n.customer_label, n.amount, n.payment_mode, n.note,
            n.commission_pct, n.commission, n.vat_rate, n.vat_amount, actor.id, at, at,
          ),
        ...n.items.map((i) =>
          db
            .prepare(
              "INSERT INTO sale_items (org_id, sale_id, service_id, name, price, qty) VALUES (?, (SELECT id FROM sales WHERE org_id = ? AND bill_no = ?), ?, ?, ?, ?)",
            )
            .bind(orgId, orgId, n.bill_no, i.service_id, i.name, i.price, i.qty),
        ),
        audit.stmt({ actor, entity: "sale", entityId: saleId, ref: n.bill_no, action: "create", before: null, after: snapshot }),
        ...ledger.postStmts(
          "sale",
          saleId,
          n.bill_no,
          actor.id,
          saleLines({ day: n.day, amount: n.amount, payment_mode: n.payment_mode, barber_id: n.barber.id, commission: n.commission, bill_no: n.bill_no, customer_label: n.customer_label }),
        ),
      );
      const res = await db.batch(stmts);
      const row = res[saleIdx]!.results[0] as Omit<Sale, "barber_name" | "customer_phone" | "items">;
      return { ...row, barber_name: n.barber.name, customer_phone: n.customer?.phone ?? null, items: n.items };
    },

    /** FM GET /sales: newest first, with the total count and Σ amount of every match. */
    async list(f: SaleFilters, page: number, pageSize: number): Promise<{ items: Sale[]; total: number; sum: number }> {
      const where: string[] = [];
      const binds: unknown[] = [];
      const add = (sql: string, ...v: unknown[]) => {
        where.push(sql);
        binds.push(...v);
      };
      if (f.day) add("s.day = ?", f.day);
      if (f.from) add("s.day >= ?", f.from);
      if (f.to) add("s.day <= ?", f.to);
      if (f.barberId !== undefined) add("s.barber_id = ?", f.barberId);
      if (f.customerId !== undefined) add("s.customer_id = ?", f.customerId);
      if (f.paymentMode) add("s.payment_mode = ?", f.paymentMode);
      if (f.q) {
        const like = `%${likeEscape(f.q)}%`;
        add(
          "(CASE WHEN s.bill_no LIKE ? ESCAPE '\\' THEN 1 WHEN s.customer_label LIKE ? ESCAPE '\\' THEN 1 WHEN c.phone LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END) = 1",
          like, like, like,
        );
      }
      const extra = where.map((w) => ` AND ${w}`).join("");
      const [rows, agg] = await Promise.all([
        db.prepare(`${SALE_SELECT}${extra} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`).bind(orgId, ...binds, pageSize, (page - 1) * pageSize).all<SaleRow>(),
        db
          .prepare(
            `SELECT COUNT(*) AS n, COALESCE(SUM(s.amount), 0) AS sum FROM sales s LEFT JOIN customers c ON c.org_id = s.org_id AND c.id = s.customer_id
             WHERE s.org_id = ? AND s.deleted_at IS NULL${extra}`,
          )
          .bind(orgId, ...binds)
          .first<{ n: number; sum: number }>(),
      ]);
      return { items: rows.results.map(toSale), total: agg?.n ?? 0, sum: agg?.sum ?? 0 };
    },
  };
}
