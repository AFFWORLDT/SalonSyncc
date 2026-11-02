/**
 * Billing data (Stripe, spec §11). Platform-level: subscriptions, plans and stripe_events have no org_id scoping of
 * their own beyond the org id they are keyed by; every call names the org it changes.
 */
export interface SubRow {
  provider: "none" | "stripe" | "manual";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: number | null;
  cancel_at: number | null;
}
export interface PlanRow {
  id: string;
  name: string;
  price_monthly: number;
  currency: string;
  stripe_price_id: string | null;
  active: number;
  sort: number;
}

const DAY = 86_400_000;
/** Org statuses a payment event may move (a super admin's deactivate or delete always wins). */
const MOVABLE = "('trial','active','grace','past_due','expired')";

export function billingRepo(db: D1Database) {
  return {
    async sub(orgId: string): Promise<SubRow | null> {
      return db.prepare("SELECT provider, stripe_customer_id, stripe_subscription_id, status, current_period_end, cancel_at FROM subscriptions WHERE org_id = ?").bind(orgId).first<SubRow>();
    },
    async plans(): Promise<PlanRow[]> {
      return (await db.prepare("SELECT id, name, price_monthly, currency, stripe_price_id, active, sort FROM plans ORDER BY sort").all<PlanRow>()).results;
    },
    async setCustomer(orgId: string, customerId: string): Promise<void> {
      await db
        .prepare("INSERT INTO subscriptions(org_id, stripe_customer_id) VALUES(?1, ?2) ON CONFLICT(org_id) DO UPDATE SET stripe_customer_id = ?2")
        .bind(orgId, customerId)
        .run();
    },
    async orgByCustomer(customerId: string): Promise<string | null> {
      const r = await db.prepare("SELECT org_id FROM subscriptions WHERE stripe_customer_id = ?").bind(customerId).first<{ org_id: string }>();
      return r?.org_id ?? null;
    },
    async planByPrice(priceId: string): Promise<string | null> {
      const r = await db.prepare("SELECT id FROM plans WHERE stripe_price_id = ?").bind(priceId).first<{ id: string }>();
      return r?.id ?? null;
    },
    /**
     * Applies a Stripe subscription's LIVE state (read from Stripe, so event order and retries don't matter) with an
     * audit row and the event id, in one batch. The batch starts with a plain INSERT into stripe_events: a duplicate
     * event fails the whole batch (nothing applied twice), and an event that never got here is not marked done.
     *   paid    -> active on its plan (also takes over from a manual payment: they now pay by card)
     *   failing -> past_due with 7 days' grace (kept if already past_due)
     *   ended   -> expired
     * failing/ended only count for the subscription on file, and never while the salon is paid by hand.
     * Returns false when the event was already processed.
     */
    async applyStripe(
      orgId: string,
      eventId: string,
      s: { state: "paid" | "failing" | "ended"; planId: string | null; customerId: string | null; subscriptionId: string; status: string; periodEnd: number | null; cancelAt: number | null },
      eventType: string,
      at: number,
    ): Promise<boolean> {
      // Rows the non-paid moves apply to: this subscription is the one on file, and the salon isn't paid by hand.
      const mine = "EXISTS (SELECT 1 FROM subscriptions WHERE org_id = ?1 AND provider = 'stripe' AND stripe_subscription_id = ?3)";
      const orgUpdate =
        s.state === "paid"
          ? db.prepare(`UPDATE orgs SET status = 'active', plan_id = COALESCE(?2, plan_id) WHERE id = ?1 AND status IN ${MOVABLE}`).bind(orgId, s.planId)
          : s.state === "failing"
            ? db
                .prepare(`UPDATE orgs SET status = 'past_due', grace_ends_at = CASE WHEN status = 'past_due' THEN grace_ends_at ELSE ?2 END WHERE id = ?1 AND status IN ('active','past_due') AND ${mine}`)
                .bind(orgId, at + 7 * DAY, s.subscriptionId)
            : db.prepare(`UPDATE orgs SET status = 'expired' WHERE id = ?1 AND plan_id != 'free' AND status IN ${MOVABLE} AND ?2 = ?2 AND ${mine}`).bind(orgId, 0, s.subscriptionId);
      const subUpdate =
        s.state === "paid"
          ? db
              .prepare(
                `INSERT INTO subscriptions(org_id, provider, stripe_customer_id, stripe_subscription_id, status, current_period_end, cancel_at) VALUES(?1, 'stripe', ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(org_id) DO UPDATE SET provider = 'stripe', stripe_customer_id = COALESCE(?2, stripe_customer_id), stripe_subscription_id = ?3,
                   status = ?4, current_period_end = ?5, cancel_at = ?6`,
              )
              .bind(orgId, s.customerId, s.subscriptionId, s.status, s.periodEnd, s.cancelAt)
          : db
              .prepare(`UPDATE subscriptions SET status = ?4, current_period_end = COALESCE(?5, current_period_end), cancel_at = ?6 WHERE org_id = ?1 AND provider = 'stripe' AND stripe_subscription_id = ?3 AND ?2 = ?2`)
              .bind(orgId, 0, s.subscriptionId, s.status, s.periodEnd, s.cancelAt);
      try {
        await db.batch([
          db.prepare("INSERT INTO stripe_events(event_id, received_at) VALUES(?, ?)").bind(eventId, at),
          db
            .prepare(
              `INSERT INTO platform_audit(who,action,org_id,before_json,after_json,at)
               SELECT 'stripe', ?2, id, json_object('status', status, 'plan_id', plan_id), json_object('state', ?3, 'plan_id', ?4, 'stripe_status', ?5, 'subscription', ?7), ?6 FROM orgs WHERE id = ?1`,
            )
            .bind(orgId, eventType, s.state, s.planId, s.status, at, s.subscriptionId),
          orgUpdate,
          subUpdate,
        ]);
        return true;
      } catch (e) {
        if (/UNIQUE constraint failed: stripe_events/i.test(String((e as Error)?.message ?? e))) return false;
        throw e;
      }
    },
    /** The owner picks Free: permanent, core features only, any lapsed state becomes active. */
    async chooseFree(orgId: string, who: string, at: number): Promise<void> {
      await db.batch([
        db
          .prepare(`INSERT INTO platform_audit(who,action,org_id,before_json,after_json,at) SELECT ?2, 'choose_free', id, json_object('status', status, 'plan_id', plan_id), json_object('status', 'active', 'plan_id', 'free'), ?3 FROM orgs WHERE id = ?1`)
          .bind(orgId, who, at),
        db.prepare(`UPDATE orgs SET status = 'active', plan_id = 'free' WHERE id = ?1 AND status IN ${MOVABLE}`).bind(orgId),
      ]);
    },
  };
}
