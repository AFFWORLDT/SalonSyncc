import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireAdmin } from "../../core/roles";
import { services, StripeError } from "../../core/services";
import { invalidateFeatures } from "../../core/features-cache";
import { billingRepo } from "../../data/billing";

/**
 * /api/billing (owner/admin): the plan page's data, Stripe Checkout and the Billing Portal, and choosing Free.
 * Allowed for lapsed salons (writeGuard lets /api/billing/ through): paying is how an expired salon comes back.
 */
export const billing = new Hono<AppEnv>();
billing.use("*", requireAdmin);

const stripeDown = (e: unknown) => (e instanceof StripeError ? new HttpError(502, "Payments are not available right now. Try again in a minute.") : e);

function salonUrl(c: { env: AppEnv["Bindings"]; req: { url: string } }, slug: string): string {
  const root = c.env.ROOT_DOMAIN;
  return root ? `https://${slug}.${root}` : new URL(c.req.url).origin;
}

billing.get("/", async (c) => {
  const { org } = c.var.tenant;
  const repo = billingRepo(c.env.DB);
  const [sub, plans] = await Promise.all([repo.sub(org.id), repo.plans()]);
  const enabled = !!c.env.STRIPE_SECRET_KEY;
  return c.json({
    enabled,
    provider: sub?.provider ?? "none",
    stripe_status: sub?.provider === "stripe" ? sub.status : null,
    current_period_end: sub?.current_period_end ?? null,
    cancel_at: sub?.cancel_at ?? null,
    can_manage: enabled && !!sub?.stripe_customer_id,
    plans: plans
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.name, price_monthly: p.price_monthly, currency: p.currency, can_checkout: enabled && p.price_monthly > 0 && !!p.stripe_price_id })),
  });
});

/** Whether the org has a Stripe subscription that still bills (then plan changes go through the portal). */
const billingNow = (s: { provider: string; status: string | null } | null) => s?.provider === "stripe" && ["active", "trialing", "past_due", "unpaid"].includes(s.status ?? "");

billing.post("/checkout", async (c) => {
  const { org, user } = c.var.tenant;
  if (!c.env.STRIPE_SECRET_KEY) throw new HttpError(503, "Online payment isn't switched on yet. Contact us to upgrade.", "billing_off");
  let b: { plan_id?: unknown } = {};
  try {
    b = (await c.req.json()) ?? {};
  } catch {
    /* below */
  }
  const repo = billingRepo(c.env.DB);
  const plan = (await repo.plans()).find((p) => p.id === b.plan_id && p.active && p.price_monthly > 0 && p.stripe_price_id);
  if (!plan) throw new HttpError(400, "Pick a paid plan");
  const sub = await repo.sub(org.id);
  if (billingNow(sub)) throw new HttpError(409, "You already pay by card. Change your plan in Manage billing.", "has_subscription");
  const stripe = services(c.env).stripe;
  try {
    let customer = sub?.stripe_customer_id ?? null;
    if (!customer) {
      const owner = await c.env.DB.prepare("SELECT owner_email FROM orgs WHERE id = ?").bind(org.id).first<{ owner_email: string | null }>();
      const created = await stripe.post<{ id: string }>(c.env, "/customers", {
        name: org.name,
        ...(owner?.owner_email ? { email: owner.owner_email } : {}),
        "metadata[org_id]": org.id,
        "metadata[slug]": org.slug,
      });
      customer = created.id;
      await repo.setCustomer(org.id, customer);
    }
    const base = salonUrl(c, org.slug);
    const session = await stripe.post<{ url: string }>(c.env, "/checkout/sessions", {
      mode: "subscription",
      customer,
      client_reference_id: org.id,
      "line_items[0][price]": plan.stripe_price_id!,
      "line_items[0][quantity]": "1",
      success_url: `${base}/plan/?paid=1`,
      cancel_url: `${base}/plan/`,
      "metadata[org_id]": org.id,
      "metadata[plan_id]": plan.id,
      "metadata[by]": user.username,
      "subscription_data[metadata][org_id]": org.id,
      "subscription_data[metadata][plan_id]": plan.id,
      allow_promotion_codes: "true",
    });
    return c.json({ url: session.url });
  } catch (e) {
    throw stripeDown(e);
  }
});

billing.post("/portal", async (c) => {
  const { org } = c.var.tenant;
  if (!c.env.STRIPE_SECRET_KEY) throw new HttpError(503, "Online payment isn't switched on yet.", "billing_off");
  const sub = await billingRepo(c.env.DB).sub(org.id);
  if (!sub?.stripe_customer_id) throw new HttpError(400, "No card payments yet");
  try {
    const s = await services(c.env).stripe.post<{ url: string }>(c.env, "/billing_portal/sessions", { customer: sub.stripe_customer_id, return_url: `${salonUrl(c, org.slug)}/plan/` });
    return c.json({ url: s.url });
  } catch (e) {
    throw stripeDown(e);
  }
});

billing.post("/free", async (c) => {
  const { org, user } = c.var.tenant;
  if (user.role !== "owner") throw new HttpError(403, "Only the owner can change the plan");
  const repo = billingRepo(c.env.DB);
  if (billingNow(await repo.sub(org.id))) throw new HttpError(409, "Cancel your paid plan in Manage billing first.", "has_subscription");
  await repo.chooseFree(org.id, `owner:${user.username}`, Date.now());
  invalidateFeatures(org.id);
  return c.json({ ok: true });
});
