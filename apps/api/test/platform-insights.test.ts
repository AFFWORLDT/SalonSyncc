import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import app from "../src/index";
import type { Env } from "../src/env";
import { hashPassword } from "../src/core/crypto";
import { forgetActivityForTest, recordActivity, shouldRecord, utcDay, ACTIVITY_EVERY_MS } from "../src/core/activity";
import { BROADCAST_SLICE, series, windows } from "../src/platform/insights";
import { setServicesForTest } from "../src/core/services";
import { fakeServices } from "./fakes";
import { makeOrg, makeUser } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "salonkit.online", FCM_SERVICE_ACCOUNT: "{}" } as Env;
const ADMIN = "https://admin.salonkit.online";
let ipN = 0;
const req = (method: string, path: string, cookie: string, body?: unknown) =>
  app.fetch(
    new Request(`${ADMIN}/api/platform${path}`, {
      method,
      headers: { "content-type": "application/json", "CF-Connecting-IP": `10.78.${Math.floor(++ipN / 250)}.${ipN % 250}`, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    E,
    ctx,
  );

let owner = "";
let support = "";
async function login(email: string, role: "owner" | "support") {
  await env.DB.prepare("INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(?,?,?,?)").bind(email, await hashPassword("superpass123"), role, Date.now()).run();
  const r = await app.fetch(
    new Request(`${ADMIN}/api/platform/login`, { method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": `10.79.0.${++ipN % 250}` }, body: JSON.stringify({ email, password: "superpass123" }) }),
    E,
    ctx,
  );
  return r.headers.get("set-cookie")!.split(";")[0]!;
}
beforeAll(async () => {
  owner = await login("ins-owner@salonkit.test", "owner");
  support = await login("ins-help@salonkit.test", "support");
});
afterEach(() => setServicesForTest(null));

describe("activity recording", () => {
  it("writes at most once per 10 minutes per person and platform, and again on a new day", () => {
    forgetActivityForTest();
    const t = Date.parse("2026-11-09T10:00:00Z");
    expect(shouldRecord(1, "web", t)).toBe(true);
    expect(shouldRecord(1, "web", t + 60_000)).toBe(false);
    expect(shouldRecord(1, "ios", t + 60_000)).toBe(true);
    expect(shouldRecord(1, "web", t + ACTIVITY_EVERY_MS)).toBe(true);
    expect(shouldRecord(2, "web", Date.parse("2026-11-09T23:59:00Z"))).toBe(true);
    expect(shouldRecord(2, "web", Date.parse("2026-11-10T00:01:00Z"))).toBe(true);
  });

  it("one row per person per platform per day: hits add up, the latest app version wins", async () => {
    forgetActivityForTest();
    const org = await makeOrg({ slug: "ins-act" });
    const u = await makeUser(org.id, { username: "act", role: "barber" });
    const t = Date.parse("2026-11-09T08:00:00Z");
    await recordActivity(env.DB, { orgId: org.id, userId: u.id, platform: "android", appVersion: "1.0.0", at: t });
    await recordActivity(env.DB, { orgId: org.id, userId: u.id, platform: "android", appVersion: "1.0.1", at: t + ACTIVITY_EVERY_MS });
    await recordActivity(env.DB, { orgId: org.id, userId: u.id, platform: "android", appVersion: "1.0.1", at: t + ACTIVITY_EVERY_MS + 1 }); // throttled
    const r = await env.DB.prepare("SELECT day, hits, app_version, first_at, last_at FROM activity_daily WHERE user_id = ?").bind(u.id).all();
    expect(r.results).toEqual([{ day: "2026-11-09", hits: 2, app_version: "1.0.1", first_at: t, last_at: t + ACTIVITY_EVERY_MS }]);
  });
});

describe("windows and series", () => {
  it("UTC days ending today; previous is the same length before", () => {
    const w = windows(7, Date.parse("2026-11-09T15:00:00Z"));
    expect([w.today, w.from, w.prev]).toEqual(["2026-11-09", "2026-11-03", "2026-10-27"]);
    expect(series(w, [{ d: "2026-11-05", n: 3 }]).map((r) => r.n)).toEqual([0, 0, 3, 0, 0, 0, 0]);
  });
});

async function seed() {
  const org = await makeOrg({ slug: `ins-${++ipN}` });
  const a = await makeUser(org.id, { username: `a${ipN}`, role: "owner" });
  const b = await makeUser(org.id, { username: `b${ipN}`, role: "barber" });
  const today = utcDay(Date.now());
  const ins = (uid: number, platform: string, ver: string | null, day = today) =>
    env.DB.prepare("INSERT OR REPLACE INTO activity_daily(day, org_id, user_id, platform, app_version, first_at, last_at, hits) VALUES(?,?,?,?,?,?,?,1)").bind(day, org.id, uid, platform, ver, Date.now(), Date.now()).run();
  await ins(a.id, "web", null);
  await ins(b.id, "ios", "1.0.0");
  await ins(b.id, "web", null);
  return { org, a, b };
}

describe("portal insights", () => {
  it("dashboard: tiles and day series for the range; bad ranges fall back to 7", async () => {
    await seed();
    const r = await req("GET", "/insights/dashboard?range=30", support);
    expect(r.status).toBe(200);
    const j = (await r.json()) as { range: number; tiles: Record<string, number>; series: Record<string, { day: string; n: number }[]> };
    expect(j.range).toBe(30);
    expect(j.series.active).toHaveLength(30);
    expect(j.tiles.active_today).toBeGreaterThanOrEqual(2);
    expect(j.series.active.at(-1)!.n).toBeGreaterThanOrEqual(2);
    expect(((await (await req("GET", "/insights/dashboard?range=5", owner)).json()) as { range: number }).range).toBe(7);
  });

  it("app usage: a person on two platforms counts once a day, platforms and versions split", async () => {
    const { b } = await seed();
    const j = (await (await req("GET", "/insights/usage?range=7", owner).then((r) => r)).json()) as {
      dau: { n: number }[]; wau: { n: number }[]; platforms: { platform: string; n: number }[]; versions: { platform: string; version: string }[]; recent: { user_id: number }[]; features: Record<string, number>;
    };
    expect(j.dau).toHaveLength(7);
    expect(j.wau.at(-1)!.n).toBeGreaterThanOrEqual(j.dau.at(-1)!.n);
    expect(j.platforms.map((p) => p.platform)).toEqual(expect.arrayContaining(["web", "ios"]));
    expect(j.versions).toContainEqual(expect.objectContaining({ platform: "ios", version: "1.0.0" }));
    expect(j.recent.some((r) => r.user_id === b.id)).toBe(true);
    expect(j.features).toHaveProperty("bills_prev");
  });

  it("people: search, role filter, last activity and paging total", async () => {
    const { org, b } = await seed();
    const j = (await (await req("GET", `/insights/people?q=${org.slug}&role=barber`, owner)).json()) as { people: { id: number; last_at: number | null; slug: string }[]; total: number };
    expect(j.total).toBe(1);
    expect(j.people[0]).toMatchObject({ id: b.id, slug: org.slug });
    expect(j.people[0]!.last_at).toBeGreaterThan(0);
    const inactive = (await (await req("GET", `/insights/people?q=${org.slug}&inactive=7`, owner)).json()) as { total: number };
    expect(inactive.total).toBe(0);
  });

  it("AI connect and WhatsApp summaries answer with their shapes", async () => {
    const ai = (await (await req("GET", "/insights/ai?range=7", owner)).json()) as { per_day: unknown[]; tiles: Record<string, number> };
    expect(ai.per_day).toHaveLength(7);
    expect(ai.tiles).toHaveProperty("connections");
    const wa = (await (await req("GET", "/insights/whatsapp?range=90", owner)).json()) as { per_day: unknown[] };
    expect(wa.per_day).toHaveLength(90);
  });

  it("search finds salons and people (2+ letters)", async () => {
    const { org } = await seed();
    const j = (await (await req("GET", `/search?q=${org.slug}`, support)).json()) as { salons: { slug: string }[] };
    expect(j.salons.map((s) => s.slug)).toContain(org.slug);
    expect(await (await req("GET", "/search?q=a", support)).json()).toEqual({ salons: [], people: [] });
  });

  it("needs a portal session", async () => {
    expect((await req("GET", "/insights/dashboard", "")).status).toBe(401);
  });
});

describe("push broadcast", () => {
  async function tokens(orgId: string, uid: number, n: number, prefix: string) {
    for (let i = 0; i < n; i++)
      await env.DB.prepare("INSERT INTO push_tokens(token, org_id, user_id, created_at, updated_at) VALUES(?,?,?,?,?)").bind(`${prefix}-${String(i).padStart(3, "0")}`, orgId, uid, 1, 1).run();
  }

  it("sends to one salon in slices, forgets dead tokens, keeps the history, and is owner-only", async () => {
    const { org, a } = await seed();
    await tokens(org.id, a.id, BROADCAST_SLICE + 5, `bc${org.slug}`);
    const f = fakeServices({ dead: [`bc${org.slug}-001`] });
    f.install();
    expect((await req("POST", "/notifications", support, { title: "Hello", body: "New feature", target: "org", org_id: org.id })).status).toBe(403);
    const first = await req("POST", "/notifications", owner, { title: "Hello", body: "New feature", target: "org", org_id: org.id });
    expect(first.status).toBe(201);
    const b1 = (await first.json()) as { id: number; recipients: number; sent: number; failed: number; done: number };
    expect([b1.recipients, b1.done, b1.sent + b1.failed]).toEqual([BROADCAST_SLICE + 5, 0, BROADCAST_SLICE]);
    const b2 = (await (await req("POST", `/notifications/${b1.id}/continue`, owner)).json()) as { sent: number; failed: number; done: number };
    expect([b2.done, b2.sent + b2.failed, b2.failed]).toEqual([1, BROADCAST_SLICE + 5, 1]);
    expect(f.pushes.flatMap((p) => p.tokens)).toHaveLength(BROADCAST_SLICE + 5);
    expect(f.pushes[0]!.push.link).toBe(`https://${org.slug}.salonkit.online/`);
    expect(await env.DB.prepare("SELECT 1 FROM push_tokens WHERE token = ?").bind(`bc${org.slug}-001`).first()).toBeNull();
    const hist = (await (await req("GET", "/notifications/history", support)).json()) as { broadcasts: { id: number; target_label: string }[] };
    expect(hist.broadcasts[0]).toMatchObject({ id: b1.id });
    const audit = await env.DB.prepare("SELECT action FROM platform_audit WHERE action = 'push_broadcast' ORDER BY id DESC LIMIT 1").first();
    expect(audit).toEqual({ action: "push_broadcast" });
  });

  it("refuses an empty audience and bad input", async () => {
    const { org } = await seed();
    expect((await req("POST", "/notifications", owner, { title: "Hi", body: "x", target: "all" })).status).toBe(400);
    expect((await req("POST", "/notifications", owner, { title: "Hello", body: "Nobody", target: "org", org_id: org.id })).status).toBe(400);
    expect((await req("POST", "/notifications", owner, { title: "Hello", body: "Who?", target: "user", org_id: org.id, user_id: 999999 })).status).toBe(400);
  });

  it("stats count devices by kind", async () => {
    const j = (await (await req("GET", "/notifications/stats", support)).json()) as { devices: number; configured: boolean };
    expect(j.configured).toBe(true);
    expect(j.devices).toBeGreaterThanOrEqual(0);
  });
});
