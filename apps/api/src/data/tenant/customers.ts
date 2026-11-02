/** One customer as the sale form's autocomplete sees it. */
export interface CustomerSuggestionRow {
  id: number;
  name: string | null;
  phone: string | null;
}

const LIMIT = 8;

/** Escapes LIKE wildcards for `ESCAPE '\'`. */
export const likeEscape = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Every query here is scoped by org_id; test/sql-guard.test.ts enforces it. */
export function customersRepo(db: D1Database, orgId: string) {
  return {
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
