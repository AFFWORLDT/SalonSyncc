import { env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const call = (method: string, path: string, cookie: string, body?: unknown) =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { ...env, ROOT_DOMAIN: "" },
    ctx,
  );

async function setup(slug: string, plan: "free" | "pro_max" = "free") {
  const org = await makeOrg({ slug, plan });
  await makeUser(org.id, { username: "own", role: "owner", password: "pass1234" });
  await makeUser(org.id, { username: "bar", role: "barber", password: "pass1234" });
  return { org, owner: await loginAs(slug, "own"), barber: await loginAs(slug, "bar") };
}

const valid = (over: Record<string, unknown> = {}) => ({
  display_name: "Fresh Cuts",
  salon_name_ar: null,
  tagline: "Sharp",
  address: "Street 1",
  phone: "050 123 4567",
  licence_no: null,
  trn: "123456789012345",
  vat_enabled: true,
  vat_rate: 5,
  default_commission_pct: 20,
  quick_amounts: [15, 20, 50],
  thank_you_text: "Thanks {name}",
  receipt_footer: null,
  notify_sales: true,
  notify_sale_min: 0,
  notify_summary: true,
  summary_hour: 22,
  notify_reminder: false,
  reminder_hour: 12,
  notify_barber_changes: true,
  google_review_url: "https://g.page/x",
  instagram_url: null,
  timezone: "Asia/Dubai",
  day_start_hour: 4,
  currency: "AED",
  locale: "en-AE",
  phone_country: "971",
  bill_prefix: "FM",
  wa_bill_auto: true,
  wa_bill_template: "fm_bill",
  wa_bill_pdf_template: "fm_bill_pdf",
  wa_reminder_enabled: true,
  wa_reminder_days: 21,
  wa_reminder_hour: 10,
  wa_reminder_template: "fm_visit_reminder",
  wa_language: "en_US",
  wa_feedback_enabled: true,
  wa_feedback_delay_min: 30,
  wa_feedback_template: "fm_rating",
  wa_feedback_reminder_min: 1440,
  wa_feedback_reminder_template: "fm_rating_reminder",
  wa_rating_image_url: "https://cdn.example.com/rating.jpg",
  wa_rating_reminder_image_url: null,
  wa_fresh_cut_image_url: "https://cdn.example.com/fresh.jpg",
  ...over,
});

afterEach(() => vi.useRealTimers());

describe("settings", () => {
  it("GET returns the full shape for any user", async () => {
    const { barber } = await setup("st-get");
    const r = await call("GET", "/settings", barber);
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b).toMatchObject({ timezone: "Asia/Dubai", day_start_hour: 4, currency: "AED", currency_minor: 100, locale: "en-AE", phone_country: "971", bill_prefix: "STG", vat_rate: 5 });
    expect(b.quick_amounts).toEqual([15, 20, 25, 30, 35, 50]);
    expect(b.display_name).toBe("st-get");
  });

  it("owner PUT replaces the editable set and writes an audit row", async () => {
    const { owner, org } = await setup("st-put");
    const r = await call("PUT", "/settings", owner, valid());
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b).toMatchObject({ display_name: "Fresh Cuts", quick_amounts: [15, 20, 50], vat_enabled: true, default_commission_pct: 20, notify_reminder: false, bill_prefix: "FM" });
    const again: any = await (await call("GET", "/settings", owner)).json();
    expect(again).toEqual(b);
    // every submitted editable field round-trips (catches swapped binds); read-only fields are untouched
    expect(again).toEqual({ ...valid(), currency_minor: 100, logo_url: null, brand_color: null, wa_ready: false });
    const a = await env.DB.prepare("SELECT entity, action, actor_name, before, after FROM audit_log WHERE org_id = ?").bind(org.id).all<any>();
    expect(a.results).toHaveLength(1);
    expect(a.results[0]).toMatchObject({ entity: "settings", action: "update", actor_name: "own" });
    expect(JSON.parse(a.results[0].before).display_name).toBe("st-put");
    expect(JSON.parse(a.results[0].after).display_name).toBe("Fresh Cuts");
  });

  it("a barber PUT gets 403", async () => {
    const { barber } = await setup("st-403");
    const r = await call("PUT", "/settings", barber, valid());
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "You don't have access to this" });
  });

  it.each([
    ["bad timezone", { timezone: "Mars/Olympus" }],
    ["empty name", { display_name: "  " }],
    ["short TRN in UAE", { trn: "12345" }],
    ["TRN too long elsewhere", { phone_country: "91", trn: "x".repeat(41) }],
    ["hour 24", { summary_hour: 24 }],
    ["day start 13", { day_start_hour: 13 }],
    ["bill prefix lower", { bill_prefix: "fm" }],
    ["bill prefix too long", { bill_prefix: "ABCDEFG" }],
    ["currency 2 letters", { currency: "AE" }],
    ["quick amount 0", { quick_amounts: [0] }],
    ["quick amount huge", { quick_amounts: [1_000_001] }],
    ["vat 101", { vat_rate: 101 }],
    ["http link", { google_review_url: "http://x.y" }],
    ["missing field", { locale: undefined }],
    ["non-boolean flag", { notify_sales: "yes" }],
    ["template with capitals", { wa_bill_template: "FM_Bill" }],
    ["template with a space", { wa_feedback_template: "fm rating" }],
    ["template too long", { wa_reminder_template: "a".repeat(65) }],
    ["empty template", { wa_bill_pdf_template: "" }],
    ["missing template", { wa_feedback_reminder_template: undefined }],
    ["bad language", { wa_language: "english" }],
    ["language lower region", { wa_language: "en_us" }],
    ["reminder days 0", { wa_reminder_days: 0 }],
    ["reminder days 91", { wa_reminder_days: 91 }],
    ["reminder hour 24", { wa_reminder_hour: 24 }],
    ["feedback delay 1441", { wa_feedback_delay_min: 1441 }],
    ["feedback reminder -1", { wa_feedback_reminder_min: -1 }],
    ["feedback delay fractional", { wa_feedback_delay_min: 1.5 }],
    ["http image", { wa_rating_image_url: "http://x.y/a.jpg" }],
    ["image too long", { wa_fresh_cut_image_url: "https://x.y/" + "a".repeat(490) }],
    ["non-boolean wa flag", { wa_bill_auto: 1 }],
  ])("rejects %s with 400", async (_n, over) => {
    const { owner } = await setup(`st-bad-${_n.replace(/\W/g, "").toLowerCase()}`);
    const r = await call("PUT", "/settings", owner, valid(over as any));
    expect(r.status).toBe(400);
  });

  it("accepts edge values for the WhatsApp fields", async () => {
    const { owner } = await setup("st-wa-edge");
    const edge = valid({ wa_language: "ar", wa_reminder_days: 90, wa_reminder_hour: 0, wa_feedback_delay_min: 0, wa_feedback_reminder_min: 1440, wa_rating_image_url: "https://x.y/" + "a".repeat(488), wa_fresh_cut_image_url: null, wa_bill_template: "a".repeat(64) });
    const r = await call("PUT", "/settings", owner, edge);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ wa_language: "ar", wa_reminder_days: 90, wa_rating_image_url: edge.wa_rating_image_url, wa_fresh_cut_image_url: null });
  });

  it("GET has the SalonStation WhatsApp defaults and wa_ready", async () => {
    const { owner } = await setup("st-wa-def");
    const b: any = await (await call("GET", "/settings", owner)).json();
    expect(b).toMatchObject({
      wa_bill_auto: false, wa_bill_template: "ss_bill", wa_bill_pdf_template: "ss_bill_pdf", wa_reminder_enabled: false, wa_reminder_days: 15, wa_reminder_hour: 11,
      wa_reminder_template: "ss_fresh_cut", wa_language: "en", wa_feedback_enabled: false, wa_feedback_delay_min: 0, wa_feedback_template: "ss_rating",
      wa_feedback_reminder_min: 120, wa_feedback_reminder_template: "ss_rating_reminder", wa_rating_image_url: null, wa_rating_reminder_image_url: null, wa_fresh_cut_image_url: null,
      wa_ready: false,
    });
  });

  it("wa_ready needs both the whatsapp feature and an org_whatsapp row", async () => {
    const waRow = (orgId: string) =>
      env.DB.prepare("INSERT INTO org_whatsapp(org_id, phone_number_id, waba_id, token_enc, updated_at) VALUES(?,?,?,?,?)").bind(orgId, `pn-${orgId}`, "w", "v1.x.y", 1).run();
    const ready = async (ck: string) => ((await (await call("GET", "/settings", ck)).json()) as any).wa_ready;
    const pm = await setup("st-wa-pm", "pro_max");
    expect(await ready(pm.owner)).toBe(false); // feature, no row
    await waRow(pm.org.id);
    expect(await ready(pm.owner)).toBe(true);
    expect(((await (await call("PUT", "/settings", pm.owner, valid())).json()) as any).wa_ready).toBe(true);
    const fr = await setup("st-wa-free");
    await waRow(fr.org.id);
    expect(await ready(fr.owner)).toBe(false); // row, no feature
  });

  it("currency: AED to INR is fine, AED to JPY (different decimals) is 400", async () => {
    const { owner } = await setup("st-cur");
    expect((await call("PUT", "/settings", owner, valid({ currency: "INR" }))).status).toBe(200);
    const r = await call("PUT", "/settings", owner, valid({ currency: "JPY" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "That currency uses different decimals; contact support to change it" });
  });

  it("canonicalizes timezone and locale; rejects a bad locale", async () => {
    const { owner } = await setup("st-canon");
    const r = await call("PUT", "/settings", owner, valid({ timezone: "asia/kolkata", locale: "en-in" }));
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b.locale).toBe("en-IN");
    expect(b.timezone).toMatch(/^Asia\/(Kolkata|Calcutta)$/);
    expect((await call("PUT", "/settings", owner, valid({ locale: "not a locale!" }))).status).toBe(400);
  });

  it("accepts a free-text TRN outside the UAE", async () => {
    const { owner } = await setup("st-trn");
    const r = await call("PUT", "/settings", owner, valid({ phone_country: "91", trn: "GSTIN 27AAAPL1234C1ZV" }));
    expect(r.status).toBe(200);
  });

  it("org B's PUT does not change org A's row", async () => {
    const a = await setup("st-xa");
    const b = await setup("st-xb");
    expect((await call("PUT", "/settings", b.owner, valid({ display_name: "B Salon" }))).status).toBe(200);
    const row = await env.DB.prepare("SELECT display_name FROM org_settings WHERE org_id = ?").bind(a.org.id).first<any>();
    expect(row.display_name).toBe("st-xa");
    const rowB = await env.DB.prepare("SELECT display_name FROM org_settings WHERE org_id = ?").bind(b.org.id).first<any>();
    expect(rowB.display_name).toBe("B Salon");
  });
});

describe("password change", () => {
  it("wrong current gives 400; success invalidates the old cookie and issues a working new one", async () => {
    const { owner } = await setup("pw-a");
    const bad = await call("PUT", "/me/password", owner, { current: "nope", next: "newpass1" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Current password is wrong" });
    expect((await call("PUT", "/me/password", owner, { current: "pass1234", next: "abc" })).status).toBe(400);
    expect((await call("PUT", "/me/password", owner, { current: "pass1234", next: "x".repeat(201) })).status).toBe(400);
    const ok = await call("PUT", "/me/password", owner, { current: "pass1234", next: "newpass1" });
    expect(ok.status).toBe(200);
    const fresh = ok.headers.get("set-cookie")!.split(";")[0]!;
    expect((await call("GET", "/me", owner)).status).toBe(401);
    expect((await call("GET", "/me", fresh)).status).toBe(200);
    expect((await loginAs("pw-a", "own", "newpass1")).startsWith("ss_session=")).toBe(true);
  });
});

describe("password change throttle", () => {
  it("8 wrong current passwords from one device lock further tries with 429", async () => {
    const { owner } = await setup("pw-lock");
    for (let i = 0; i < 8; i++) expect((await call("PUT", "/me/password", owner, { current: "bad", next: "newpass1" })).status).toBe(400);
    const r = await call("PUT", "/me/password", owner, { current: "pass1234", next: "newpass1" });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "Too many attempts. Try again in a few minutes." });
  });
});

describe("/api/me today", () => {
  it("uses the org timezone", async () => {
    const { owner, org } = await setup("me-today");
    await env.DB.prepare("UPDATE org_settings SET timezone = ? WHERE org_id = ?").bind("Asia/Kolkata", org.id).run();
    // 23:00 UTC = 04:30 next day in Kolkata (day starts 04:00), 03:00 in Dubai (still the day before).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 2, 10, 23, 0));
    const b: any = await (await call("GET", "/me", owner)).json();
    expect(b.today).toBe("2026-03-11");
    expect(b.settings.timezone).toBe("Asia/Kolkata");
    expect(Object.keys(b).sort()).toEqual(["brand", "features", "limits", "org", "settings", "subscription", "today", "user"]);
    await env.DB.prepare("UPDATE org_settings SET timezone = ? WHERE org_id = ?").bind("Asia/Dubai", org.id).run();
    expect(((await (await call("GET", "/me", owner)).json()) as any).today).toBe("2026-03-10");
  });
});
