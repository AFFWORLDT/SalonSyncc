import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { PLAN_DEFAULTS } from "@ss/features";
import app from "../src/index";
import { featuresFor, invalidateFeatures } from "../src/core/features-cache";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const me = (cookie: string) =>
  app.fetch(new Request("https://x.test/api/me", { headers: { cookie } }), { ...env, ROOT_DOMAIN: "" }, ctx);

async function setup(slug: string, opts: { plan?: "free" | "pro" | "pro_max"; status?: any } = {}) {
  const org = await makeOrg({ slug, ...opts });
  await makeUser(org.id, { username: "sam" });
  return { org, cookie: await loginAs(slug, "sam") };
}

describe("/api/me", () => {
  it("rejects unauthenticated", async () => {
    const r = await app.fetch(new Request("https://x.test/api/me"), { ...env, ROOT_DOMAIN: "" }, ctx);
    expect(r.status).toBe(401);
  });

  it("free org gets free features", async () => {
    const { cookie, org } = await setup("me-free");
    const r = await me(cookie);
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect([...b.features].sort()).toEqual([...PLAN_DEFAULTS.free.features].sort());
    expect(b.limits).toEqual(PLAN_DEFAULTS.free.limits);
    expect(b.org).toMatchObject({ id: org.id, slug: "me-free", status: "active", planId: "free" });
    expect(b.user).toMatchObject({ username: "sam", role: "owner" });
    expect(b.settings).toMatchObject({ display_name: "me-free", currency: "AED", locale: "en-AE", timezone: "Asia/Dubai", logo_url: null, brand_color: null });
    expect(typeof b.today).toBe("string");
    expect(b.subscription).toEqual({ status: "active", planId: "free", trialEndsAt: null, graceEndsAt: null });
  });

  it("settings.wa_ready: false without a WhatsApp row, true with feature + row; never exposes the token", async () => {
    const { cookie, org } = await setup("me-wa", { plan: "pro_max" });
    const b0: any = await (await me(cookie)).json();
    expect(b0.settings.wa_ready).toBe(false);
    await env.DB.prepare("INSERT INTO org_whatsapp(org_id, phone_number_id, waba_id, token_enc, updated_at) VALUES(?,?,?,?,?)")
      .bind(org.id, "pn-me-wa", "waba-1", "v1.SECRETIV.SECRETCT", 1).run();
    const r = await me(cookie);
    const text = await r.text();
    const b1 = JSON.parse(text);
    expect(b1.settings.wa_ready).toBe(true);
    expect(text).not.toContain("token");
    expect(text).not.toContain("token_enc");
    expect(text).not.toContain("SECRET");
  });

  it("trial org gets pro_max minus whatsapp", async () => {
    const { cookie } = await setup("me-trial", { status: "trial" });
    const b: any = await (await me(cookie)).json();
    expect(b.features).toContain("ledger");
    expect(b.features).not.toContain("whatsapp");
    expect(b.features).not.toContain("whatsapp_campaigns");
    expect(b.limits).toEqual(PLAN_DEFAULTS.pro_max.limits);
  });

  it("override enables ledger on a free org", async () => {
    const org = await makeOrg({ slug: "me-ovr" });
    await makeUser(org.id, { username: "sam" });
    await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,1,?)").bind(org.id, "ledger", Date.now()).run();
    const cookie = await loginAs("me-ovr", "sam");
    const b: any = await (await me(cookie)).json();
    expect(b.features).toContain("ledger");
  });

  it("features cache is stale until invalidated", async () => {
    const org = await makeOrg({ slug: "me-cache" });
    const first = await featuresFor(env.DB, org);
    expect(first.features).not.toContain("ledger");
    await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,1,?)").bind(org.id, "ledger", Date.now()).run();
    expect((await featuresFor(env.DB, org)).features).not.toContain("ledger");
    invalidateFeatures(org.id);
    expect((await featuresFor(env.DB, org)).features).toContain("ledger");
  });

  it("features cache is a miss when org status or plan changed", async () => {
    const org = await makeOrg({ slug: "me-fresh", plan: "pro_max", status: "trial" });
    const trial = await featuresFor(env.DB, org);
    expect(trial.features).not.toContain("whatsapp");
    const now = await featuresFor(env.DB, { ...org, status: "active", planId: "free" });
    expect(now.features).not.toContain("ledger");
    expect(now.features).toEqual(["core_sales", ...now.features.filter((f) => f !== "core_sales")]);
    expect(now.limits).toEqual({ max_staff: 2 });
    const upgraded = await featuresFor(env.DB, { ...org, status: "active", planId: "pro_max" });
    expect(upgraded.features).toContain("whatsapp");
  });

  it("cached features and limits are frozen", async () => {
    const org = await makeOrg({ slug: "me-frozen" });
    const v = await featuresFor(env.DB, org);
    expect(Object.isFrozen(v.features)).toBe(true);
    expect(Object.isFrozen(v.limits)).toBe(true);
  });

  it("me never leaks password_hash", async () => {
    const { cookie } = await setup("me-leak");
    const text = await (await me(cookie)).text();
    expect(text).not.toContain("pbkdf2");
    expect(text).not.toContain("password");
  });

  it("brand comes from env", async () => {
    const { cookie } = await setup("me-brand");
    const b: any = await (await me(cookie)).json();
    expect(b.brand.name).toBe("SalonKit");
  });
});

describe("/api/me user fields for the dashboard", () => {
  it("returns commission_pct, avatar_url and can_add_expense", async () => {
    const org = await makeOrg({ slug: "me-user" });
    const b = await makeUser(org.id, { username: "barb", role: "barber" });
    await env.DB.prepare("UPDATE users SET commission_pct = 35, can_add_expense = 1, avatar = x'00', avatar_type = 'image/png', avatar_v = 2 WHERE id = ?").bind(b.id).run();
    const body: any = await (await me(await loginAs("me-user", "barb"))).json();
    expect(body.user).toEqual({ id: b.id, name: expect.any(String), username: "barb", role: "barber", commission_pct: 35, avatar_url: `/api/public/avatar/${b.id}/2?org=me-user`, can_add_expense: true });
    await makeUser(org.id, { username: "boss", role: "owner" });
    const o: any = await (await me(await loginAs("me-user", "boss"))).json();
    expect(o.user).toMatchObject({ role: "owner", commission_pct: null, avatar_url: null, can_add_expense: false });
  });
});
