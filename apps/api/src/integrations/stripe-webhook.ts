import { Hono } from "hono";
import type { AppEnv } from "../env";
import { safeEqual } from "../core/crypto";
import { invalidateFeatures } from "../core/features-cache";
import { billingRepo } from "../data/billing";

/**
 * POST /api/stripe/webhook (no session, outside tenantGuard): Stripe's events, signed with STRIPE_WEBHOOK_SECRET.
 * Each event id is processed once (stripe_events); a processing failure releases the id and answers 500 so Stripe
 * retries. Handled: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid,
 * invoice.payment_failed. The org comes from the Stripe customer we created for it (or the metadata we set).
 */
export const stripeWebhook = new Hono<AppEnv>();

/** Seconds a signed timestamp may be off (Stripe's default tolerance). */
export const STRIPE_TOLERANCE_S = 300;
const MAX_BODY = 512 * 1024;

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

/** A Stripe subscription status in our terms. Null: not a state we act on (incomplete). */
export function stateOf(status: string): "paid" | "failing" | "ended" | null {
  if (status === "active" || status === "trialing") return "paid";
  if (status === "past_due" || status === "unpaid") return "failing";
  if (status === "canceled" || status === "incomplete_expired") return "ended";
  return null;
}

stripeWebhook.post("/", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.text("Not configured", 503);
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
  if (!ev.id || !ev.type || !o) return c.text("ok");
  const repo = billingRepo(c.env.DB);
  const at = Date.now();
  if (!(await repo.claimEvent(ev.id, at))) return c.text("ok"); // already processed
  try {
    const customer = str(o.customer);
    const orgId = (customer && (await repo.orgByCustomer(customer))) || str(o.metadata?.org_id) || str(o.client_reference_id);
    if (!orgId) return c.text("ok");
    const exists = await c.env.DB.prepare("SELECT 1 FROM orgs WHERE id = ?").bind(orgId).first();
    if (!exists) return c.text("ok");

    if (ev.type === "checkout.session.completed") {
      if (o.mode === "subscription" && (o.payment_status === "paid" || o.status === "complete")) {
        await repo.applyStripe(orgId, { state: "paid", planId: str(o.metadata?.plan_id), customerId: customer, subscriptionId: str(o.subscription), status: "active", periodEnd: null, cancelAt: null }, ev.type, at);
      }
    } else if (ev.type.startsWith("customer.subscription.")) {
      const status = ev.type === "customer.subscription.deleted" ? "canceled" : String(o.status ?? "");
      const state = stateOf(status);
      if (state) {
        const price = str(o.items?.data?.[0]?.price?.id);
        const planId = (price && (await repo.planByPrice(price))) || str(o.metadata?.plan_id);
        const periodEnd = sec(o.current_period_end ?? o.items?.data?.[0]?.current_period_end);
        await repo.applyStripe(orgId, { state, planId, customerId: customer, subscriptionId: str(o.id), status, periodEnd, cancelAt: sec(o.cancel_at) }, ev.type, at);
      }
    } else if (ev.type === "invoice.payment_failed") {
      await repo.applyStripe(orgId, { state: "failing", planId: null, customerId: customer, subscriptionId: str(o.subscription), status: "past_due", periodEnd: null, cancelAt: null }, ev.type, at);
    } else if (ev.type === "invoice.paid") {
      await repo.applyStripe(orgId, { state: "paid", planId: null, customerId: customer, subscriptionId: str(o.subscription), status: "active", periodEnd: null, cancelAt: null }, ev.type, at);
    }
    invalidateFeatures(orgId);
    return c.text("ok");
  } catch (err) {
    console.error("stripe webhook failed", ev.type, err);
    await repo.releaseEvent(ev.id).catch(() => {});
    return c.text("Retry", 500);
  }
});
