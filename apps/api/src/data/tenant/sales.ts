import type { Sale, SaleItem, PaymentMode } from "@ss/contract";
import { auditRepo, type AuditInput } from "./audit";
import { customersRepo, likeEscape } from "./customers";
import { ledgerRepo } from "./ledger";
import { saleLines } from "../../lib/ledger";
import { randomToken } from "../../core/crypto";

/** Sale rows with the barber's name, the customer's phone and the items (JSON). Every join and subquery stays in the org. */
const SALE_SELECT = `
  SELECT s.id, s.bill_no, s.token, s.day, s.barber_id, u.name AS barber_name, s.customer_id, s.customer_label,
         c.phone AS customer_phone, s.amount, s.payment_mode, s.note, s.commission_pct, s.commission,
         s.vat_rate, s.vat_amount, s.created_at,
         (SELECT json_group_array(json_object('service_id', i.service_id, 'name', i.name, 'price', i.price, 'qty', i.qty))
            FROM sale_items i WHERE i.org_id = s.org_id AND i.sale_id = s.id) AS items_json
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

    /** This org's active catalogue services among `ids`. */
    async activeServices(ids: number[]): Promise<Map<number, SaleServiceRow>> {
      const out = new Map<number, SaleServiceRow>();
      if (!ids.length) return out;
      const r = await db
        .prepare(`SELECT id, name, price FROM services WHERE org_id = ? AND active = 1 AND id IN (${ids.map(() => "?").join(",")})`)
        .bind(orgId, ...ids)
        .all<SaleServiceRow>();
      for (const s of r.results) out.set(s.id, s);
      return out;
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
