import { Hono } from "hono";
import type { AppEnv } from "../env";
import { safeEqual } from "../core/crypto";
import { invalidateFeatures } from "../core/features-cache";
import { services, StripeError } from "../core/services";
import { billingRepo } from "../data/billing";

/**
 * POST /api/stripe/webhook (no session, outside tenantGuard): Stripe's events, signed with STRIPE_WEBHOOK_SECRET.
 * Events are only a nudge: for each one we read the subscription's LIVE state from Stripe (GET /v1/subscriptions/:id,
 * pinned API version) and apply that, so late, retried or out-of-order events can never undo a newer state.
 * The org is the one owning the Stripe customer we created at checkout (metadata is only trusted on our own checkout
 * sessions, which carry our plan_id). Each event id is applied once (stripe_events, in the same batch as the change).
 * A failure answers 500 so Stripe retries.
 */
export const stripeWebhook = new Hono<AppEnv>();

/** Seconds a signed timestamp may be off (Stripe's default tolerance). */
export const STRIPE_TOLERANCE_S = 300;
const MAX_BODY = 512 * 1024;
const HANDLED = new Set(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"]);

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stripe-Signature "t=…,v1=…[,v1=…]" over `${t}.${body}`. */
export async function validStripeSignature(header: string | undefined, body: string, secret: string, nowS: number): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!t || !/^\d+$/.test(t) || !sigs.length || Math.abs(nowS - Number(t)) > STRIPE_TOLERANCE_S) return false;
  const want = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => safeEqual(s, want));
}

type Obj = Record<string, any>;
const sec = (v: unknown) => (typeof v === "number" ? v * 1000 : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** A Stripe subscription status in our terms. Null: not a state we act on (incomplete: payment not finished yet). */
export function stateOf(status: string): "paid" | "failing" | "ended" | null {
  if (status === "active" || status === "trialing") return "paid";
  if (status === "past_due" || status === "unpaid") return "failing";
  if (status === "canceled" || status === "incomplete_expired" || status === "paused") return "ended";
  return null;
}

/** The subscription an event is about, whatever the payload's API version. */
export function subscriptionIdOf(type: string, o: Obj): string | null {
  if (type.startsWith("customer.subscription.")) return str(o.id);
  if (type === "checkout.session.completed") return str(o.subscription);
  return str(o.subscription) ?? str(o.parent?.subscription_details?.subscription) ?? str(o.lines?.data?.[0]?.subscription);
}

stripeWebhook.post("/", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.text("Not configured", 503);
  if (Number(c.req.header("content-length") ?? 0) > MAX_BODY) return c.text("Too large", 413);
  const body = await c.req.text();
  if (body.length > MAX_BODY) return c.text("Too large", 413);
  if (!(await validStripeSignature(c.req.header("stripe-signature"), body, secret, Math.floor(Date.now() / 1000)))) return c.text("Bad signature", 400);
  let ev: { id?: string; type?: string; data?: { object?: Obj } };
  try {
    ev = JSON.parse(body);
  } catch {
    return c.text("Bad JSON", 400);
  }
  const o = ev.data?.object;
  if (!ev.id || !ev.type || !o || !HANDLED.has(ev.type)) return c.text("ok");
  if (ev.type === "checkout.session.completed" && o.mode !== "subscription") return c.text("ok");
  const subId = subscriptionIdOf(ev.type, o);
  if (!subId) return c.text("ok");
  const repo = billingRepo(c.env.DB);
  try {
    const customer = str(o.customer);
    let orgId = customer ? await repo.orgByCustomer(customer) : null;
    // Our own checkout sessions carry org_id + plan_id metadata (Payment Links can't set plan_id): trusted fallback.
    if (!orgId && ev.type === "checkout.session.completed" && str(o.metadata?.plan_id)) orgId = str(o.metadata?.org_id);
    if (!orgId || !(await c.env.DB.prepare("SELECT 1 FROM orgs WHERE id = ?").bind(orgId).first())) return c.text("ok");

    let live: Obj;
    try {
      live = await services(c.env).stripe.get<Obj>(c.env, `/subscriptions/${encodeURIComponent(subId)}`);
    } catch (e) {
      if (e instanceof StripeError && e.status === 404) return c.text("ok"); // not ours / gone
      throw e;
    }
    const status = String(live.status ?? "");
    const state = stateOf(status);
    if (!state) return c.text("ok");
    const item = live.items?.data?.[0];
    const price = str(item?.price?.id);
    const planId = (price && (await repo.planByPrice(price))) || str(live.metadata?.plan_id);
    const applied = await repo.applyStripe(
      orgId,
      ev.id,
      { state, planId, customerId: str(live.customer) ?? customer, subscriptionId: subId, status, periodEnd: sec(live.current_period_end ?? item?.current_period_end), cancelAt: sec(live.cancel_at) },
      ev.type,
      Date.now(),
    );
    if (applied) invalidateFeatures(orgId);
    return c.text("ok");
  } catch (err) {
    console.error("stripe webhook failed", ev.type, err);
    return c.text("Retry", 500);
  }
});
