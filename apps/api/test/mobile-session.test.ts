import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { hashToken } from "../src/core/mobile-session";
import { makeOrg, makeUser } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const ROOT = "salonkit.online";
const e = { ...env, ROOT_DOMAIN: ROOT };
const DAY = 86_400_000;
const FAIL = "Wrong salon ID, username or password";
const device = (id = "device-0001", platform = "ios") => ({ id, name: "Sam's iPhone", platform, app_version: "1.0.0" });

export const signIn = (slug: string, username: string, password = "pass1234", dev: unknown = device(), ip = "10.1.0.1") =>
  app.fetch(
    new Request(`https://${slug}.${ROOT}/api/mobile/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ username, password, device: dev }),
    }),
    e,
    ctx,
  );

const webLogin = (slug: string, username: string, password: string, ip: string) =>
  app.fetch(
    new Request(`https://${slug}.${ROOT}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ username, password }),
    }),
    e,
    ctx,
  );

const rows = (orgId: string) =>
  env.DB.prepare("SELECT user_id, device_id, token_hash, platform FROM mobile_sessions WHERE org_id = ?").bind(orgId).all<{ user_id: number; device_id: string; token_hash: string; platform: string }>();

describe("POST /api/mobile/session", () => {
  it("signs in and returns a skm_ token, no cookie", async () => {
    const org = await makeOrg({ slug: "mob-ok" });
    await makeUser(org.id, { username: "sam", role: "barber" });
    const at = Date.now();
    const r = await signIn("mob-ok", "sam");
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBeNull();
    const b = (await r.json()) as { token: string; expires_at: number };
    expect(b.token).toMatch(/^skm_[A-Za-z0-9_-]{40,}$/);
    expect(Math.abs(b.expires_at - (at + 30 * DAY))).toBeLessThan(60_000);
    const { results } = await rows(org.id);
    expect(results).toHaveLength(1);
    expect(results[0]!.token_hash).toBe(await hashToken(b.token));
    expect(results[0]!.token_hash).not.toContain(b.token);
    expect(results[0]!.platform).toBe("ios");
  });

  it("wrong password: same 401 text as web", async () => {
    const org = await makeOrg({ slug: "mob-bad" });
    await makeUser(org.id, { username: "sam" });
    const r = await signIn("mob-bad", "sam", "nope");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: FAIL });
    expect((await rows(org.id)).results).toHaveLength(0);
  });

  it("shares the web lockout", async () => {
    const org = await makeOrg({ slug: "mob-lock" });
    await makeUser(org.id, { username: "sam", password: "rightpass" });
    for (let i = 0; i < 8; i++) expect((await webLogin("mob-lock", "sam", "nope", "10.2.0.1")).status).toBe(401);
    const r = await signIn("mob-lock", "sam", "rightpass", device(), "10.2.0.1");
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "Too many attempts. Try again in a few minutes." });
  });

  it("bad device → 400", async () => {
    const org = await makeOrg({ slug: "mob-dev" });
    await makeUser(org.id, { username: "sam" });
    for (const d of [device("device-0001", "web"), null, device("short"), { ...device(), name: "  " }]) {
      const r = await signIn("mob-dev", "sam", "pass1234", d);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "Update the app and try again" });
    }
  });

  it("same device signs in again: one row", async () => {
    const org = await makeOrg({ slug: "mob-again" });
    await makeUser(org.id, { username: "sam" });
    const t1 = ((await (await signIn("mob-again", "sam")).json()) as { token: string }).token;
    const t2 = ((await (await signIn("mob-again", "sam")).json()) as { token: string }).token;
    expect(t1).not.toBe(t2);
    const { results } = await rows(org.id);
    expect(results).toHaveLength(1);
    expect(results[0]!.token_hash).toBe(await hashToken(t2));
  });

  it("another user on the same device replaces the first", async () => {
    const org = await makeOrg({ slug: "mob-swap" });
    await makeUser(org.id, { username: "sam" });
    const ali = await makeUser(org.id, { username: "ali", role: "barber" });
    await signIn("mob-swap", "sam");
    await signIn("mob-swap", "ali");
    const { results } = await rows(org.id);
    expect(results.map((x) => x.user_id)).toEqual([ali.id]);
  });

  it("deactivated salon → 401", async () => {
    const org = await makeOrg({ slug: "mob-off", status: "deactivated" });
    await makeUser(org.id, { username: "sam" });
    const r = await signIn("mob-off", "sam");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: FAIL });
  });
});
