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
    expect(Object.keys(b.settings).sort()).toEqual(
      ["brandColor", "currency", "displayName", "locale", "logoUrl", "timezone"],
    );
    expect(b.subscription).toEqual({ status: "active", planId: "free", trialEndsAt: null, graceEndsAt: null });
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

  it("me never leaks password_hash", async () => {
    const { cookie } = await setup("me-leak");
    const text = await (await me(cookie)).text();
    expect(text).not.toContain("pbkdf2");
    expect(text).not.toContain("password");
  });

  it("brand comes from env", async () => {
    const { cookie } = await setup("me-brand");
    const b: any = await (await me(cookie)).json();
    expect(b.brand.name).toBe("SalonStation");
  });
});
