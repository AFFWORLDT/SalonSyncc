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

    /**
     * A customer with a name but no mobile: reuse the salon's saved one with that name (any case) and no mobile, else
     * add it, so a name-only customer is in everyone's list next time.
     */
    nameOnlyStmt(name: string): D1PreparedStatement {
      return db
        .prepare(
          `INSERT INTO customers (org_id, name, phone, created_at)
           SELECT ?1, ?2, NULL, ?3 WHERE NOT EXISTS (SELECT 1 FROM customers WHERE org_id = ?1 AND phone IS NULL AND name = ?2 COLLATE NOCASE)`,
        )
        .bind(orgId, name, Date.now());
    },

    /** The id of the name-only customer, evaluated inside a batch (after nameOnlyStmt). */
    idByName(name: string): { sql: string; binds: unknown[] } {
      return { sql: "(SELECT id FROM customers WHERE org_id = ? AND phone IS NULL AND name = ? COLLATE NOCASE ORDER BY id LIMIT 1)", binds: [orgId, name] };
    },

    /** The customer's id subquery and its find-or-create statement, for a sale's batch. */
    forSale(c: { phone: string | null; name: string | null; rename: boolean }): { id: { sql: string; binds: unknown[] }; stmt: D1PreparedStatement } | null {
      if (c.phone) return { id: this.idByPhone(c.phone), stmt: this.upsertStmt(c.name, c.phone, c.rename) };
      if (c.name) return { id: this.idByName(c.name), stmt: this.nameOnlyStmt(c.name) };
      return null;
    },

    /** Changes a customer's name and mobile (anyone on the team can). Null when the customer isn't in this salon. */
    async edit(id: number, name: string | null, phone: string | null): Promise<CustomerSuggestionRow | null> {
      return db
        .prepare("UPDATE customers SET name = ?, phone = ? WHERE org_id = ? AND id = ? RETURNING id, name, phone")
        .bind(name, phone, orgId, id)
        .first<CustomerSuggestionRow>();
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

    /** Nothing typed yet: the salon's most recent customers (whoever served them), so the whole team shares one list. */
    async recent(): Promise<CustomerSuggestionRow[]> {
      const r = await db
        .prepare(
          `SELECT id, name, phone FROM customers WHERE org_id = ? AND COALESCE(name, phone) IS NOT NULL
           ORDER BY COALESCE(last_visit_at, created_at) DESC, id DESC LIMIT ${LIMIT}`,
        )
        .bind(orgId)
        .all<CustomerSuggestionRow>();
      return r.results;
    },

    /** Any of the salon's customers whose name or mobile matches (or whose full mobile is `exactPhone`). */
    async search(q: string, exactPhone: string): Promise<CustomerSuggestionRow[]> {
      const digits = q.replace(/\D/g, "").replace(/^0+/, "");
      const r = await db
        .prepare(
          `SELECT id, name, phone FROM customers
           WHERE org_id = ?1 AND (CASE
             WHEN ?4 <> '' AND phone = ?4 THEN 1
             WHEN name LIKE ?2 ESCAPE '\\' THEN 1
             WHEN ?3 <> '' AND phone LIKE '%' || ?3 || '%' THEN 1
             ELSE 0 END) = 1
           ORDER BY COALESCE(last_visit_at, created_at) DESC, id DESC LIMIT ${LIMIT}`,
        )
        .bind(orgId, `%${likeEscape(q)}%`, digits, exactPhone)
        .all<CustomerSuggestionRow>();
      return r.results;
    },
  };
}
