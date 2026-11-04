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

const call = (url: string, init: RequestInit = {}) => app.fetch(new Request(url, init), e, ctx);
async function phone(slug: string, username: string, role: "owner" | "barber" = "barber", dev = device()) {
  const org = await makeOrg({ slug });
  const user = await makeUser(org.id, { username, role });
  const { token } = (await (await signIn(slug, username, "pass1234", dev)).json()) as { token: string };
  return { org, user, token, auth: { authorization: `Bearer ${token}` } };
}

describe("phone tokens on tenant routes", () => {
  it("bearer reaches /api/me", async () => {
    const p = await phone("tok-me", "sam");
    const r = await call(`https://tok-me.${ROOT}/api/me`, { headers: p.auth });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { user: { username: string } }).user.username).toBe("sam");
  });

  it("token for org A on host B → 401 wrong_org", async () => {
    const p = await phone("tok-a", "sam");
    await makeOrg({ slug: "tok-b" });
    const r = await call(`https://tok-b.${ROOT}/api/me`, { headers: p.auth });
    expect(r.status).toBe(401);
    expect(((await r.json()) as { code?: string }).code).toBe("wrong_org");
  });

  it("revoked by session_version", async () => {
    const p = await phone("tok-pw", "sam");
    const { token: t2 } = (await (await signIn("tok-pw", "sam", "pass1234", device("device-0002"))).json()) as { token: string };
    const other = { authorization: `Bearer ${t2}` };
    const r = await call(`https://tok-pw.${ROOT}/api/me/password`, {
      method: "PUT",
      headers: { ...p.auth, "content-type": "application/json" },
      body: JSON.stringify({ current: "pass1234", next: "newpass99" }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBeNull();
    // The phone that changed it stays signed in; the user's other phone is signed out.
    expect((await call(`https://tok-pw.${ROOT}/api/me`, { headers: p.auth })).status).toBe(200);
    expect((await call(`https://tok-pw.${ROOT}/api/me`, { headers: other })).status).toBe(401);
  });

  it("deactivated user → 401", async () => {
    const p = await phone("tok-off", "sam");
    await env.DB.prepare("UPDATE users SET active = 0 WHERE id = ?").bind(p.user.id).run();
    expect((await call(`https://tok-off.${ROOT}/api/me`, { headers: p.auth })).status).toBe(401);
  });

  it("cookie + bearer → 401 mixed_auth", async () => {
    const p = await phone("tok-mix", "sam");
    const r = await call(`https://tok-mix.${ROOT}/api/me`, { headers: { ...p.auth, cookie: "ss_session=x" } });
    expect(r.status).toBe(401);
    expect(((await r.json()) as { code?: string }).code).toBe("mixed_auth");
  });

  it("expired → 401", async () => {
    const p = await phone("tok-exp", "sam");
    await env.DB.prepare("UPDATE mobile_sessions SET expires_at = ? WHERE user_id = ?").bind(Date.now() - 1, p.user.id).run();
    expect((await call(`https://tok-exp.${ROOT}/api/me`, { headers: p.auth })).status).toBe(401);
  });

  it("sliding touch at most hourly", async () => {
    const p = await phone("tok-slide", "sam");
    const row = () => env.DB.prepare("SELECT last_used_at, expires_at FROM mobile_sessions WHERE user_id = ?").bind(p.user.id).first<{ last_used_at: number; expires_at: number }>();
    const back = Date.now() - 10 * 60_000;
    await env.DB.prepare("UPDATE mobile_sessions SET last_used_at = ?, expires_at = ? WHERE user_id = ?").bind(back, back + 30 * DAY, p.user.id).run();
    await call(`https://tok-slide.${ROOT}/api/me`, { headers: p.auth });
    expect((await row())!.last_used_at).toBe(back);
    const old = Date.now() - 61 * 60_000;
    await env.DB.prepare("UPDATE mobile_sessions SET last_used_at = ?, expires_at = ? WHERE user_id = ?").bind(old, old + 30 * DAY, p.user.id).run();
    await call(`https://tok-slide.${ROOT}/api/me`, { headers: p.auth });
    const r = (await row())!;
    expect(r.last_used_at).toBeGreaterThan(old);
    expect(r.expires_at).toBeGreaterThan(old + 30 * DAY);
  });

  it("DELETE /api/mobile/session then /api/me → 401", async () => {
    const p = await phone("tok-out", "sam");
    expect((await call(`https://tok-out.${ROOT}/api/mobile/session`, { method: "DELETE", headers: p.auth })).status).toBe(200);
    expect((await call(`https://tok-out.${ROOT}/api/me`, { headers: p.auth })).status).toBe(401);
  });

  it("admin lists and signs out a barber's phone; barber 403; other org's session 404", async () => {
    const owner = await phone("tok-adm", "boss", "owner", device("device-boss1"));
    const barber = await makeUser(owner.org.id, { username: "ali", role: "barber" });
    const { token } = (await (await signIn("tok-adm", "ali", "pass1234", device("device-ali01"))).json()) as { token: string };
    const list = await call(`https://tok-adm.${ROOT}/api/users/${barber.id}/devices`, { headers: owner.auth });
    expect(list.status).toBe(200);
    const devices = (await list.json()) as { id: string; device_name: string; platform: string }[];
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ device_name: "Sam's iPhone", platform: "ios" });
    expect((await call(`https://tok-adm.${ROOT}/api/users/${barber.id}/devices`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(403);
    const other = await phone("tok-other", "zed");
    const otherId = (await env.DB.prepare("SELECT id FROM mobile_sessions WHERE user_id = ? AND org_id = ?").bind(other.user.id, other.org.id).first<{ id: string }>())!.id;
    expect((await call(`https://tok-adm.${ROOT}/api/users/${barber.id}/devices/${otherId}`, { method: "DELETE", headers: owner.auth })).status).toBe(404);
    expect((await call(`https://tok-adm.${ROOT}/api/users/${barber.id}/devices/${devices[0]!.id}`, { method: "DELETE", headers: owner.auth })).status).toBe(200);
    expect((await call(`https://tok-adm.${ROOT}/api/me`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });

  it("bearer POST without Origin passes originGuard", async () => {
    const p = await phone("tok-post", "sam");
    const r = await call(`https://tok-post.${ROOT}/api/_probe/write`, { method: "POST", headers: p.auth });
    expect(r.status).toBe(200);
  });
});
