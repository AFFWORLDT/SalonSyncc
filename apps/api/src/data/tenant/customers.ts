import type { Customer, CustomerDetail } from "@ss/contract";

/** One customer as the sale form's autocomplete sees it. */
export interface CustomerSuggestionRow {
  id: number;
  name: string | null;
  phone: string | null;
}

const LIMIT = 8;

/** Escapes LIKE wildcards for `ESCAPE '\'`. */
export const likeEscape = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

type CustomerRow = Omit<Customer, "wa_opt_out"> & { wa_opt_out: number };
const CUSTOMER_COLS = "id, name, phone, visits, spent, last_visit_at, wa_opt_out";
const toCustomer = (r: CustomerRow): Customer => ({ ...r, wa_opt_out: !!r.wa_opt_out });

/** Every query here is scoped by org_id; test/sql-guard.test.ts enforces it. */
export function customersRepo(db: D1Database, orgId: string) {
  return {
    /**
     * FM's admin list (customers_crm): every customer of the org, most recent visit first. `q` matches the name or the
     * digits of the phone, at any length.
     */
    async adminList(q: string, page: number, pageSize: number): Promise<{ items: Customer[]; total: number }> {
      const digits = q.replace(/\D/g, "").replace(/^0+/, "");
      const match = q
        ? ` AND (CASE WHEN name LIKE ?2 ESCAPE '\\' THEN 1 WHEN ?3 <> '' AND phone LIKE '%' || ?3 || '%' THEN 1 ELSE 0 END) = 1`
        : "";
      const qb = q ? [`%${likeEscape(q)}%`, digits] : [];
      const lim = q ? "?4 OFFSET ?5" : "?2 OFFSET ?3";
      const [rows, count] = await db.batch([
        db
          .prepare(`SELECT ${CUSTOMER_COLS} FROM customers WHERE org_id = ?1${match} ORDER BY last_visit_at DESC, id DESC LIMIT ${lim}`)
          .bind(orgId, ...qb, pageSize, (page - 1) * pageSize),
        db.prepare(`SELECT COUNT(*) AS n FROM customers WHERE org_id = ?1${match}`).bind(orgId, ...qb),
      ]);
      return { items: (rows!.results as CustomerRow[]).map(toCustomer), total: (count!.results[0] as { n: number }).n };
    },

    /** FM GET /customers/:id: the profile, with its visit mix, barbers and top services, from this org's live sales. */
    async detail(id: number): Promise<CustomerDetail | null> {
      const row = await db.prepare(`SELECT ${CUSTOMER_COLS} FROM customers WHERE org_id = ? AND id = ?`).bind(orgId, id).first<CustomerRow>();
      if (!row) return null;
      const [agg, barbers, services] = await db.batch([
        db
          .prepare(
            `SELECT MIN(s.created_at) AS first_visit_at, COALESCE(AVG(s.amount), 0) AS avg_bill,
                    SUM(s.payment_mode = 'cash') AS cash_visits, SUM(s.payment_mode = 'card') AS card_visits
             FROM sales s WHERE s.org_id = ?1 AND s.customer_id = ?2 AND s.deleted_at IS NULL`,
          )
          .bind(orgId, id),
        db
          .prepare(
            `SELECT u.id, u.name, COUNT(*) AS visits FROM sales s JOIN users u ON u.org_id = s.org_id AND u.id = s.barber_id
             WHERE s.org_id = ?1 AND s.customer_id = ?2 AND s.deleted_at IS NULL GROUP BY u.id ORDER BY visits DESC, MAX(s.created_at) DESC`,
          )
          .bind(orgId, id),
        db
          .prepare(
            `SELECT i.name, SUM(i.qty) AS qty FROM sale_items i JOIN sales s ON s.org_id = i.org_id AND s.id = i.sale_id
             WHERE i.org_id = ?1 AND s.org_id = ?1 AND s.customer_id = ?2 AND s.deleted_at IS NULL GROUP BY i.name ORDER BY qty DESC, i.name LIMIT 5`,
          )
          .bind(orgId, id),
      ]);
      const a = agg!.results[0] as { first_visit_at: number | null; avg_bill: number; cash_visits: number | null; card_visits: number | null };
      return {
        ...toCustomer(row),
        first_visit_at: a.first_visit_at,
        avg_bill: Math.round(a.avg_bill),
        cash_visits: a.cash_visits ?? 0,
        card_visits: a.card_visits ?? 0,
        barbers: barbers!.results as CustomerDetail["barbers"],
        services: services!.results as CustomerDetail["services"],
      };
    },

    byPhone(phone: string): Promise<{ id: number; name: string | null } | null> {
      return db.prepare("SELECT id, name FROM customers WHERE org_id = ? AND phone = ?").bind(orgId, phone).first();
    },

    /**
     * Find-or-create by canonical phone, for a sale's batch. FM rename rule: `rename` (an admin) overwrites a saved
     * name with a given one; otherwise (a barber) a given name only fills in a blank one.
     */
    upsertStmt(name: string | null, phone: string, rename: boolean): D1PreparedStatement {
      return db
        .prepare(
          `INSERT INTO customers (org_id, name, phone, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(org_id, phone) DO UPDATE SET
             name = CASE WHEN ? THEN COALESCE(excluded.name, customers.name) ELSE COALESCE(customers.name, excluded.name) END`,
        )
        .bind(orgId, name, phone, Date.now(), rename ? 1 : 0);
    },

    /** The id of the customer with this phone, evaluated inside a batch (after upsertStmt). */
    idByPhone(phone: string): { sql: string; binds: unknown[] } {
      return { sql: "(SELECT id FROM customers WHERE org_id = ? AND phone = ?)", binds: [orgId, phone] };
    },

    /** Recomputes visits, spent and last visit from the customer's live sales. */
    async refreshStats(customerId: number): Promise<void> {
      await db
        .prepare(
          `UPDATE customers SET
             visits = (SELECT COUNT(*) FROM sales WHERE org_id = ?1 AND customer_id = ?2 AND deleted_at IS NULL),
             spent = (SELECT COALESCE(SUM(amount), 0) FROM sales WHERE org_id = ?1 AND customer_id = ?2 AND deleted_at IS NULL),
             last_visit_at = (SELECT MAX(created_at) FROM sales WHERE org_id = ?1 AND customer_id = ?2 AND deleted_at IS NULL)
           WHERE org_id = ?1 AND id = ?2`,
        )
        .bind(orgId, customerId)
        .run();
    },

    /** Nothing typed yet: this barber's own most recent customers. */
    async recentForBarber(barberId: number): Promise<CustomerSuggestionRow[]> {
      const r = await db
        .prepare(
          `SELECT c.id, c.name, c.phone FROM customers c JOIN sales s ON s.org_id = c.org_id AND s.customer_id = c.id
           WHERE c.org_id = ? AND s.barber_id = ? AND s.deleted_at IS NULL
           GROUP BY c.id ORDER BY MAX(s.created_at) DESC LIMIT ${LIMIT}`,
        )
        .bind(orgId, barberId)
        .all<CustomerSuggestionRow>();
      return r.results;
    },

    /**
     * FM's barber search: any customer by their exact full phone, otherwise only customers this barber has served whose
     * name or phone matches, so the list can't be pulled out prefix by prefix. `exactPhone` is '' when q isn't a phone.
     */
    async searchForBarber(barberId: number, q: string, exactPhone: string): Promise<CustomerSuggestionRow[]> {
      const digits = q.replace(/\D/g, "").replace(/^0+/, "");
      const r = await db
        .prepare(
          `SELECT id, name, phone FROM customers
           WHERE org_id = ?1 AND (CASE
             WHEN ?4 <> '' AND phone = ?4 THEN 1
             WHEN id NOT IN (SELECT customer_id FROM sales WHERE org_id = ?1 AND barber_id = ?5 AND customer_id IS NOT NULL AND deleted_at IS NULL) THEN 0
             WHEN name LIKE ?2 ESCAPE '\\' THEN 1
             WHEN ?3 <> '' AND phone LIKE '%' || ?3 || '%' THEN 1
             ELSE 0 END) = 1
           ORDER BY last_visit_at DESC LIMIT ${LIMIT}`,
        )
        .bind(orgId, `%${likeEscape(q)}%`, digits, exactPhone, barberId)
        .all<CustomerSuggestionRow>();
      return r.results;
    },
  };
}
