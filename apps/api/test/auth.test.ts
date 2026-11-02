import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { sign } from "../src/core/crypto";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const ROOT = "salonstation.online";

function call(url: string, init: RequestInit = {}, root = "") {
  return app.fetch(new Request(url, init), { ...env, ROOT_DOMAIN: root }, ctx);
}
const post = (url: string, body: unknown, root = "") =>
  call(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, root);
const whoami = (cookie: string, host = "x.test", root = "", headers: Record<string, string> = {}, qs = "") =>
  call(`https://${host}/api/_whoami${qs}`, { headers: { cookie, ...headers } }, root);

const GENERIC = { error: "Wrong salon ID, username or password" };

describe("auth", () => {
  it("login by Salon ID on workers.dev, then whoami works", async () => {
    const o = await makeOrg({ slug: "login-ok" });
    const u = await makeUser(o.id, { username: "sam" });
    const r = await post("https://x.test/api/auth/login", { org: "login-ok", username: "sam", password: "pass1234" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, slug: "login-ok" });
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toMatch(/ss_session=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\//);
    const w = await whoami(sc.split(";")[0]);
    expect(w.status).toBe(200);
    expect(await w.json()).toEqual({ orgId: o.id, uid: u.id });
  });

  it("same username in two orgs logs into the right one", async () => {
    const a = await makeOrg({ slug: "same-a" });
    const b = await makeOrg({ slug: "same-b" });
    await makeUser(a.id, { username: "sam", password: "pw1pw1pw1" });
    await makeUser(b.id, { username: "sam", password: "pw2pw2pw2" });
    expect((await post("https://x.test/api/auth/login", { org: "same-a", username: "sam", password: "pw2pw2pw2" })).status).toBe(401);
    expect((await post("https://x.test/api/auth/login", { org: "same-b", username: "sam", password: "pw1pw1pw1" })).status).toBe(401);
    const ca = await loginAs("same-a", "sam", "pw1pw1pw1");
    const cb = await loginAs("same-b", "sam", "pw2pw2pw2");
    expect((await (await whoami(ca)).json() as any).orgId).toBe(a.id);
    expect((await (await whoami(cb)).json() as any).orgId).toBe(b.id);
  });

  it("wrong org or password gives the same 401 message", async () => {
    const o = await makeOrg({ slug: "same-msg" });
    await makeUser(o.id, { username: "sam" });
    for (const body of [
      { org: "nope-org", username: "sam", password: "pass1234" },
      { org: "same-msg", username: "sam", password: "bad" },
      { org: "same-msg", username: "ghost", password: "pass1234" },
      { username: "sam", password: "pass1234" },
      { org: "same-msg", username: 5, password: {} },
    ]) {
      const r = await post("https://x.test/api/auth/login", body);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual(GENERIC);
    }
    const bad = await call("https://x.test/api/auth/login", { method: "POST", body: "{not json" });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual(GENERIC);
  });

  it("host slug wins over body.org; admin host cannot log in", async () => {
    const a = await makeOrg({ slug: "hostwin-a" });
    const b = await makeOrg({ slug: "hostwin-b" });
    await makeUser(a.id, { username: "sam", password: "pwApwApwA" });
    await makeUser(b.id, { username: "sam", password: "pwBpwBpwB" });
    // host is a, body says b with b's password: must fail
    expect((await post(`https://hostwin-a.${ROOT}/api/auth/login`, { org: "hostwin-b", username: "sam", password: "pwBpwBpwB" }, ROOT)).status).toBe(401);
    // host a, body says b, a's password: logs into a
    const r = await post(`https://hostwin-a.${ROOT}/api/auth/login`, { org: "hostwin-b", username: "sam", password: "pwApwApwA" }, ROOT);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, slug: "hostwin-a" });
    const adm = await post(`https://admin.${ROOT}/api/auth/login`, { org: "hostwin-a", username: "sam", password: "pwApwApwA" }, ROOT);
    expect(adm.status).toBe(401);
    expect(await adm.json()).toEqual(GENERIC);
  });

  it("RF3: org-A session with ?org=bravo and X-Org: bravo still acts as alpha", async () => {
    const al = await makeOrg({ slug: "alpha" });
    await makeOrg({ slug: "bravo" });
    await makeUser(al.id, { username: "sam" });
    const c = await loginAs("alpha", "sam");
    const w = await whoami(c, "x.test", "", { "X-Org": "bravo", "X-Org-Id": "bravo" }, "?org=bravo&orgId=bravo");
    expect(w.status).toBe(200);
    expect((await w.json() as any).orgId).toBe(al.id);
  });

  it("org-A cookie on bravo.<root> host gives 401 wrong_org", async () => {
    const a = await makeOrg({ slug: "wo-a" });
    const b = await makeOrg({ slug: "wo-b" });
    await makeUser(a.id, { username: "sam" });
    await makeUser(b.id, { username: "sam" });
    const c = await loginAs("wo-a", "sam");
    const bad = await whoami(c, `wo-b.${ROOT}`, ROOT);
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: "Please sign in", code: "wrong_org" });
    const unknown = await whoami(c, `ghost.${ROOT}`, ROOT);
    expect(unknown.status).toBe(401);
    const ok = await whoami(c, `wo-a.${ROOT}`, ROOT);
    expect(ok.status).toBe(200);
    // a session is not valid on the admin host either
    expect((await whoami(c, `admin.${ROOT}`, ROOT)).status).toBe(401);
  });

  it("RF4: org deactivated after login gives 401 on the next request", async () => {
    const o = await makeOrg({ slug: "rf4" });
    await makeUser(o.id, { username: "sam" });
    const c = await loginAs("rf4", "sam");
    expect((await whoami(c)).status).toBe(200);
    await env.DB.prepare("UPDATE orgs SET status='deactivated' WHERE id=?").bind(o.id).run();
    expect((await whoami(c)).status).toBe(401);
    await env.DB.prepare("UPDATE orgs SET status='deleted' WHERE id=?").bind(o.id).run();
    expect((await whoami(c)).status).toBe(401);
  });

  it("session_version bump and deactivated user log the user out", async () => {
    const o = await makeOrg({ slug: "sv" });
    const u = await makeUser(o.id, { username: "sam" });
    const u2 = await makeUser(o.id, { username: "kim" });
    const c = await loginAs("sv", "sam");
    const c2 = await loginAs("sv", "kim");
    expect((await whoami(c)).status).toBe(200);
    await env.DB.prepare("UPDATE users SET session_version = session_version + 1 WHERE id=?").bind(u.id).run();
    expect((await whoami(c)).status).toBe(401);
    await env.DB.prepare("UPDATE users SET active = 0 WHERE id=?").bind(u2.id).run();
    expect((await whoami(c2)).status).toBe(401);
  });

  it("deactivated or deleted org cannot log in", async () => {
    for (const status of ["deactivated", "deleted"] as const) {
      const o = await makeOrg({ slug: `dead-${status}`, status });
      await makeUser(o.id, { username: "sam" });
      const r = await post("https://x.test/api/auth/login", { org: o.slug, username: "sam", password: "pass1234" });
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual(GENERIC);
    }
  });

  it("missing, tampered, expired, or cross-org-forged cookies are 401", async () => {
    const a = await makeOrg({ slug: "forge-a" });
    const b = await makeOrg({ slug: "forge-b" });
    const ua = await makeUser(a.id, { username: "sam" });
    await makeUser(b.id, { username: "sam" });
    const c = await loginAs("forge-a", "sam");
    expect((await call("https://x.test/api/_whoami")).status).toBe(401);
    expect((await whoami("ss_session=garbage")).status).toBe(401);
    expect((await whoami(c.slice(0, -2) + "xx")).status).toBe(401);
    for (const bad of ["ss_session=x.a", "ss_session=x.!!", "ss_session=.", "ss_session=a.b.c"]) {
      const m = await whoami(bad);
      expect(m.status).toBe(401);
      expect(await m.json()).toEqual({ error: "Please sign in" });
    }
    const expired = await sign({ uid: ua.id, orgId: a.id, v: 0, exp: Date.now() - 1000 }, env.SESSION_SECRET);
    expect((await whoami(`ss_session=${expired}`)).status).toBe(401);
    // validly signed, but uid belongs to org A while orgId says B: must not resolve
    const forged = await sign({ uid: ua.id, orgId: b.id, v: 0, exp: Date.now() + 60000 }, env.SESSION_SECRET);
    expect((await whoami(`ss_session=${forged}`)).status).toBe(401);
    const badShape = await sign({ uid: "1", orgId: a.id, v: 0, exp: Date.now() + 60000 }, env.SESSION_SECRET);
    expect((await whoami(`ss_session=${badShape}`)).status).toBe(401);
  });

  it("logout clears the cookie", async () => {
    const r = await call("https://x.test/api/auth/logout", { method: "POST" });
    expect(r.status).toBe(200);
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toMatch(/ss_session=;/);
    expect(sc).toMatch(/Max-Age=0/i);
    expect(sc).toMatch(/Path=\//);
  });

  it("tenant-host login without body.org works (production path)", async () => {
    const o = await makeOrg({ slug: "noorg" });
    await makeUser(o.id, { username: "sam" });
    const r = await post(`https://noorg.${ROOT}/api/auth/login`, { username: "sam", password: "pass1234" }, ROOT);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, slug: "noorg" });
  });

  it("fail-closed: every registered /api route except health and auth requires a session", async () => {
    const guarded = app.routes.filter(
      (r) => r.method !== "ALL" && r.path.startsWith("/api") && r.path !== "/api/health" && !r.path.startsWith("/api/auth"),
    );
    expect(guarded.map((r) => r.path)).toContain("/api/_whoami");
    for (const r of guarded) {
      const res = await call(`https://x.test${r.path.replace(/:\w+/g, "1")}`, { method: r.method });
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it("unknown /api paths stay JSON 404 when unauthenticated, health stays public", async () => {
    const r = await call("https://x.test/api/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Not found" });
    expect((await call("https://x.test/api/health")).status).toBe(200);
  });

  it("_whoami is 404 outside the test environment", async () => {
    const o = await makeOrg({ slug: "prodprobe" });
    await makeUser(o.id, { username: "sam" });
    const cookie = await loginAs("prodprobe", "sam");
    const r = await app.fetch(new Request("https://x.test/api/_whoami", { headers: { cookie } }), { ...env, ENVIRONMENT: "production" }, ctx);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Not found" });
  });
});
