import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { encryptSecret, decryptSecret } from "../src/lib/secrets";
import { orgAppUrl } from "../src/core/links";
import { services } from "../src/core/services";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { fakeServices } from "./fakes";
import { makePng } from "./png";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "" };
const call = (method: string, path: string, cookie: string, body?: Uint8Array, type = "image/png") =>
  app.fetch(
    new Request(`https://x.test/api${path}`, { method, headers: { cookie, ...(body ? { "content-type": type } : {}) }, body }),
    E,
    ctx,
  );
const ROOT = "salonstation.online";
const pub = (path: string, host = "x.test", root = "") =>
  app.fetch(new Request(`https://${host}/api/public${path}`, { headers: { "CF-Connecting-IP": "9.9.9.9" } }), { ...env, ROOT_DOMAIN: root }, ctx);
const img = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

describe("secrets", () => {
  it("round-trips and uses the v1.<iv>.<ct> format with a fresh IV", async () => {
    const a = await encryptSecret("EAAG-token-123", env.SECRETS_KEY);
    const b = await encryptSecret("EAAG-token-123", env.SECRETS_KEY);
    expect(a).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("EAAG");
    expect(await decryptSecret(a, env.SECRETS_KEY)).toBe("EAAG-token-123");
    expect(await decryptSecret(await encryptSecret("", env.SECRETS_KEY), env.SECRETS_KEY)).toBe("");
  });

  it("throws on tampered ciphertext, an unknown version, a wrong or malformed key", async () => {
    const enc = await encryptSecret("secret", env.SECRETS_KEY);
    const [v, iv, ct] = enc.split(".") as [string, string, string];
    const flipped = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    await expect(decryptSecret(`${v}.${iv}.${flipped}`, env.SECRETS_KEY)).rejects.toThrow();
    await expect(decryptSecret(`v2.${iv}.${ct}`, env.SECRETS_KEY)).rejects.toThrow(/version/i);
    await expect(decryptSecret("garbage", env.SECRETS_KEY)).rejects.toThrow();
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));
    await expect(decryptSecret(enc, other)).rejects.toThrow();
    await expect(encryptSecret("x", btoa("short"))).rejects.toThrow(/32/);
  });
});

describe("schema 0009", () => {
  it("org_whatsapp.phone_number_id is globally unique", async () => {
    const a = await makeOrg({ slug: "sch-wa-a" });
    const b = await makeOrg({ slug: "sch-wa-b" });
    const ins = (org: string, pid: string) =>
      env.DB.prepare("INSERT INTO org_whatsapp(org_id, phone_number_id, waba_id, token_enc, updated_at) VALUES(?,?,?,?,?)").bind(org, pid, "w", "v1.x.y", 1).run();
    await ins(a.id, "pn-1");
    await expect(ins(b.id, "pn-1")).rejects.toThrow(/UNIQUE/);
    await ins(b.id, "pn-2");
  });

  it("ratings: one per sale per org; FKs are org-composite", async () => {
    const a = await makeOrg({ slug: "sch-rt-a" });
    const b = await makeOrg({ slug: "sch-rt-b" });
    const u = await makeUser(a.id, { username: "own" });
    const sale = await env.DB.prepare(
      "INSERT INTO sales(org_id,bill_no,token,day,barber_id,customer_label,amount,payment_mode,commission_pct,commission,vat_rate,vat_amount,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    ).bind(a.id, "A-1", "tok-sch-rt-a-1", "2026-11-02", u.id, "Customer 1", 100, "cash", 0, 0, 0, 0, u.id, 1, 1).first<{ id: number }>();
    const rate = (org: string, saleId: number, barber: number) =>
      env.DB.prepare("INSERT INTO ratings(org_id, sale_id, barber_id, stars, created_at, updated_at) VALUES(?,?,?,?,?,?)").bind(org, saleId, barber, 5, 1, 1).run();
    await rate(a.id, sale!.id, u.id);
    await expect(rate(a.id, sale!.id, u.id)).rejects.toThrow(/UNIQUE/);
    // org B can't point a rating at org A's sale or barber
    await expect(rate(b.id, sale!.id, u.id)).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      env.DB.prepare("INSERT INTO ratings(org_id, sale_id, barber_id, stars, created_at, updated_at) VALUES(?,?,?,?,?,?)").bind(a.id, sale!.id, u.id, 6, 1, 1).run(),
    ).rejects.toThrow();
  });

  it("wa_campaigns uid unique per org; wa_messages campaign FK is org-composite; push token is global", async () => {
    const a = await makeOrg({ slug: "sch-wc-a" });
    const b = await makeOrg({ slug: "sch-wc-b" });
    const camp = (org: string, uid: string) =>
      env.DB.prepare("INSERT INTO wa_campaigns(org_id, uid, template, language, params, created_at) VALUES(?,?,?,?,?,?) RETURNING id").bind(org, uid, "t", "en", "[]", 1).first<{ id: number }>();
    const c = await camp(a.id, "u1");
    await camp(b.id, "u1");
    await expect(camp(a.id, "u1")).rejects.toThrow(/UNIQUE/);
    const msg = (org: string, cid: number) =>
      env.DB.prepare("INSERT INTO wa_messages(org_id, kind, phone, template, status, campaign_id, created_at) VALUES(?,?,?,?,?,?,?)").bind(org, "announcement", "0501234567", "t", "queued", cid, 1).run();
    await msg(a.id, c!.id);
    await expect(msg(b.id, c!.id)).rejects.toThrow(/FOREIGN KEY/);
    const ua = await makeUser(a.id, { username: "own" });
    const ub = await makeUser(b.id, { username: "own" });
    const tok = (org: string, user: number) =>
      env.DB.prepare("INSERT INTO push_tokens(token, org_id, user_id, created_at, updated_at) VALUES(?,?,?,?,?)").bind("dev-1", org, user, 1, 1).run();
    await tok(a.id, ua.id);
    await expect(tok(b.id, ub.id)).rejects.toThrow(/UNIQUE|PRIMARY/);
    await expect(
      env.DB.prepare("INSERT INTO push_tokens(token, org_id, user_id, created_at, updated_at) VALUES(?,?,?,?,?)").bind("dev-2", b.id, ua.id, 1, 1).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("org_settings gets the SalonStation WhatsApp defaults", async () => {
    const o = await makeOrg({ slug: "sch-def" });
    const r = await env.DB.prepare(
      "SELECT wa_bill_auto, wa_bill_template, wa_bill_pdf_template, wa_reminder_enabled, wa_reminder_days, wa_reminder_hour, wa_reminder_template, wa_language, wa_feedback_enabled, wa_feedback_delay_min, wa_feedback_template, wa_feedback_reminder_min, wa_feedback_reminder_template, wa_rating_image_url, wa_rating_reminder_image_url, wa_fresh_cut_image_url FROM org_settings WHERE org_id = ?",
    ).bind(o.id).first();
    expect(r).toEqual({
      wa_bill_auto: 0, wa_bill_template: "ss_bill", wa_bill_pdf_template: "ss_bill_pdf", wa_reminder_enabled: 0, wa_reminder_days: 15, wa_reminder_hour: 11,
      wa_reminder_template: "ss_fresh_cut", wa_language: "en", wa_feedback_enabled: 0, wa_feedback_delay_min: 0, wa_feedback_template: "ss_rating",
      wa_feedback_reminder_min: 120, wa_feedback_reminder_template: "ss_rating_reminder", wa_rating_image_url: null, wa_rating_reminder_image_url: null, wa_fresh_cut_image_url: null,
    });
  });
});

describe("orgAppUrl", () => {
  it("is the tenant subdomain when ROOT_DOMAIN is set", () => {
    expect(orgAppUrl({ ...env, ROOT_DOMAIN: ROOT }, { slug: "fresh" })).toBe("https://fresh.salonstation.online");
  });
  it("falls back to APP_ORIGIN (no trailing slash) without ROOT_DOMAIN", () => {
    expect(orgAppUrl({ ...env, ROOT_DOMAIN: "", APP_ORIGIN: "https://app.example.dev/" }, { slug: "fresh" })).toBe("https://app.example.dev");
    expect(orgAppUrl({ ...env, ROOT_DOMAIN: "" }, { slug: "x" })).toBe(env.APP_ORIGIN.replace(/\/+$/, ""));
  });
});

describe("services seam", () => {
  afterEach(() => fakeServices().uninstall());
  it("real clients by default; a test override swaps them", async () => {
    const real = services(env);
    // Real FCM client without FCM_SERVICE_ACCOUNT: a no-op, no network.
    await expect(real.push.send({ ...env, FCM_SERVICE_ACCOUNT: undefined }, ["t"], { title: "x", body: "y" })).resolves.toEqual({ dead: [] });
    // Real WhatsApp client is the Graph client (exercised with a fake fetch in wa-config.test.ts; never called here).
    expect(typeof real.wa.sendTemplate).toBe("function");
    const f = fakeServices();
    f.install();
    const r = await services(env).wa.sendTemplate({ phoneNumberId: "p", wabaId: "w", token: "t", testNumbers: null, callingCode: "971" }, "0501234567", "ss_bill", "en", ["Ali"]);
    expect(r).toMatchObject({ status: "sent" });
    expect(f.wa).toHaveLength(1);
    // the override is ignored outside the test environment
    expect(services({ ...env, ENVIRONMENT: "production" })).toBe(real);
  });
});

describe("org logo", () => {
  async function setup(slug: string) {
    const org = await makeOrg({ slug, plan: "pro_max" });
    await makeUser(org.id, { username: "own", role: "owner" });
    await makeUser(org.id, { username: "bar", role: "barber" });
    return { org, ck: await loginAs(slug, "own"), bk: await loginAs(slug, "bar") };
  }
  const settingsOf = async (ck: string) => (await (await call("GET", "/settings", ck)).json()) as any;

  it("upload, then serve publicly (immutable); settings.logo_url is derived", async () => {
    const { ck } = await setup("lg-up");
    expect((await settingsOf(ck)).logo_url).toBeNull();
    const r = await call("PUT", "/settings/logo", ck, img(100));
    expect(r.status).toBe(200);
    const { logo_url } = (await r.json()) as any;
    expect(logo_url).toBe("/api/public/logo/1?org=lg-up");
    expect((await settingsOf(ck)).logo_url).toBe(logo_url);
    const g = await pub(logo_url.replace("/api/public", ""));
    expect(g.status).toBe(200);
    expect(g.headers.get("content-type")).toBe("image/png");
    expect(g.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await g.arrayBuffer())).toEqual(img(100));
    // a stale version is 404
    expect((await pub("/logo/2?org=lg-up")).status).toBe(404);
  });

  it("v always increases: replace, clear, re-upload never reuses a version", async () => {
    const { ck } = await setup("lg-v");
    const v = async (r: Response) => Number(/\/logo\/(\d+)/.exec(((await r.json()) as any).logo_url)![1]);
    const v1 = await v(await call("PUT", "/settings/logo", ck, img(10)));
    const v2 = await v(await call("PUT", "/settings/logo", ck, img(10, 8), "image/webp"));
    expect(v2).toBeGreaterThan(v1);
    const d = await call("DELETE", "/settings/logo", ck);
    expect(await d.json()).toEqual({ logo_url: null });
    expect((await settingsOf(ck)).logo_url).toBeNull();
    expect((await pub(`/logo/${v2}?org=lg-v`)).status).toBe(404);
    const v3 = await v(await call("PUT", "/settings/logo", ck, img(10, 9), "image/jpeg"));
    expect(v3).toBeGreaterThan(v2);
    expect((await pub(`/logo/${v1}?org=lg-v`)).status).toBe(404);
    expect((await pub(`/logo/${v3}?org=lg-v`)).status).toBe(200);
  });

  it("admins only; type and size are checked", async () => {
    const { ck, bk } = await setup("lg-chk");
    expect((await call("PUT", "/settings/logo", bk, img(10))).status).toBe(403);
    expect((await call("DELETE", "/settings/logo", bk)).status).toBe(403);
    expect((await call("PUT", "/settings/logo", ck, img(10), "image/gif")).status).toBe(400);
    expect((await call("PUT", "/settings/logo", ck, img(0))).status).toBe(400);
    expect((await call("PUT", "/settings/logo", ck, img(200 * 1024 + 1))).status).toBe(400);
    expect((await call("PUT", "/settings/logo", ck, img(200 * 1024))).status).toBe(200);
  });

  it("I1: a PNG logo over 512x512 is refused at upload with a clear 400; 512x512 is accepted", async () => {
    const { ck } = await setup("lg-px");
    const r = await call("PUT", "/settings/logo", ck, await makePng(1000, 1000));
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error).toMatch(/512 x 512/);
    expect((await call("PUT", "/settings/logo", ck, await makePng(513, 100))).status).toBe(400);
    expect((await call("PUT", "/settings/logo", ck, await makePng(512, 512))).status).toBe(200);
  });

  it("another org's host gets 404 for this org's logo version", async () => {
    const a = await setup("lg-xa");
    await setup("lg-xb");
    const { logo_url } = (await (await call("PUT", "/settings/logo", a.ck, img(10))).json()) as any;
    const path = logo_url.replace("/api/public", "").replace(/\?.*$/, "");
    expect((await pub(path, `lg-xa.${ROOT}`, ROOT)).status).toBe(200);
    expect((await pub(path, `lg-xb.${ROOT}`, ROOT)).status).toBe(404);
    // a tenant host never falls back to ?org=
    expect((await pub(`${path}?org=lg-xa`, `lg-xb.${ROOT}`, ROOT)).status).toBe(404);
    expect((await pub("/logo/abc?org=lg-xa")).status).toBe(404);
  });
});
