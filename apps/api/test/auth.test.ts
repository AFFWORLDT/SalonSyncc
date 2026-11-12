import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { app } from "../src/index";
import { sign } from "../src/core/crypto";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const ROOT = "salonkit.online";

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

  it("fail-closed: every registered /api route except health, auth, public and the guard requires a session", async () => {
    const api = app.routes.filter((r) => r.path.startsWith("/api"));
    const guard = api.find((r) => r.method === "ALL" && r.path === "/api/*")!.handler;
    // Session-free routes, listed by exact "METHOD path" (never by prefix): a tenant route placed under /api/public/ or
    // /api/wa/ is not in this list, so it is checked below and must answer 401.
    const OPEN = new Set([
      "GET /api/public/_probe",
      "GET /api/public/_probe/pdf",
      "GET /api/public/receipt/:token",
      "GET /api/public/bill/:token",
      "GET /api/public/feedback/:token",
      "POST /api/public/feedback/:token",
      "GET /api/public/review/:token",
      "GET /api/public/avatar/:id/:v",
      "GET /api/public/banner/:id/:v",
      "GET /api/public/services",
      "POST /api/public/newsletter",
      "GET /api/public/newsletter/confirm",
      "GET /api/public/newsletter/unsubscribe",
      "POST /api/public/newsletter/unsubscribe",
      "OPTIONS /api/public/services",
      // Online bookings from the salon's website (feature online_bookings): config, free times, book, view/cancel by link.
      "OPTIONS /api/public/booking/*",
      "GET /api/public/booking/config",
      "GET /api/public/booking/slots",
      "POST /api/public/booking",
      "GET /api/public/booking/b/:token",
      "POST /api/public/booking/b/:token/cancel",
      "GET /api/public/logo/:v",
      "GET /api/public/brand",
      "GET /api/public/app-config",
      "POST /api/mobile/session",
      "GET /api/public/slug",
      "POST /api/public/signup",
      // Website "Continue with Google": the Firebase web settings (no secrets).
      "GET /api/public/auth-config",
      "GET /api/wa/webhook",
      "POST /api/wa/webhook",
      // The super admin panel signs out without a session (it only clears its cookie); its other routes need ss_platform.
      "POST /api/platform/logout",
      // Stripe's webhook: signature-checked, no session.
      "POST /api/stripe/webhook",
    ]);
    const key = (r: (typeof api)[number]) => `${r.method} ${r.path}`;
    const registered = new Set(api.map(key));
    for (const k of OPEN) expect(registered.has(k), `${k} is no longer registered; update the list`).toBe(true);
    const guarded = api.filter((r) => r.handler !== guard && r.path !== "/api/health" && !r.path.startsWith("/api/auth/") && !OPEN.has(key(r)));
    expect(guarded.map((r) => r.path)).toContain("/api/_whoami");
    expect(guarded.some((r) => r.path.startsWith("/api/public"))).toBe(false);
    for (const r of guarded) {
      const path = r.path.replace(/:\w+/g, "1").replace(/\*/g, "x");
      const method = r.method === "ALL" ? "GET" : r.method;
      const res = await call(`https://x.test${path}`, { method });
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it("an unknown /api/public path is a JSON 404, not a 401", async () => {
    const res = await call("https://x.test/api/public/nope");
    expect(res.status).toBe(404);
  });

  it("an ALL-method tenant route added without auth is still guarded", async () => {
    const { Hono } = await import("hono");
    const { tenantGuard } = await import("../src/index");
    const t = new Hono<any>();
    t.use("*", tenantGuard);
    t.all("/open", (c) => c.json({ leaked: true }));
    const a = new Hono<any>();
    a.route("/api", t);
    a.onError((err, c) => c.json({ error: err.message }, (err as any).status ?? 500));
    a.notFound((c) => c.json({ error: "Not found" }, 404));
    const res = await a.fetch(new Request("https://x.test/api/open", { method: "POST" }), env, ctx);
    expect(res.status).toBe(401);
    expect((await a.fetch(new Request("https://x.test/api/none"), env, ctx)).status).toBe(404);
  });

  it("module-level r.use('*', requireFeature) behind the tenant guard: 401 / 403 / 200", async () => {
    const { Hono } = await import("hono");
    const { tenantGuard } = await import("../src/index");
    const { requireFeature } = await import("../src/core/pipeline");
    const r = new Hono<any>();
    r.use("*", requireFeature("ledger"));
    r.get("/x", (c) => c.json({ ok: true }));
    const t = new Hono<any>();
    t.use("*", tenantGuard);
    t.route("/m", r);
    const a = new Hono<any>();
    a.route("/api", t);
    a.onError((err, c) => c.json({ error: err.message, code: (err as any).code }, (err as any).status ?? 500));
    const hit = (cookie?: string) =>
      a.fetch(new Request("https://x.test/api/m/x", { headers: cookie ? { cookie } : {} }), { ...env, ROOT_DOMAIN: "" }, ctx);
    expect((await hit()).status).toBe(401);
    const free = await makeOrg({ slug: "mod-free", plan: "free" });
    await makeUser(free.id, { username: "sam" });
    const r403 = await hit(await loginAs("mod-free", "sam"));
    expect(r403.status).toBe(403);
    expect((await r403.json() as any).code).toBe("feature_disabled");
    const pm = await makeOrg({ slug: "mod-pm", plan: "pro_max" });
    await makeUser(pm.id, { username: "sam" });
    expect((await hit(await loginAs("mod-pm", "sam"))).status).toBe(200);
  });

  describe("cross-site write protection", () => {
    const writeProbe = (cookie: string, headers: Record<string, string>, method = "POST") =>
      call("https://x.test/api/_probe/write", { method, headers: { cookie, ...headers } });
    const BAD = { error: "Cross-site request blocked", code: "bad_origin" };

    it("blocks foreign / null Origin and non-same-origin Sec-Fetch-Site on writes", async () => {
      const o = await makeOrg({ slug: "csrf-a" });
      await makeUser(o.id, { username: "sam" });
      const cookie = await loginAs("csrf-a", "sam");
      const r = await writeProbe(cookie, { origin: "https://evil.salonkit.online" });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual(BAD);
      expect((await writeProbe(cookie, { origin: "null" })).status).toBe(403);
      expect((await writeProbe(cookie, { "sec-fetch-site": "same-site" })).status).toBe(403);
      expect((await writeProbe(cookie, { "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect((await writeProbe(cookie, { origin: "https://evil.test" }, "post")).status).toBe(403);
    });

    it("allows same-host Origin, Sec-Fetch-Site same-origin/none, and no headers", async () => {
      const o = await makeOrg({ slug: "csrf-b" });
      await makeUser(o.id, { username: "sam" });
      const cookie = await loginAs("csrf-b", "sam");
      expect((await writeProbe(cookie, { origin: "https://x.test" })).status).toBe(200);
      expect((await writeProbe(cookie, { "sec-fetch-site": "same-origin" })).status).toBe(200);
      expect((await writeProbe(cookie, { "sec-fetch-site": "none" })).status).toBe(200);
      expect((await writeProbe(cookie, {})).status).toBe(200);
    });

    it("does not block reads with a foreign Origin", async () => {
      const o = await makeOrg({ slug: "csrf-c" });
      await makeUser(o.id, { username: "sam" });
      const cookie = await loginAs("csrf-c", "sam");
      expect((await whoami(cookie, "x.test", "", { origin: "https://evil.test" })).status).toBe(200);
    });

    it("login and logout reject a foreign Origin", async () => {
      const o = await makeOrg({ slug: "csrf-d" });
      await makeUser(o.id, { username: "sam" });
      const res = await call("https://x.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.test" },
        body: JSON.stringify({ org: "csrf-d", username: "sam", password: "pass1234" }),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(BAD);
      expect(res.headers.get("set-cookie")).toBeNull();
      const out = await call("https://x.test/api/auth/logout", { method: "POST", headers: { origin: "https://evil.test" } });
      expect(out.status).toBe(403);
    });
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
