import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { fakeServices } from "./fakes";
import { setServicesForTest } from "../src/core/services";
import { businessDay } from "../src/lib/clock";

const pending: Promise<unknown>[] = [];
const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
const flush = async () => { while (pending.length) await pending.shift(); };
const E = { ...env, ROOT_DOMAIN: "", FCM_SERVICE_ACCOUNT: "{\"fake\":true}" };
let ip = 0;
const raw = async (method: string, path: string, opts: { cookie?: string; body?: unknown } = {}): Promise<Response> => {
  const r = await app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      redirect: "manual",
      headers: { ...(opts.cookie ? { cookie: opts.cookie } : {}), "CF-Connecting-IP": `7.7.${Math.floor(ip / 250)}.${ip++ % 250}`, ...(opts.body !== undefined ? { "content-type": "application/json" } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    E,
    ctx,
  );
  await flush();
  return r;
};
const json = async (r: Response): Promise<any> => r.json();

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro") {
  const org = await makeOrg({ slug, plan });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const adm = await makeUser(org.id, { username: "adm", role: "admin" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const ck = await loginAs(slug, "own");
  const k1 = await loginAs(slug, "b1");
  const sale = async (name?: string) => {
    const r = await raw("POST", "/sales", { cookie: ck, body: { amount: 30, payment_mode: "cash", barber_id: b1.id, ...(name ? { customer_name: name } : {}) } });
    expect(r.status).toBe(201);
    return (await json(r)) as { id: number; token: string };
  };
  return { org, own, adm, b1, ck, k1, sale };
}
const notes = async (orgId: string) => (await env.DB.prepare("SELECT user_id, title FROM notifications WHERE org_id = ? AND path = '/ratings/' ORDER BY id").bind(orgId).all<any>()).results;
const setSettings = (orgId: string, sql: string, ...b: unknown[]) => env.DB.prepare(`UPDATE org_settings SET ${sql} WHERE org_id = ?`).bind(...b, orgId).run();

let f = fakeServices();
afterEach(() => setServicesForTest(null));
const install = () => { f = fakeServices(); f.install(); };

describe("public feedback", () => {
  it("GET returns the FeedbackPage; POST saves then updates (created_at kept)", async () => {
    install();
    const a = await setup("rt-a");
    await setSettings(a.org.id, "google_review_url = ?, instagram_url = ?", "https://g.page/a", "https://insta.test/a");
    const s = await a.sale("Ali Khan");
    const g = await raw("GET", `/public/feedback/${s.token}`);
    expect(g.status).toBe(200);
    expect(await json(g)).toMatchObject({ first_name: "Ali", barber_name: "b1", salon_name: "rt-a", google_review_url: "https://g.page/a", instagram_url: "https://insta.test/a", stars: null, comment: null });

    const p1 = await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 5, comment: "  great  " } });
    expect(p1.status).toBe(200);
    expect(await json(p1)).toMatchObject({ stars: 5, comment: "great" });
    const r1 = await env.DB.prepare("SELECT * FROM ratings WHERE org_id = ? AND sale_id = ?").bind(a.org.id, s.id).first<any>();
    expect(r1).toMatchObject({ stars: 5, barber_id: a.b1.id });
    await new Promise((r) => setTimeout(r, 5));
    const p2 = await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 4 } });
    expect(await json(p2)).toMatchObject({ stars: 4, comment: null });
    const rows = (await env.DB.prepare("SELECT * FROM ratings WHERE org_id = ?").bind(a.org.id).all<any>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0].created_at).toBe(r1.created_at);
    expect(rows[0].updated_at).toBeGreaterThan(r1.updated_at);
  });

  it("validates stars and caps the comment at 500", async () => {
    const a = await setup("rt-val");
    const s = await a.sale();
    for (const stars of [0, 6, 2.5, "x", null]) expect((await raw("POST", `/public/feedback/${s.token}`, { body: { stars } })).status).toBe(400);
    const r = await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 5, comment: "x".repeat(900) } });
    expect((await json(r)).comment).toHaveLength(500);
  });

  it("unknown token, deleted sale, deactivated org and org without ratings are all 404", async () => {
    const a = await setup("rt-404");
    const s = await a.sale();
    expect((await raw("GET", "/public/feedback/nope-nope-nope")).status).toBe(404);
    expect((await json(await raw("GET", "/public/feedback/nope-nope-nope")))).toEqual({ error: "Not found" });
    const free = await setup("rt-free", "free");
    const fs = await free.sale();
    for (const [m, p] of [["GET", `/public/feedback/${fs.token}`], ["POST", `/public/feedback/${fs.token}`], ["GET", `/public/review/${fs.token}`]] as const) {
      expect((await raw(m, p, { body: m === "POST" ? { stars: 5 } : undefined })).status, `${m} ${p}`).toBe(404);
    }
    await env.DB.prepare("UPDATE sales SET deleted_at = ? WHERE org_id = ? AND id = ?").bind(Date.now(), a.org.id, s.id).run();
    expect((await raw("GET", `/public/feedback/${s.token}`)).status).toBe(404);
    expect((await raw("GET", `/public/review/${s.token}`)).status).toBe(404);
    const off = await setup("rt-off");
    const os = await off.sale();
    await env.DB.prepare("UPDATE orgs SET status = 'deactivated' WHERE id = ?").bind(off.org.id).run();
    expect((await raw("GET", `/public/feedback/${os.token}`)).status).toBe(404);
  });

  it("low stars alert only this org's admins, only on first rating or a drop to <=3", async () => {
    install();
    const a = await setup("rt-lo-a");
    const b = await setup("rt-lo-b");
    const s = await a.sale("Sam");
    await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 5 } });
    expect(await notes(a.org.id)).toEqual([]);
    await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 2, comment: "slow" } }); // 5 -> 2: alert
    let n = await notes(a.org.id);
    expect(n.map((x) => x.user_id).sort()).toEqual([a.own.id, a.adm.id].sort());
    expect(n[0].title).toContain("Sam");
    await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 1 } }); // 2 -> 1: no spam
    expect(await notes(a.org.id)).toHaveLength(2);
    await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 4 } });
    await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 3 } }); // 4 -> 3: alert again
    expect(await notes(a.org.id)).toHaveLength(4);
    expect(await notes(b.org.id)).toEqual([]);
    // first-ever rating that is low alerts
    const s2 = await a.sale();
    await raw("POST", `/public/feedback/${s2.token}`, { body: { stars: 3 } });
    expect(await notes(a.org.id)).toHaveLength(6);
  });
});

describe("M8 / M2: lapsed orgs and the low-star alert", () => {
  it("POST /feedback for an expired, deactivated or deleted org is 404, writes nothing and sends no push", async () => {
    install();
    for (const status of ["expired", "deactivated", "deleted"]) {
      const a = await setup(`rt-lapsed-${status}`);
      await env.DB.prepare("INSERT INTO push_tokens (token, org_id, user_id, created_at, updated_at) VALUES (?, ?, ?, 1, 1)").bind(`t-${status}`, a.org.id, a.own.id).run();
      const s = await a.sale("Sam");
      await env.DB.prepare("UPDATE orgs SET status = ? WHERE id = ?").bind(status, a.org.id).run();
      const r = await raw("POST", `/public/feedback/${s.token}`, { body: { stars: 1, comment: "bad" } });
      expect(r.status, status).toBe(404);
      expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM ratings WHERE org_id = ?").bind(a.org.id).first<any>()).toEqual({ n: 0 });
      expect(await notes(a.org.id)).toEqual([]);
    }
    expect(f.pushes).toHaveLength(0);
  });

  it("the low-star alert runs in waitUntil: the customer's response does not wait for the push", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    install();
    const send = f.services.push.send;
    f.services.push.send = async (...a) => (await gate, send(...a));
    const a = await setup("rt-wait");
    await env.DB.prepare("INSERT INTO push_tokens (token, org_id, user_id, created_at, updated_at) VALUES ('t-wait', ?, ?, 1, 1)").bind(a.org.id, a.own.id).run();
    const s = await a.sale("Sam");
    const res = Promise.resolve(app.fetch(
      new Request(`https://x.test/api/public/feedback/${s.token}`, { method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": "7.9.9.9" }, body: JSON.stringify({ stars: 1 }) }),
      E,
      ctx,
    ));
    const first = await Promise.race([res.then(() => "response"), new Promise((r) => setTimeout(() => r("timeout"), 300))]);
    expect(first).toBe("response");
    expect((await res).status).toBe(200);
    release();
    await flush();
    expect(f.pushes).toHaveLength(1);
  });
});

describe("M1: the review redirect URL is parsed, not pattern-matched", () => {
  it("a non-ASCII https URL is percent-encoded (no 500); an unparseable or non-https one falls back to the rating page", async () => {
    const a = await setup("rv-m1");
    const s = await a.sale();
    const fallback = `${env.APP_ORIGIN.replace(/\/+$/, "")}/rate/?t=${s.token}`;
    await setSettings(a.org.id, "google_review_url = ?", "https://g.page/café");
    const r = await raw("GET", `/public/review/${s.token}`);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://g.page/caf%C3%A9");
    for (const bad of ["https://", "https://exa mple.com/x", "ftp://g.page/x", "javascript:alert(1)"]) {
      await setSettings(a.org.id, "google_review_url = ?", bad);
      const b = await raw("GET", `/public/review/${s.token}`);
      expect(b.status, bad).toBe(302);
      expect(b.headers.get("location"), bad).toBe(fallback);
    }
  });
});

describe("review redirect", () => {
  it("records the first click only and 302s to the org's https url", async () => {
    const a = await setup("rv-a");
    const b = await setup("rv-b");
    await setSettings(a.org.id, "google_review_url = ?", "https://g.page/rv-a");
    await setSettings(b.org.id, "google_review_url = ?", "https://g.page/rv-b");
    const s = await a.sale();
    const r1 = await raw("GET", `/public/review/${s.token}`);
    expect(r1.status).toBe(302);
    expect(r1.headers.get("location")).toBe("https://g.page/rv-a");
    const t1 = (await env.DB.prepare("SELECT review_clicked_at AS t FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, s.id).first<any>()).t;
    expect(t1).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 5));
    await raw("GET", `/public/review/${s.token}`);
    expect((await env.DB.prepare("SELECT review_clicked_at AS t FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, s.id).first<any>()).t).toBe(t1);
  });

  it("falls back to the org's rating page when no https url is set", async () => {
    const a = await setup("rv-fb");
    const s = await a.sale();
    const r = await raw("GET", `/public/review/${s.token}`);
    expect(r.headers.get("location")).toBe(`${env.APP_ORIGIN.replace(/\/+$/, "")}/rate/?t=${s.token}`);
    // a stored non-https value is never followed
    await setSettings(a.org.id, "google_review_url = ?", "javascript:alert(1)");
    expect((await raw("GET", `/public/review/${s.token}`)).headers.get("location")).toBe(`${env.APP_ORIGIN.replace(/\/+$/, "")}/rate/?t=${s.token}`);
    await setSettings(a.org.id, "google_review_url = ?", "http://insecure.test");
    expect((await raw("GET", `/public/review/${s.token}`)).headers.get("location")).toContain("/rate/?t=");
  });
});

describe("GET /api/ratings", () => {
  it("is admin-only and feature-gated", async () => {
    const a = await setup("rp-gate");
    expect((await raw("GET", "/ratings", { cookie: a.k1 })).status).toBe(403);
    expect((await raw("GET", "/ratings", { cookie: a.ck })).status).toBe(200);
    const free = await setup("rp-free", "free");
    expect((await raw("GET", "/ratings", { cookie: free.ck })).status).toBe(403);
  });

  it("reports averages, per-barber, recent, google counts, scoped by org and by day range", async () => {
    const a = await setup("rp-a");
    const b = await setup("rp-b");
    const today = businessDay(Date.now(), { timezone: "Asia/Dubai", dayStartHour: 4 });
    const s1 = await a.sale("One");
    const s2 = await a.sale("Two");
    const sb = await b.sale("Other");
    await raw("POST", `/public/feedback/${s1.token}`, { body: { stars: 5 } });
    await raw("POST", `/public/feedback/${s2.token}`, { body: { stars: 3, comment: "ok" } });
    await raw("POST", `/public/feedback/${sb.token}`, { body: { stars: 1 } });
    await raw("GET", `/public/review/${s1.token}`);
    await env.DB.prepare("INSERT INTO wa_messages(org_id, kind, sale_id, phone, template, status, created_at) VALUES(?, 'feedback', ?, '1', 't', 'sent', ?)").bind(a.org.id, s1.id, Date.now()).run();
    await env.DB.prepare("INSERT INTO wa_messages(org_id, kind, sale_id, phone, template, status, created_at) VALUES(?, 'feedback', ?, '1', 't', 'sent', ?)").bind(b.org.id, sb.id, Date.now()).run();

    const rep = await json(await raw("GET", `/ratings?from=${today}&to=${today}`, { cookie: a.ck }));
    expect(rep).toMatchObject({ from: today, to: today, count: 2, average: 4 });
    expect(rep.barbers).toEqual([{ barber_id: a.b1.id, barber_name: "b1", count: 2, average: 4 }]);
    expect(rep.ratings.map((r: any) => r.stars).sort()).toEqual([3, 5]);
    expect(rep.ratings[0]).toMatchObject({ barber_name: "b1", day: today });
    expect(rep.google).toMatchObject({ asked: 1, clicked: 1 });
    expect(rep.google.barbers).toEqual([{ barber_id: a.b1.id, barber_name: "b1", asked: 1, clicked: 1 }]);

    const rb = await json(await raw("GET", `/ratings?from=${today}&to=${today}`, { cookie: b.ck }));
    expect(rb).toMatchObject({ count: 1, average: 1 });
    expect(rb.google).toMatchObject({ asked: 1, clicked: 0 });

    const past = await json(await raw("GET", "/ratings?from=2020-01-01&to=2020-01-31", { cookie: a.ck }));
    expect(past).toMatchObject({ count: 0, average: null, barbers: [], ratings: [] });
    // default range: this month through today
    const def = await json(await raw("GET", "/ratings", { cookie: a.ck }));
    expect(def).toMatchObject({ from: `${today.slice(0, 7)}-01`, to: today });
  });
});
