import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const call = (path: string, method: string, cookie?: string) =>
  app.fetch(
    new Request(`https://x.test${path}`, { method, headers: cookie ? { cookie } : {} }),
    { ...env, ROOT_DOMAIN: "" },
    ctx,
  );

async function setup(slug: string, opts: { plan?: "free" | "pro" | "pro_max"; status?: any } = {}) {
  const org = await makeOrg({ slug, ...opts });
  await makeUser(org.id, { username: "sam" });
  // log in while active (login is blocked for some statuses), then apply the status
  const cookie = await loginAs(slug, "sam");
  if (opts.status) await env.DB.prepare("UPDATE orgs SET status=? WHERE id=?").bind(opts.status, org.id).run();
  return { org, cookie };
}

describe("requireFeature", () => {
  it("free org -> 403 feature_disabled on ledger", async () => {
    const { cookie } = await setup("pl-free", { plan: "free" });
    const r = await call("/api/_probe/ledger", "GET", cookie);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "This feature isn't in your plan", code: "feature_disabled" });
  });
  it("pro_max org -> 200 on ledger", async () => {
    const { cookie } = await setup("pl-max", { plan: "pro_max" });
    expect((await call("/api/_probe/ledger", "GET", cookie)).status).toBe(200);
  });
  it("unauthenticated probe -> 401", async () => {
    expect((await call("/api/_probe/ledger", "GET")).status).toBe(401);
    expect((await call("/api/_probe/write", "POST")).status).toBe(401);
  });
});

describe("writeGuard", () => {
  it.each(["trial", "active", "grace", "past_due"])("%s can write", async (status) => {
    const { cookie } = await setup(`pw-${status.replace("_", "")}`, { status });
    expect((await call("/api/_probe/write", "POST", cookie)).status).toBe(200);
  });
  it.each(["expired"])("%s org write -> 402 subscription_inactive", async (status) => {
    const { cookie } = await setup("pw-exp", { status });
    const r = await call("/api/_probe/write", "POST", cookie);
    expect(r.status).toBe(402);
    expect(await r.json()).toEqual({
      error: "Your subscription is inactive. Upgrade to continue.",
      code: "subscription_inactive",
    });
  });
  it("expired org can still read, GET /api/me and POST /api/auth/logout", async () => {
    const { cookie } = await setup("pw-exp2", { status: "expired" });
    expect((await call("/api/me", "GET", cookie)).status).toBe(200);
    expect((await call("/api/_probe/ledger", "GET", cookie)).status).not.toBe(402);
    expect((await call("/api/auth/logout", "POST", cookie)).status).toBe(200);
  });
  it("unknown path for expired org stays 404 for GET", async () => {
    const { cookie } = await setup("pw-exp3", { status: "expired" });
    expect((await call("/api/nope", "GET", cookie)).status).toBe(404);
  });
});
