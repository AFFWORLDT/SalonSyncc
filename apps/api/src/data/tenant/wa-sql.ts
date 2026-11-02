/**
 * SQL for the WhatsApp jobs (FM wa-sql.ts, per org). Every statement binds org_id as ?1 (subqueries included) and
 * every join is tied to the outer row's org_id. Every placeholder is NUMBERED: SQLite gives a bare "?" after "?5" the
 * number 6, so FM's old mix read the limit as the sale id and left LIMIT unbound ("datatype mismatch") and no rating
 * request ever went out (found 2026-10-30, bill FM-20261030-006). test/wa-sql.test.ts runs these on the real D1 schema.
 * The SQL guard forbids OR, so FM's "(?4 IS NULL OR s.id = ?4)" is "s.id = COALESCE(?5, s.id)" and
 * "(wa_reminded_at IS NULL OR wa_reminded_at < last_visit_at)" is "COALESCE(wa_reminded_at, 0) < last_visit_at".
 */

const SERVICES = `(SELECT group_concat(CASE WHEN i.qty > 1 THEN i.name || ' x' || i.qty ELSE i.name END, ', ')
         FROM sale_items i WHERE i.org_id = ?1 AND i.sale_id = s.id) AS services`;

/**
 * Sales due a rating request. Binds: ?1 org, ?2 "recent" cutoff (one request per customer per 20 h), ?3 newest
 * created_at, ?4 oldest created_at, ?5 one sale id or NULL for all, ?6 limit. Opted-out customers never come back (RF3).
 */
export const FEEDBACK_DUE_SQL = `SELECT s.id, s.token, s.customer_id, s.created_at, c.name, c.phone, u.name AS barber_name,
       ${SERVICES},
       EXISTS (SELECT 1 FROM wa_messages m WHERE m.org_id = ?1 AND m.kind = 'feedback' AND m.customer_id = s.customer_id AND m.created_at > ?2) AS recent
     FROM sales s JOIN customers c ON c.org_id = s.org_id AND c.id = s.customer_id JOIN users u ON u.org_id = s.org_id AND u.id = s.barber_id
     WHERE s.org_id = ?1 AND s.deleted_at IS NULL AND s.wa_feedback_at IS NULL AND s.created_at <= ?3 AND s.created_at > ?4
       AND c.phone IS NOT NULL AND c.wa_opt_out = 0 AND s.id = COALESCE(?5, s.id)
     ORDER BY s.created_at DESC LIMIT ?6`;

/**
 * Bills due the one rating reminder. Binds: ?1 org, ?2 newest request time, ?3 oldest request time, ?4 the request
 * template, ?5 limit. Only bills whose request was sent, not rated, and not tapped through to Google reviews.
 */
export const RATING_REMINDER_DUE_SQL = `SELECT s.id, s.token, s.customer_id, s.created_at, c.name, c.phone, u.name AS barber_name,
       ${SERVICES}
     FROM sales s JOIN customers c ON c.org_id = s.org_id AND c.id = s.customer_id JOIN users u ON u.org_id = s.org_id AND u.id = s.barber_id
     WHERE s.org_id = ?1 AND s.deleted_at IS NULL AND s.wa_feedback_reminded_at IS NULL AND s.review_clicked_at IS NULL
       AND s.wa_feedback_at <= ?2 AND s.wa_feedback_at > ?3
       AND c.phone IS NOT NULL AND c.wa_opt_out = 0
       AND EXISTS (SELECT 1 FROM wa_messages m WHERE m.org_id = ?1 AND m.sale_id = s.id AND m.kind = 'feedback' AND m.template = ?4 AND m.status = 'sent')
       AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.org_id = ?1 AND r.sale_id = s.id)
     ORDER BY s.wa_feedback_at LIMIT ?5`;

/**
 * Customers due the visit reminder. Binds: ?1 org, ?2 business-day start, ?3 next business-day start, ?4 limit.
 * Not reminded since the last visit, not opted out (RF3).
 */
export const VISIT_REMINDER_DUE_SQL = `SELECT id, name, phone FROM customers
     WHERE org_id = ?1 AND phone IS NOT NULL AND wa_opt_out = 0 AND last_visit_at >= ?2 AND last_visit_at < ?3
       AND COALESCE(wa_reminded_at, 0) < last_visit_at
     ORDER BY last_visit_at LIMIT ?4`;

export interface RatingDueRow {
  id: number;
  token: string;
  customer_id: number;
  created_at: number;
  name: string | null;
  phone: string;
  barber_name: string;
  services: string | null;
}
export interface FeedbackDueRow extends RatingDueRow {
  recent: number;
}
export interface VisitDueRow {
  id: number;
  name: string | null;
  phone: string;
}

/** The jobs' due lists (one SELECT each) and the per-item "done" marks (statements, batched with the send log). */
export function waJobsRepo(db: D1Database, orgId: string) {
  return {
    async feedbackDue(recentSince: number, newest: number, oldest: number, saleId: number | null, limit: number): Promise<FeedbackDueRow[]> {
      return (await db.prepare(FEEDBACK_DUE_SQL).bind(orgId, recentSince, newest, oldest, saleId, limit).all<FeedbackDueRow>()).results;
    },
    async ratingReminderDue(newest: number, oldest: number, requestTemplate: string, limit: number): Promise<RatingDueRow[]> {
      return (await db.prepare(RATING_REMINDER_DUE_SQL).bind(orgId, newest, oldest, requestTemplate, limit).all<RatingDueRow>()).results;
    },
    async visitRemindersDue(from: number, to: number, limit: number): Promise<VisitDueRow[]> {
      return (await db.prepare(VISIT_REMINDER_DUE_SQL).bind(orgId, from, to, limit).all<VisitDueRow>()).results;
    },
    markFeedback(saleId: number, at: number): D1PreparedStatement {
      return db.prepare("UPDATE sales SET wa_feedback_at = ? WHERE org_id = ? AND id = ?").bind(at, orgId, saleId);
    },
    markFeedbackReminded(saleId: number, at: number): D1PreparedStatement {
      return db.prepare("UPDATE sales SET wa_feedback_reminded_at = ? WHERE org_id = ? AND id = ?").bind(at, orgId, saleId);
    },
    markReminded(customerId: number, at: number): D1PreparedStatement {
      return db.prepare("UPDATE customers SET wa_reminded_at = ? WHERE org_id = ? AND id = ?").bind(at, orgId, customerId);
    },
    /** One D1 round trip for an item's writes. */
    async run(stmts: D1PreparedStatement[]): Promise<void> {
      if (stmts.length) await db.batch(stmts);
    },
  };
}
