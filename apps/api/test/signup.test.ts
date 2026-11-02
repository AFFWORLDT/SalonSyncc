import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import type { Env } from "../src/env";
import { setServicesForTest } from "../src/core/services";
import { fakeServices } from "./fakes";
import { countingDb } from "./counting-db";
import { ipKey } from "../src/platform/signup";

const pending: Promise<unknown>[] = [];
const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
const flush = async () => { while (pending.length) await pending.shift(); };
const E = { ...env, ROOT_DOMAIN: "salonkit.online" } as Env;
let ipN = 0;
const freshIp = () => `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`;

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}, envOver: Partial<Env> = {}) {
  return app.fetch(
    new Request(url, { method, headers: { "content-type": "application/json", "CF-Connecting-IP": headers.ip ?? freshIp(), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }),
    { ...E, ...envOver },
    ctx,
  );
}
const signup = (over: Record<string, unknown> = {}, h: Record<string, string> = {}, e: Partial<Env> = {}) =>
  req("POST", "https://salonkit.online/api/public/signup", { salon_name: "Beard & Co", slug: `bc-${Math.random().toString(36).slice(2, 8)}`, owner_name: "Sam Owner", email: `sam${Math.random().toString(36).slice(2, 8)}@example.com`, phone: "+919812345678", password: "longpass1", country: "IN", ...over }, h, e);
const count = async (t: string, orgSlug: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE org_id IN (SELECT id FROM orgs WHERE slug = ?)`).bind(orgSlug).first<{ n: number }>())!.n;

afterEach(() => setServicesForTest(null));

describe("salon ID check", () => {
  it("free, taken, reserved and invalid", async () => {
    const ok = await (await req("GET", "https://salonkit.online/api/public/slug?s=Fresh-Cuts")).json();
    expect(ok).toEqual({ slug: "fresh-cuts", available: true });
    await signup({ slug: "taken-one" });
    expect(await (await req("GET", "https://salonkit.online/api/public/slug?s=taken-one")).json()).toMatchObject({ available: false, reason: "taken" });
    expect(await (await req("GET", "https://salonkit.online/api/public/slug?s=admin")).json()).toMatchObject({ available: false, reason: "reserved" });
    for (const s of ["a", "-ab", "ab-", "Ab_c!"]) expect(await (await req("GET", `https://salonkit.online/api/public/slug?s=${encodeURIComponent(s)}`)).json()).toMatchObject({ available: false, reason: "invalid" });
  });
});

describe("signup", () => {
  it("creates a trial salon with country defaults and a handoff link", async () => {
    const before = Date.now();
    const r = await signup({ slug: "kolkata-cuts", country: "IN" });
    expect(r.status).toBe(201);
    const b: any = await r.json();
    expect(b.slug).toBe("kolkata-cuts");
    expect(b.handoff_url).toMatch(/^https:\/\/kolkata-cuts\.salonkit\.online\/login\/\?handoff=[\w-]+$/);
    const org = await env.DB.prepare("SELECT * FROM orgs WHERE slug = 'kolkata-cuts'").first<any>();
    expect(org).toMatchObject({ status: "trial", plan_id: "pro_max", country: "IN" });
    expect(org.trial_ends_at - before).toBeGreaterThanOrEqual(7 * 86_400_000 - 5000);
    expect(org.grace_ends_at - org.trial_ends_at).toBe(7 * 86_400_000);
    const st = await env.DB.prepare("SELECT currency, timezone, phone_country, locale, bill_prefix, display_name FROM org_settings WHERE org_id = ?").bind(org.id).first<any>();
    expect(st).toEqual({ currency: "INR", timezone: "Asia/Kolkata", phone_country: "91", locale: "en-IN", bill_prefix: "KOL", display_name: "Beard & Co" });
    const owner = await env.DB.prepare("SELECT id, role, username FROM users WHERE org_id = ?").bind(org.id).first<any>();
    expect(owner.role).toBe("owner");
    expect(org.owner_user_id).toBe(owner.id);
  });

  it("an unknown country falls back to UAE defaults", async () => {
    await signup({ slug: "zz-salon", country: "ZZ" });
    const st = await env.DB.prepare("SELECT s.currency FROM org_settings s JOIN orgs o ON o.id = s.org_id WHERE o.slug = 'zz-salon'").first<any>();
    expect(st.currency).toBe("AED");
  });

  it("two signups racing for one salon ID: one wins, the other gets 409 and nothing partial", async () => {
    const [a, b] = await Promise.all([signup({ slug: "race-salon" }), signup({ slug: "race-salon" })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await count("users", "race-salon")).toBe(1);
    expect(await count("org_settings", "race-salon")).toBe(1);
  });

  it("all or nothing: a failing batch leaves no rows", async () => {
    const DB = new Proxy(env.DB, {
      get(t, k) {
        if (k === "batch") return async () => { throw new Error("D1 boom"); };
        const v = (t as any)[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const r = await signup({ slug: "boom-salon" }, {}, { DB });
    expect(r.status).toBe(500);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orgs WHERE slug = 'boom-salon'").first<any>()).toEqual({ n: 0 });
  });

  it("validates input", async () => {
    expect((await signup({ email: "nope" })).status).toBe(400);
    expect((await signup({ password: "short12" })).status).toBe(400);
    expect((await signup({ salon_name: "" })).status).toBe(400);
    expect((await signup({ slug: "x" })).status).toBe(400);
    expect((await signup({ slug: "admin" })).status).toBe(409);
  });

  it("one email can't own two salons", async () => {
    await signup({ slug: "first-one", email: "dup@example.com" });
    const r = await signup({ slug: "second-one", email: "DUP@example.com" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "email_taken" });
  });

  it("at most 5 signups per IP per hour", async () => {
    const ip = "10.250.1.1";
    for (let i = 0; i < 5; i++) expect((await signup({}, { ip })).status).toBe(201);
    expect((await signup({}, { ip })).status).toBe(429);
  });

  it("Turnstile: skipped when unset, enforced when set", async () => {
    setServicesForTest(() => fakeServices({ turnstileOk: (t) => t === "good" }).services);
    expect((await signup({}, {}, { TURNSTILE_SECRET: "s" })).status).toBe(400);
    expect((await signup({ turnstile: "bad" }, {}, { TURNSTILE_SECRET: "s" })).status).toBe(400);
    expect((await signup({ turnstile: "good" }, {}, { TURNSTILE_SECRET: "s" })).status).toBe(201);
    expect((await signup()).status).toBe(201);
  });

  it("refuses cross-site posts", async () => {
    expect((await signup({}, { origin: "https://evil.test" })).status).toBe(403);
  });

  it("costs at most 12 D1 statements", async () => {
    const { db, count } = countingDb(env.DB);
    expect((await signup({}, {}, { DB: db })).status).toBe(201);
    expect(count.statements).toBeLessThanOrEqual(12);
  });
});

describe("handoff", () => {
  const tokenOf = (url: string) => new URL(url).searchParams.get("handoff")!;
  const handoff = (slug: string, token: string) => req("POST", `https://${slug}.salonkit.online/api/auth/handoff`, { token });

  it("signs the owner in once, on their own salon only", async () => {
    const b: any = await (await signup({ slug: "hand-a" })).json();
    await signup({ slug: "hand-b" });
    const t = tokenOf(b.handoff_url);
    const wrong = await handoff("hand-b", t);
    expect(wrong.status).toBe(401);
    const b2: any = await (await signup({ slug: "hand-c" })).json();
    const t2 = tokenOf(b2.handoff_url);
    const ok = await handoff("hand-c", t2);
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
    const me: any = await (await app.fetch(new Request("https://hand-c.salonkit.online/api/me", { headers: { cookie } }), E, ctx)).json();
    expect(me.org.slug).toBe("hand-c");
    expect(me.user.role).toBe("owner");
    expect((await handoff("hand-c", t2)).status).toBe(401);
  });

  it("expires after 120 seconds", async () => {
    const b: any = await (await signup({ slug: "hand-old" })).json();
    await env.DB.prepare("UPDATE login_handoffs SET expires_at = ? WHERE org_id = (SELECT id FROM orgs WHERE slug = 'hand-old')").bind(Date.now() - 1).run();
    expect((await handoff("hand-old", tokenOf(b.handoff_url))).status).toBe(401);
  });
});

describe("welcome email", () => {
  it("is sent after signup with the salon address, ID and trial end, and logged", async () => {
    const f = fakeServices();
    setServicesForTest(() => f.services);
    const r = await signup({ slug: "mail-salon", email: "owner@mail-salon.com", owner_name: "Riya Kapoor", salon_name: "Mail Salon" }, {}, { RESEND_API_KEY: "re_test", MAIL_FROM: "SalonKit <hello@salonkit.online>" });
    expect(r.status).toBe(201);
    await flush();
    expect(f.mails).toHaveLength(1);
    const m = f.mails[0]!;
    expect(m.to).toBe("owner@mail-salon.com");
    expect(m.subject).toContain("Mail Salon");
    expect(m.html).toContain("https://mail-salon.salonkit.online/");
    expect(m.html).toContain("Welcome, Riya!");
    expect(m.text).toContain("Salon ID: mail-salon");
    const log = await env.DB.prepare("SELECT status, sent_at FROM email_log WHERE kind = 'welcome' AND org_id = (SELECT id FROM orgs WHERE slug = 'mail-salon')").first<any>();
    expect(log.status).toBe("sent");
    expect(log.sent_at).toBeGreaterThan(0);
  });
  it("is logged as skipped without a Resend key, and as failed when the provider refuses", async () => {
    await signup({ slug: "mail-skip" });
    await flush();
    expect((await env.DB.prepare("SELECT status FROM email_log WHERE org_id = (SELECT id FROM orgs WHERE slug = 'mail-skip')").first<any>()).status).toBe("skipped");
    setServicesForTest(() => fakeServices({ mailOk: false }).services);
    await signup({ slug: "mail-fail" }, {}, { RESEND_API_KEY: "re_test", MAIL_FROM: "x <a@b.co>" });
    await flush();
    expect((await env.DB.prepare("SELECT status FROM email_log WHERE org_id = (SELECT id FROM orgs WHERE slug = 'mail-fail')").first<any>()).status).toBe("failed");
  });
  it("escapes the salon name in the HTML", async () => {
    const f = fakeServices();
    setServicesForTest(() => f.services);
    await signup({ slug: "mail-xss", salon_name: "<b>Evil</b> & Co" }, {}, { RESEND_API_KEY: "re_test", MAIL_FROM: "x <a@b.co>" });
    await flush();
    expect(f.mails[0]!.html).not.toContain("<b>Evil</b>");
    expect(f.mails[0]!.html).toContain("&lt;b&gt;Evil&lt;/b&gt; &amp; Co");
  });
});

describe("final review fixes", () => {
  it("accepts common phone formats and stores digits", async () => {
    expect((await signup({ slug: "phone-ok", phone: "+971 50-123-4567" })).status).toBe(201);
    const o = await env.DB.prepare("SELECT owner_phone FROM orgs WHERE slug = 'phone-ok'").first<any>();
    expect(o.owner_phone).toBe("+971501234567");
    expect((await signup({ phone: "(050) 123 4567" })).status).toBe(201);
    expect((await signup({ phone: "call me" })).status).toBe(400);
  });
  it("emails must be valid usernames (at most 60, safe characters)", async () => {
    expect((await signup({ email: `${"a".repeat(55)}@x.com` })).status).toBe(400);
    expect((await signup({ email: "o'brien@x.com" })).status).toBe(400);
  });
  it("invalid forms don't use up the hourly tries", async () => {
    const ip = "10.251.1.1";
    for (let i = 0; i < 7; i++) expect((await signup({ email: "bad" }, { ip })).status).toBe(400);
    expect((await signup({}, { ip })).status).toBe(201);
  });
  it("IPv6 is limited per /64", async () => {
    expect(ipKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ipKey("10.0.0.1")).toBe("10.0.0.1");
    for (let i = 0; i < 5; i++) expect((await signup({}, { ip: `2001:db8:9:9::${i + 1}` })).status).toBe(201);
    expect((await signup({}, { ip: "2001:db8:9:9::99" })).status).toBe(429);
  });
  it("caps signups across all IPs while Turnstile is off", async () => {
    await env.DB.prepare("INSERT INTO rate_hits(key, window, n) VALUES('signup:all', ?, 999) ON CONFLICT(key) DO UPDATE SET n = 999, window = excluded.window").bind(Math.floor(Date.now() / 3_600_000)).run();
    expect((await signup()).status).toBe(429);
    setServicesForTest(() => fakeServices().services);
    expect((await signup({ turnstile: "ok" }, {}, { TURNSTILE_SECRET: "s" })).status).toBe(201);
    await env.DB.prepare("DELETE FROM rate_hits WHERE key = 'signup:all'").run();
  });
});
