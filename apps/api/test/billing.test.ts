import { env } from "cloudflare:test";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import app from "../src/index";
import type { Env } from "../src/env";
import { setServicesForTest } from "../src/core/services";
import { fakeServices } from "./fakes";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { stateOf, validStripeSignature } from "../src/integrations/stripe-webhook";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const WH = "whsec_test_secret";
const E = { ...env, ROOT_DOMAIN: "salonkit.online", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: WH } as Env;

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}, envOver: Partial<Env> = {}) {
  return app.fetch(
    new Request(url, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }),
    { ...E, ...envOver },
    ctx,
  );
}
async function sign(body: string, t = Math.floor(Date.now() / 1000), secret = WH) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return `t=${t},v1=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
let evN = 0;
async function hook(type: string, object: Record<string, unknown>, id = `evt_${++evN}`) {
  const body = JSON.stringify({ id, type, data: { object } });
  return req("POST", "https://salonkit.online/api/stripe/webhook", body, { "stripe-signature": await sign(body) });
}
const orgRow = (id: string) => env.DB.prepare("SELECT o.status, o.plan_id, o.grace_ends_at, s.provider, s.stripe_customer_id, s.stripe_subscription_id, s.status AS sub_status FROM orgs o JOIN subscriptions s ON s.org_id = o.id WHERE o.id = ?").bind(id).first<any>();

async function salon(slug: string, status: "trial" | "expired" | "active" = "trial") {
  const org = await makeOrg({ slug, status, plan: "pro_max" });
  await makeUser(org.id, { username: "own" });
  await makeUser(org.id, { username: "cutter", role: "barber" });
  await env.DB.prepare("UPDATE orgs SET owner_email = ? WHERE id = ?").bind(`${slug}@example.com`, org.id).run();
  const cookie = await loginAs(slug, "own", "pass1234", `${slug}.salonkit.online`);
  const B = (method: string, path: string, body?: unknown, e: Partial<Env> = {}) => req(method, `https://${slug}.salonkit.online/api/billing${path}`, body, { cookie }, e);
  return { org, cookie, B };
}

beforeAll(async () => {
  await env.DB.prepare("UPDATE plans SET stripe_price_id = 'price_' || id WHERE id != 'free'").run();
});
afterEach(() => setServicesForTest(null));

describe("billing API", () => {
  it("GET says whether online payment is on", async () => {
    const { B } = await salon("bill-get");
    const on = (await (await B("GET", "")).json()) as { enabled: boolean; plans: { id: string; can_checkout: boolean }[] };
    expect(on.enabled).toBe(true);
    expect(on.plans.find((p) => p.id === "pro")!.can_checkout).toBe(true);
    expect(on.plans.find((p) => p.id === "free")!.can_checkout).toBe(false);
    const off = (await (await B("GET", "", undefined, { STRIPE_SECRET_KEY: undefined })).json()) as { enabled: boolean };
    expect(off.enabled).toBe(false);
  });

  it("checkout creates the customer once and returns Stripe's URL", async () => {
    const f = fakeServices();
    f.install();
    const { org, B } = await salon("bill-co");
    const r = await B("POST", "/checkout", { plan_id: "pro" });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { url: string }).url).toMatch(/^https:\/\/stripe\.test\/checkout\/sessions/);
    expect(f.stripeCalls.map((x) => x.path)).toEqual(["/customers", "/checkout/sessions"]);
    const s = f.stripeCalls[1]!.params;
    expect(s).toMatchObject({ mode: "subscription", "line_items[0][price]": "price_pro", "metadata[org_id]": org.id, success_url: "https://bill-co.salonkit.online/plan/?paid=1" });
    expect(f.stripeCalls[0]!.params.email).toBe("bill-co@example.com");
    expect(f.stripeCalls[0]!.idempotencyKey).toBe(`customer-${org.id}`);
    await B("POST", "/checkout", { plan_id: "pro_max" });
    expect(f.stripeCalls.map((x) => x.path)).toEqual(["/customers", "/checkout/sessions", "/checkout/sessions"]);
    expect((await B("POST", "/checkout", { plan_id: "free" })).status).toBe(400);
  });

  it("is off without the Stripe key, admin only, and open to expired salons", async () => {
    fakeServices().install();
    const { B } = await salon("bill-guard", "expired");
    expect((await B("POST", "/checkout", { plan_id: "pro" }, { STRIPE_SECRET_KEY: undefined })).status).toBe(503);
    expect((await B("POST", "/checkout", { plan_id: "pro" })).status).toBe(200); // expired: the write guard lets billing through
    const barber = await loginAs("bill-guard", "cutter", "pass1234", "bill-guard.salonkit.online");
    expect((await req("GET", "https://bill-guard.salonkit.online/api/billing", undefined, { cookie: barber })).status).toBe(403);
  });

  it("Stripe errors answer 502, not 500", async () => {
    const { StripeError } = await import("../src/core/services");
    fakeServices({ stripe: () => { throw new StripeError("down"); } }).install();
    const { B } = await salon("bill-502");
    expect((await B("POST", "/checkout", { plan_id: "pro" })).status).toBe(502);
  });

  it("choosing Free makes a lapsed salon active on Free; not while paying by card", async () => {
    const { org, B } = await salon("bill-free", "expired");
    expect((await B("POST", "/free")).status).toBe(200);
    expect(await orgRow(org.id)).toMatchObject({ status: "active", plan_id: "free" });
    await env.DB.prepare("UPDATE subscriptions SET provider = 'stripe', status = 'active' WHERE org_id = ?").bind(org.id).run();
    expect((await B("POST", "/free")).status).toBe(409);
    expect((await B("POST", "/checkout", { plan_id: "pro" })).status).toBe(409);
  });
});

describe("Stripe webhook", () => {
  const live = (f: ReturnType<typeof fakeServices>, id: string, status: string, over: Record<string, unknown> = {}) =>
    (f.stripeSubs[id] = { id, status, customer: "cus_x", items: { data: [{ price: { id: "price_pro" }, current_period_end: 1_900_000_000 }] }, cancel_at: null, ...over });

  it("checks the signature", async () => {
    const body = JSON.stringify({ id: "evt_sig", type: "invoice.paid", data: { object: {} } });
    expect((await req("POST", "https://salonkit.online/api/stripe/webhook", body, { "stripe-signature": "t=1,v1=00" })).status).toBe(400);
    expect((await req("POST", "https://salonkit.online/api/stripe/webhook", body, { "stripe-signature": await sign(body, Math.floor(Date.now() / 1000) - 1000) })).status).toBe(400);
    expect((await req("POST", "https://salonkit.online/api/stripe/webhook", body, {}, { STRIPE_WEBHOOK_SECRET: undefined })).status).toBe(503);
    expect(await validStripeSignature(await sign("x", 100), "x", WH, 100)).toBe(true);
    expect(await validStripeSignature(await sign("x", 100, "other"), "x", WH, 100)).toBe(false);
  });

  async function payingSalon(slug: string, customer: string) {
    const { org } = await salon(slug);
    await env.DB.prepare("UPDATE subscriptions SET stripe_customer_id = ? WHERE org_id = ?").bind(customer, org.id).run();
    return org;
  }

  it("applies Stripe's live state: paid, failing, cancelled; each event once", async () => {
    const f = fakeServices();
    f.install();
    const org = await payingSalon("hook-life", "cus_life");
    live(f, "sub_1", "active", { customer: "cus_life" });
    const done = await hook("checkout.session.completed", { mode: "subscription", customer: "cus_life", subscription: "sub_1", metadata: { org_id: org.id, plan_id: "pro" } }, "evt_once");
    expect(done.status).toBe(200);
    expect(await orgRow(org.id)).toMatchObject({ status: "active", plan_id: "pro", provider: "stripe", stripe_subscription_id: "sub_1", sub_status: "active" });

    // The same event again changes nothing.
    await env.DB.prepare("UPDATE orgs SET plan_id = 'pro_max' WHERE id = ?").bind(org.id).run();
    await hook("checkout.session.completed", { mode: "subscription", customer: "cus_life", subscription: "sub_1" }, "evt_once");
    expect((await orgRow(org.id)).plan_id).toBe("pro_max");

    live(f, "sub_1", "past_due", { customer: "cus_life" });
    // Newer API payloads put the subscription under parent.subscription_details.
    await hook("invoice.payment_failed", { customer: "cus_life", parent: { subscription_details: { subscription: "sub_1" } } });
    const due = await orgRow(org.id);
    expect(due.status).toBe("past_due");
    expect(due.grace_ends_at).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    live(f, "sub_1", "active", { customer: "cus_life" });
    await hook("invoice.paid", { customer: "cus_life", subscription: "sub_1" });
    expect((await orgRow(org.id)).status).toBe("active");

    live(f, "sub_1", "canceled", { customer: "cus_life" });
    await hook("customer.subscription.deleted", { id: "sub_1", customer: "cus_life", status: "canceled" });
    expect(await orgRow(org.id)).toMatchObject({ status: "expired", sub_status: "canceled" });

    const trail = await env.DB.prepare("SELECT who FROM platform_audit WHERE org_id = ?").bind(org.id).all<any>();
    expect(trail.results.every((t: any) => t.who === "stripe")).toBe(true);
  });

  it("a late, retried failure can't undo a payment (live state wins)", async () => {
    const f = fakeServices();
    f.install();
    const org = await payingSalon("hook-order", "cus_order");
    live(f, "sub_o", "active", { customer: "cus_order" });
    await hook("invoice.paid", { customer: "cus_order", subscription: "sub_o" });
    await hook("invoice.payment_failed", { customer: "cus_order", subscription: "sub_o" }); // arrives late
    expect((await orgRow(org.id)).status).toBe("active");
  });

  it("cancelling a second, stray subscription doesn't expire the salon", async () => {
    const f = fakeServices();
    f.install();
    const org = await payingSalon("hook-two", "cus_two");
    live(f, "sub_a", "active", { customer: "cus_two" });
    await hook("customer.subscription.created", { id: "sub_a", customer: "cus_two" });
    live(f, "sub_b", "canceled", { customer: "cus_two" });
    await hook("customer.subscription.deleted", { id: "sub_b", customer: "cus_two" });
    expect(await orgRow(org.id)).toMatchObject({ status: "active", stripe_subscription_id: "sub_a" });
  });

  it("a salon paid by hand isn't expired by its old card subscription ending", async () => {
    const f = fakeServices();
    f.install();
    const org = await payingSalon("hook-manual", "cus_man");
    live(f, "sub_m", "active", { customer: "cus_man" });
    await hook("customer.subscription.created", { id: "sub_m", customer: "cus_man" });
    await env.DB.prepare("UPDATE subscriptions SET provider = 'manual' WHERE org_id = ?").bind(org.id).run();
    live(f, "sub_m", "canceled", { customer: "cus_man" });
    await hook("customer.subscription.deleted", { id: "sub_m", customer: "cus_man" });
    expect(await orgRow(org.id)).toMatchObject({ status: "active", provider: "manual" });
  });

  it("a paused subscription (trial ended without a card) expires the salon", async () => {
    const f = fakeServices();
    f.install();
    const org = await payingSalon("hook-pause", "cus_p");
    live(f, "sub_p", "active", { customer: "cus_p" });
    await hook("customer.subscription.created", { id: "sub_p", customer: "cus_p" });
    live(f, "sub_p", "paused", { customer: "cus_p" });
    await hook("customer.subscription.updated", { id: "sub_p", customer: "cus_p" });
    expect((await orgRow(org.id)).status).toBe("expired");
  });

  it("never reactivates a salon the super admin deactivated", async () => {
    const f = fakeServices();
    f.install();
    const org = await payingSalon("hook-deact", "cus_deact");
    await env.DB.prepare("UPDATE orgs SET status = 'deactivated' WHERE id = ?").bind(org.id).run();
    live(f, "sub_d", "active", { customer: "cus_deact" });
    await hook("invoice.paid", { customer: "cus_deact", subscription: "sub_d" });
    expect((await orgRow(org.id)).status).toBe("deactivated");
  });

  it("metadata alone can't pick the org (only our own checkout sessions)", async () => {
    const f = fakeServices();
    f.install();
    const { org } = await salon("hook-meta", "expired");
    live(f, "sub_evil", "active", { customer: "cus_stranger" });
    await hook("invoice.paid", { customer: "cus_stranger", subscription: "sub_evil", metadata: { org_id: org.id } });
    await hook("checkout.session.completed", { mode: "subscription", customer: "cus_stranger", subscription: "sub_evil", client_reference_id: org.id, metadata: { org_id: org.id } });
    expect((await orgRow(org.id)).status).toBe("expired");
  });

  it("unknown customers, subscriptions and events are acknowledged", async () => {
    fakeServices().install();
    expect((await hook("invoice.paid", { customer: "cus_nobody", subscription: "sub_x" })).status).toBe(200);
    expect((await hook("charge.refunded", { customer: "cus_nobody" })).status).toBe(200);
  });

  it("maps Stripe statuses", () => {
    expect(stateOf("trialing")).toBe("paid");
    expect(stateOf("unpaid")).toBe("failing");
    expect(stateOf("incomplete_expired")).toBe("ended");
    expect(stateOf("paused")).toBe("ended");
    expect(stateOf("incomplete")).toBeNull();
  });
});
