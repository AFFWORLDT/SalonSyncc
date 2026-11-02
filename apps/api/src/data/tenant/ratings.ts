import type { Rating, RatingsReport } from "@ss/contract";

/** Customer ratings (FM routes.ts 224-336, 1556-1596). Every statement is scoped by org_id (RF5). */

/** FM shows the latest 200. */
export const RATINGS_LIMIT = 200;

export interface RatingRow {
  stars: number;
  comment: string | null;
}

// Binds: org, from, to.
const FROM_RANGE = `FROM ratings r JOIN sales s ON s.org_id = r.org_id AND s.id = r.sale_id JOIN users u ON u.org_id = r.org_id AND u.id = r.barber_id
  WHERE r.org_id = ? AND s.day >= ? AND s.day <= ? AND s.deleted_at IS NULL`;
// One bind: org (a request was sent for the bill).
const ASKED = "EXISTS (SELECT 1 FROM wa_messages m WHERE m.org_id = ? AND m.sale_id = s.id AND m.kind = 'feedback' AND m.status = 'sent')";

export function ratingsRepo(db: D1Database, orgId: string) {
  return {
    /** The rating already given for a sale of this org. */
    async forSale(saleId: number): Promise<RatingRow | null> {
      return db.prepare("SELECT stars, comment FROM ratings WHERE org_id = ? AND sale_id = ?").bind(orgId, saleId).first<RatingRow>();
    },

    /** A customer's name (for the greeting). */
    async customerName(customerId: number): Promise<string | null> {
      const r = await db.prepare("SELECT name FROM customers WHERE org_id = ? AND id = ?").bind(orgId, customerId).first<{ name: string | null }>();
      return r?.name ?? null;
    },

    /** One rating per bill: inserts, or updates stars/comment/updated_at (created_at is kept). */
    async upsert(sale: { id: number; customer_id: number | null; barber_id: number }, stars: number, comment: string | null): Promise<void> {
      const at = Date.now();
      await db
        .prepare(
          `INSERT INTO ratings (org_id, sale_id, customer_id, barber_id, stars, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(org_id, sale_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment, updated_at = excluded.updated_at`,
        )
        .bind(orgId, sale.id, sale.customer_id, sale.barber_id, stars, comment, at, at)
        .run();
    },

    /** Notes the first tap on "Rate your visit" for a live sale (later taps change nothing). */
    async markReviewClicked(token: string): Promise<void> {
      await db.prepare("UPDATE sales SET review_clicked_at = ? WHERE org_id = ? AND token = ? AND deleted_at IS NULL AND review_clicked_at IS NULL").bind(Date.now(), orgId, token).run();
    },

    /** Ratings for bills of days from..to: overall, per barber, the latest 200, and Google taps vs requests sent. */
    async report(from: string, to: string): Promise<RatingsReport> {
      const [all, per, list, taps] = await db.batch([
        db.prepare(`SELECT COUNT(*) AS count, AVG(r.stars) AS average ${FROM_RANGE}`).bind(orgId, from, to),
        db
          .prepare(`SELECT r.barber_id, u.name AS barber_name, COUNT(*) AS count, AVG(r.stars) AS average ${FROM_RANGE} GROUP BY r.barber_id ORDER BY average DESC, count DESC`)
          .bind(orgId, from, to),
        db
          .prepare(
            `SELECT r.id, r.sale_id, s.bill_no, s.day, r.barber_id, u.name AS barber_name, s.customer_label, r.stars, r.comment, r.created_at, r.updated_at
             ${FROM_RANGE} ORDER BY r.updated_at DESC, r.id DESC LIMIT ?`,
          )
          .bind(orgId, from, to, RATINGS_LIMIT),
        db
          .prepare(
            `SELECT s.barber_id, u.name AS barber_name, SUM(${ASKED}) AS asked, COUNT(s.review_clicked_at) AS clicked
             FROM sales s JOIN users u ON u.org_id = s.org_id AND u.id = s.barber_id
             WHERE s.org_id = ? AND s.day >= ? AND s.day <= ? AND s.deleted_at IS NULL
             GROUP BY s.barber_id HAVING asked + clicked > 0 ORDER BY clicked DESC, asked DESC`,
          )
          .bind(orgId, orgId, from, to),
      ]);
      const google = taps!.results as RatingsReport["google"]["barbers"];
      const t = all!.results[0] as { count: number; average: number | null };
      return {
        from,
        to,
        count: t.count,
        average: t.average,
        barbers: per!.results as RatingsReport["barbers"],
        ratings: list!.results as unknown as Rating[],
        google: { asked: google.reduce((a, b) => a + b.asked, 0), clicked: google.reduce((a, b) => a + b.clicked, 0), barbers: google },
      };
    },
  };
}
