import { env } from "cloudflare:test";
import { describe, it, expect, afterEach, vi } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { fakeServices } from "./fakes";
import { countingDb } from "./counting-db";
import { invalidateFeatures } from "../src/core/features-cache";
import { setServicesForTest } from "../src/core/services";
import { waConfigRepo } from "../src/data/tenant";
import { FEEDBACK_HOURS, inFeedbackHours, runFeedback, runFeedbackReminders, runReminders } from "../src/jobs/wa-jobs";
import { visitTime } from "../src/lib/whatsapp";

const pending: Promise<unknown>[] = [];
const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
const flush = async () => { while (pending.length) await pending.shift(); };
const APP = "https://app.salonstation.test";
const E = { ...env, ROOT_DOMAIN: "", APP_ORIGIN: APP };
const TOKEN = "EAAGjobsSECRETtoken1234567890";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const call = (method: string, path: string, cookie: string, body?: unknown) =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    E,
    ctx,
  );
const json = async (r: Response): Promise<any> => r.json();

let pnid = 80000000 + Math.floor(Math.random() * 1_000_000);
async function setup(slug: string, opts: { plan?: "pro" | "pro_max"; wa?: boolean; testNumbers?: string | null } = {}) {
  const org = await makeOrg({ slug, plan: opts.plan ?? "pro_max" });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  if (opts.wa !== false) {
    await waConfigRepo(env.DB, org.id, env.SECRETS_KEY).set(
      { phoneNumberId: String(++pnid), wabaId: "123456789", token: TOKEN, testNumbers: opts.testNumbers ?? null },
      { id: own.id, name: "own" },
    );
  }
  return { org, own, b1, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1") };
}
const setSettings = (orgId: string, sql: string, ...binds: unknown[]) =>
  env.DB.prepare(`UPDATE org_settings SET ${sql} WHERE org_id = ?`).bind(...binds, orgId).run();
const messages = async (orgId: string) =>
  (await env.DB.prepare("SELECT * FROM wa_messages WHERE org_id = ? ORDER BY id").bind(orgId).all<any>()).results;
let phoneN = 1_000_000;
const nextPhone = () => `05${String(++phoneN).padStart(8, "0")}`;
const newSale = async (cookie: string, body: Record<string, unknown> = {}) => {
  const r = await call("POST", "/sales", cookie, { amount: 25, payment_mode: "cash", customer_name: "Ali Khan", customer_phone: nextPhone(), ...body });
  expect(r.status).toBe(201);
  return json(r);
};
const customer = async (orgId: string, phone: string, lastVisit: number, extra: { name?: string | null; opt?: number; reminded?: number | null } = {}) =>
  (await env.DB.prepare("INSERT INTO customers (org_id, name, phone, created_at, last_visit_at, wa_opt_out, wa_reminded_at) VALUES (?, ?, ?, 1, ?, ?, ?) RETURNING id")
    .bind(orgId, extra.name === undefined ? "Ravi Kumar" : extra.name, phone, lastVisit, extra.opt ?? 0, extra.reminded ?? null)
    .first<{ id: number }>())!.id;

let f = fakeServices();
const install = (opts?: Parameters<typeof fakeServices>[0]) => {
  f = fakeServices(opts);
  f.install();
  return f;
};
afterEach(async () => {
  await flush();
  setServicesForTest(null);
});

describe("runReminders (visit reminders)", () => {
  // 2026-11-20 06:00Z = 11:30 IST, business day 2026-11-20 (day starts 04:00). 15 days back: 2026-11-05,
  // which starts 2026-11-05 04:00 IST = 2026-11-04 22:30Z and ends 2026-11-06 04:00 IST.
  const at = Date.UTC(2026, 10, 20, 6, 0);
  const start = Date.UTC(2026, 10, 4, 22, 30);

  it("fires exactly wa_reminder_days business days after the last visit under the Kolkata clock", async () => {
    install();
    const a = await setup("wj-kol");
    await setSettings(a.org.id, "timezone = 'Asia/Kolkata', day_start_hour = 4, phone_country = '91', wa_reminder_days = 15, wa_language = 'en_US'");
    const first = await customer(a.org.id, "+919000000001", start, { name: "Ravi Kumar" });
    const last = await customer(a.org.id, "+919000000002", start + DAY - 60_000, { name: null });
    await customer(a.org.id, "+919000000003", start - 60_000); // business day 2026-11-04
    await customer(a.org.id, "+919000000004", start + DAY); // business day 2026-11-06
    const run = await runReminders(E, a.org.id, at, 40, { left: 40 });
    expect(run).toEqual({ due: 2, sent: 2, failed: 0, skipped: 0 });
    expect(f.wa.map((s) => s.phone)).toEqual(["+919000000001", "+919000000002"]);
    expect(f.wa[0]).toMatchObject({ template: "ss_fresh_cut", lang: "en_US" });
    expect(f.wa[0]!.params).toEqual([{ part: "header", key: "media", media: "image", text: `${APP}/wa/fresh-cut.jpg` }, "Ravi", "15"]);
    expect(f.wa[1]!.params[1]).toBe("Customer");
    const rows = await messages(a.org.id);
    expect(rows.map((r) => [r.kind, r.customer_id, r.status])).toEqual([["reminder", first, "sent"], ["reminder", last, "sent"]]);
    // Reminded since the last visit: never again.
    expect(await runReminders(E, a.org.id, at + HOUR, 40, { left: 40 })).toEqual({ due: 0, sent: 0, failed: 0, skipped: 0 });
    expect(f.wa).toHaveLength(2);
  });

  it("uses the org's fresh-cut picture and template; a failed send is retried, a test-list skip is not", async () => {
    let fail = true;
    install({ send: (s) => (s.phone === "+919000000011" && fail ? { status: "failed", error: "boom" } : { status: "sent", wa_id: "wamid.x" }) });
    const a = await setup("wj-pic", { testNumbers: "+919000000011" });
    await setSettings(a.org.id, "timezone = 'Asia/Kolkata', day_start_hour = 4, phone_country = '91', wa_reminder_days = 15, wa_reminder_template = 'fm_fresh_cut', wa_fresh_cut_image_url = 'https://cdn.test/cut.jpg'");
    await customer(a.org.id, "+919000000011", start + 1);
    await customer(a.org.id, "+919000000012", start + 2);
    expect(await runReminders(E, a.org.id, at, 40, { left: 40 })).toEqual({ due: 2, sent: 0, failed: 1, skipped: 1 });
    expect(f.wa).toHaveLength(1); // the off-list number never reaches Graph
    expect(f.wa[0]).toMatchObject({ template: "fm_fresh_cut" });
    expect((f.wa[0]!.params[0] as any).text).toBe("https://cdn.test/cut.jpg");
    expect((await messages(a.org.id)).map((r) => [r.status, r.error])).toEqual([["failed", "boom"], ["skipped", "not in test numbers"]]);
    fail = false;
    expect(await runReminders(E, a.org.id, at, 40, { left: 40 })).toEqual({ due: 1, sent: 1, failed: 0, skipped: 0 });
  });

  it("an opted-out customer is not messaged (RF3)", async () => {
    install();
    const a = await setup("wj-opt");
    await setSettings(a.org.id, "timezone = 'Asia/Kolkata', day_start_hour = 4, wa_reminder_days = 15");
    await customer(a.org.id, "+919000000021", start + 5, { opt: 1 });
    expect(await runReminders(E, a.org.id, at, 40, { left: 40 })).toEqual({ due: 0, sent: 0, failed: 0, skipped: 0 });
    expect(f.wa).toHaveLength(0);
    expect(await messages(a.org.id)).toEqual([]);
  });

  it("the budget stops at exactly N sends; the rest go out on the next run", async () => {
    install();
    const a = await setup("wj-budget");
    await setSettings(a.org.id, "timezone = 'Asia/Kolkata', day_start_hour = 4, wa_reminder_days = 15");
    for (let i = 0; i < 5; i++) await customer(a.org.id, `+91900000003${i}`, start + i);
    const budget = { left: 3 };
    const run = await runReminders(E, a.org.id, at, 40, budget);
    expect(run.sent).toBe(3);
    expect(budget.left).toBe(0);
    expect(f.wa).toHaveLength(3);
    expect(await messages(a.org.id)).toHaveLength(3);
    // An empty budget: no Graph call at all.
    expect((await runReminders(E, a.org.id, at, 40, budget)).sent).toBe(0);
    expect(f.wa).toHaveLength(3);
    expect((await runReminders(E, a.org.id, at, 40, { left: 40 })).sent).toBe(2);
    expect(f.wa).toHaveLength(5);
  });

  it("org B's due customers are never picked by org A's run; an org without whatsapp is skipped", async () => {
    install();
    const a = await setup("wj-xa");
    const b = await setup("wj-xb");
    const p = await setup("wj-xpro", { plan: "pro" });
    for (const o of [a, b, p]) {
      await setSettings(o.org.id, "timezone = 'Asia/Kolkata', day_start_hour = 4, wa_reminder_days = 15");
      await customer(o.org.id, "+919000000041", start + 1);
    }
    await runReminders(E, a.org.id, at, 40, { left: 40 });
    expect(f.wa).toHaveLength(1);
    expect(f.wa[0]!.cfg.phoneNumberId).toBe((await waConfigRepo(env.DB, a.org.id, env.SECRETS_KEY).meta())!.phoneNumberId);
    expect(await messages(b.org.id)).toEqual([]);
    const bc = await env.DB.prepare("SELECT wa_reminded_at FROM customers WHERE org_id = ?").bind(b.org.id).first<any>();
    expect(bc.wa_reminded_at).toBeNull();
    expect(await runReminders(E, p.org.id, at, 40, { left: 40 })).toEqual({ due: 0, sent: 0, failed: 0, skipped: 0 });
    expect(f.wa).toHaveLength(1);
  });
});

describe("runFeedback (rating requests)", () => {
  it("sends the picture rating template: image, name, services, barber, visit time, button token", async () => {
    install();
    const a = await setup("wj-fb");
    await setSettings(a.org.id, "timezone = 'Asia/Kolkata', locale = 'en-IN', wa_language = 'en_US'");
    const sale = await newSale(a.k1, { items: [{ name: "Haircut", price: 20, qty: 1 }, { name: "Beard", price: 5, qty: 2 }] });
    const run = await runFeedback(E, a.org.id, Date.now() + 1000, 40, { left: 40 });
    expect(run).toEqual({ due: 1, sent: 1, failed: 0, skipped: 0 });
    expect(f.wa).toHaveLength(1);
    expect(f.wa[0]).toMatchObject({ template: "ss_rating", lang: "en_US" });
    expect(f.wa[0]!.params).toEqual([
      { part: "header", key: "media", media: "image", text: `${APP}/wa/rating.jpg` },
      "Ali",
      "Haircut, Beard x2",
      "b1",
      visitTime(sale.created_at, { timezone: "Asia/Kolkata", dayStartHour: 4 }, "en-IN"),
      { part: "button", index: 0, text: sale.token },
    ]);
    const rows = await messages(a.org.id);
    expect(rows.map((r) => [r.kind, r.sale_id, r.customer_id, r.status, r.template])).toEqual([["feedback", sale.id, sale.customer_id, "sent", "ss_rating"]]);
    const s = await env.DB.prepare("SELECT wa_feedback_at FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, sale.id).first<any>();
    expect(s.wa_feedback_at).toBeGreaterThan(0);
    // Asked once.
    expect((await runFeedback(E, a.org.id, Date.now() + 2000, 40, { left: 40 })).due).toBe(0);
  });

  it("respects wa_feedback_delay_min and the org's rating picture", async () => {
    install();
    const a = await setup("wj-delay");
    await setSettings(a.org.id, "wa_feedback_delay_min = 30, wa_rating_image_url = 'https://cdn.test/r.jpg'");
    await newSale(a.k1);
    expect((await runFeedback(E, a.org.id, Date.now(), 40, { left: 40 })).due).toBe(0);
    expect((await runFeedback(E, a.org.id, Date.now() + 31 * 60_000, 40, { left: 40 })).sent).toBe(1);
    expect((f.wa[0]!.params[0] as any).text).toBe("https://cdn.test/r.jpg");
  });

  it("one rating request per customer per 20 hours", async () => {
    install();
    const a = await setup("wj-20h");
    const phone = nextPhone();
    const s1 = await newSale(a.k1, { customer_phone: phone });
    const s2 = await newSale(a.k1, { customer_phone: phone });
    // Two bills of one customer in one run: one message, the other bill marked done without one.
    expect(await runFeedback(E, a.org.id, Date.now() + 1000, 40, { left: 40 })).toEqual({ due: 2, sent: 1, failed: 0, skipped: 1 });
    expect(f.wa).toHaveLength(1);
    // A third bill within 20 hours of the request: skipped.
    const s3 = await newSale(a.k1, { customer_phone: phone });
    expect(await runFeedback(E, a.org.id, Date.now() + 1000, 40, { left: 40 })).toEqual({ due: 1, sent: 0, failed: 0, skipped: 1 });
    expect(f.wa).toHaveLength(1);
    // 21 hours later (request moved back in time), a new bill is asked again.
    await env.DB.prepare("UPDATE wa_messages SET created_at = created_at - ? WHERE org_id = ?").bind(21 * HOUR, a.org.id).run();
    const s4 = await newSale(a.k1, { customer_phone: phone });
    expect((await runFeedback(E, a.org.id, Date.now() + 1000, 40, { left: 40 })).sent).toBe(1);
    expect(f.wa).toHaveLength(2);
    const marked = await env.DB.prepare("SELECT id FROM sales WHERE org_id = ? AND wa_feedback_at IS NOT NULL ORDER BY id").bind(a.org.id).all<any>();
    expect(marked.results.map((r) => r.id)).toEqual([s1.id, s2.id, s3.id, s4.id]);
  });

  it("an opted-out customer is not messaged; a test-list miss is logged skipped without Graph (RF3)", async () => {
    install();
    const a = await setup("wj-fbopt", { testNumbers: "0509999999" });
    const sale = await newSale(a.k1);
    await env.DB.prepare("UPDATE customers SET wa_opt_out = 1 WHERE org_id = ? AND id = ?").bind(a.org.id, sale.customer_id).run();
    expect((await runFeedback(E, a.org.id, Date.now() + 1000, 40, { left: 40 })).due).toBe(0);
    await newSale(a.k1);
    const budget = { left: 40 };
    expect(await runFeedback(E, a.org.id, Date.now() + 1000, 40, budget)).toEqual({ due: 1, sent: 0, failed: 0, skipped: 1 });
    expect(budget.left).toBe(40);
    expect(f.wa).toHaveLength(0);
    expect((await messages(a.org.id)).map((r) => [r.status, r.error])).toEqual([["skipped", "not in test numbers"]]);
  });

  it("the budget stops at exactly N sends", async () => {
    install();
    const a = await setup("wj-fbbudget");
    for (let i = 0; i < 4; i++) await newSale(a.k1);
    const budget = { left: 2 };
    expect((await runFeedback(E, a.org.id, Date.now() + 1000, 40, budget)).sent).toBe(2);
    expect(budget.left).toBe(0);
    expect(f.wa).toHaveLength(2);
    expect((await runFeedback(E, a.org.id, Date.now() + 1000, 40, { left: 40 })).sent).toBe(2);
    expect(f.wa).toHaveLength(4);
  });

  it("org B's sales are never picked by org A's run, even by sale id", async () => {
    install();
    const a = await setup("wj-fbxa");
    const b = await setup("wj-fbxb");
    await newSale(a.k1);
    const sb = await newSale(b.k1);
    expect(await runFeedback(E, a.org.id, Date.now() + 1000, 1, { left: 1 }, sb.id)).toEqual({ due: 0, sent: 0, failed: 0, skipped: 0 });
    expect((await runFeedback(E, a.org.id, Date.now() + 1000, 40, { left: 40 })).sent).toBe(1);
    expect(f.wa).toHaveLength(1);
    expect(await messages(b.org.id)).toEqual([]);
    const s = await env.DB.prepare("SELECT wa_feedback_at FROM sales WHERE org_id = ? AND id = ?").bind(b.org.id, sb.id).first<any>();
    expect(s.wa_feedback_at).toBeNull();
  });
});

describe("runFeedbackReminders (the one rating reminder)", () => {
  it("is suppressed after a rating or a review click; sent once otherwise", async () => {
    install();
    const a = await setup("wj-rr");
    await setSettings(a.org.id, "wa_feedback_reminder_min = 120, wa_rating_reminder_image_url = 'https://cdn.test/rr.jpg'");
    const plain = await newSale(a.k1);
    const rated = await newSale(a.k1);
    const clicked = await newSale(a.k1);
    const t0 = Date.now() + 1000;
    expect((await runFeedback(E, a.org.id, t0, 40, { left: 40 })).sent).toBe(3);
    await env.DB.prepare("INSERT INTO ratings (org_id, sale_id, customer_id, barber_id, stars, created_at, updated_at) VALUES (?, ?, ?, ?, 4, 1, 1)")
      .bind(a.org.id, rated.id, rated.customer_id, a.b1.id)
      .run();
    await env.DB.prepare("UPDATE sales SET review_clicked_at = 1 WHERE org_id = ? AND id = ?").bind(a.org.id, clicked.id).run();
    expect((await runFeedbackReminders(E, a.org.id, t0 + 60 * 60_000, 40, { left: 40 })).due).toBe(0); // not due yet
    const run = await runFeedbackReminders(E, a.org.id, t0 + 121 * 60_000, 40, { left: 40 });
    expect(run).toEqual({ due: 1, sent: 1, failed: 0, skipped: 0 });
    const last = f.wa.at(-1)!;
    expect(last.template).toBe("ss_rating_reminder");
    expect(last.phone).toBe(plain.customer_phone);
    expect((last.params[0] as any).text).toBe("https://cdn.test/rr.jpg");
    expect(last.params.at(-1)).toEqual({ part: "button", index: 0, text: plain.token });
    expect((await runFeedbackReminders(E, a.org.id, t0 + 122 * 60_000, 40, { left: 40 })).due).toBe(0);
    const rows = await messages(a.org.id);
    expect(rows.filter((r) => r.template === "ss_rating_reminder").map((r) => [r.kind, r.sale_id])).toEqual([["feedback", plain.id]]);
  });

  it("does nothing when wa_feedback_reminder_min is 0, or with an empty budget", async () => {
    install();
    const a = await setup("wj-rr0");
    await newSale(a.k1);
    const t0 = Date.now() + 1000;
    await runFeedback(E, a.org.id, t0, 40, { left: 40 });
    const budget = { left: 0 };
    expect((await runFeedbackReminders(E, a.org.id, t0 + 200 * 60_000, 40, budget)).sent).toBe(0);
    await setSettings(a.org.id, "wa_feedback_reminder_min = 0");
    expect((await runFeedbackReminders(E, a.org.id, t0 + 200 * 60_000, 40, { left: 40 })).due).toBe(0);
    expect(f.wa).toHaveLength(1);
  });
});

describe("FEEDBACK_HOURS in the org's local hour", () => {
  it("9 to 22 local", () => {
    expect(FEEDBACK_HOURS).toEqual({ from: 9, to: 22 });
    const kol = { timezone: "Asia/Kolkata", day_start_hour: 4 };
    expect(inFeedbackHours(Date.UTC(2026, 10, 20, 3, 29), kol)).toBe(false); // 08:59 IST
    expect(inFeedbackHours(Date.UTC(2026, 10, 20, 3, 30), kol)).toBe(true); // 09:00 IST
    expect(inFeedbackHours(Date.UTC(2026, 10, 20, 16, 29), kol)).toBe(true); // 21:59 IST
    expect(inFeedbackHours(Date.UTC(2026, 10, 20, 16, 30), kol)).toBe(false); // 22:00 IST
  });
});

describe("inline rating request after a sale (wa_feedback_delay_min = 0)", () => {
  it("sends the rating request for that sale right after it is rung up", async () => {
    install();
    const a = await setup("wj-inline");
    await setSettings(a.org.id, "wa_feedback_enabled = 1, wa_feedback_delay_min = 0");
    const old = await newSale(a.k1);
    await flush();
    const sale = await newSale(a.k1);
    await flush();
    expect(f.wa.map((s) => s.template)).toEqual(["ss_rating", "ss_rating"]);
    expect((f.wa[1]!.params.at(-1) as any).text).toBe(sale.token);
    expect((await messages(a.org.id)).map((r) => r.sale_id)).toEqual([old.id, sale.id]);
  });

  it("not when feedback is off, the delay is set, or the org isn't WA-ready", async () => {
    install();
    const off = await setup("wj-inl-off");
    await newSale(off.k1);
    const delayed = await setup("wj-inl-delay");
    await setSettings(delayed.org.id, "wa_feedback_enabled = 1, wa_feedback_delay_min = 30");
    await newSale(delayed.k1);
    const unset = await setup("wj-inl-unset", { wa: false });
    await setSettings(unset.org.id, "wa_feedback_enabled = 1, wa_feedback_delay_min = 0");
    await newSale(unset.k1);
    await flush();
    expect(f.wa).toHaveLength(0);
  });
});

describe("POST /api/wa/reminders/run and /api/wa/feedback/run", () => {
  it("admin only, feature whatsapp, 409 wa_not_ready", async () => {
    install();
    const a = await setup("wj-r-auth");
    expect((await call("POST", "/wa/reminders/run", a.k1)).status).toBe(403);
    expect((await call("POST", "/wa/feedback/run", a.k1)).status).toBe(403);
    const p = await setup("wj-r-pro", { plan: "pro" });
    expect((await call("POST", "/wa/reminders/run", p.ck)).status).toBe(403);
    const u = await setup("wj-r-unset", { wa: false });
    for (const path of ["/wa/reminders/run", "/wa/feedback/run"]) {
      const r = await call("POST", path, u.ck);
      expect(r.status).toBe(409);
      expect((await json(r)).code).toBe("wa_not_ready");
    }
  });

  it("reminders/run returns the tally and ignores wa_reminder_enabled (FM)", async () => {
    install();
    const a = await setup("wj-r-run");
    await setSettings(a.org.id, "wa_reminder_days = 15");
    // a customer whose last visit was 15 business days ago in the org clock (Dubai, 04:00 day start)
    const now = Date.now();
    await customer(a.org.id, "+971500000077", now - 15 * DAY);
    await customer(a.org.id, "+971500000078", now - 3 * DAY);
    const r = await call("POST", "/wa/reminders/run", a.ck);
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.sent).toBe(1);
    expect(Object.keys(body).sort()).toEqual(["due", "failed", "sent", "skipped"]);
  });

  it("feedback/run runs requests then reminders as one tally, regardless of the hour", async () => {
    install();
    const a = await setup("wj-f-run");
    const done = await newSale(a.k1);
    await runFeedback(E, a.org.id, Date.now() + 1000, 40, { left: 40 });
    await env.DB.prepare("UPDATE sales SET wa_feedback_at = wa_feedback_at - ? WHERE org_id = ? AND id = ?").bind(3 * HOUR, a.org.id, done.id).run();
    await newSale(a.k1);
    const r = await call("POST", "/wa/feedback/run", a.ck);
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ due: 2, sent: 2, failed: 0, skipped: 0 });
    expect(f.wa.map((s) => s.template)).toEqual(["ss_rating", "ss_rating", "ss_rating_reminder"]);
  });
});

/** A FakeWa whose sends wait for `open()`: lets two runs overlap before either finishes. */
function gated() {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const svc = install({ send: async () => (await gate, { status: "sent", wa_id: `wamid.g${Math.random()}` }) });
  return { svc, release: () => setTimeout(open, 150) };
}

describe("bulk claim: overlapping runs never double-send (I1)", () => {
  it("two overlapping runFeedback calls: exactly one Graph call per sale", async () => {
    const g = gated();
    const a = await setup("wj-c-fb");
    const s1 = await newSale(a.k1);
    const s2 = await newSale(a.k1);
    const at = Date.now() + 1000;
    g.release();
    const [r1, r2] = await Promise.all([runFeedback(E, a.org.id, at, 40, { left: 40 }), runFeedback(E, a.org.id, at + 1, 40, { left: 40 })]);
    expect(r1.sent + r2.sent).toBe(2);
    expect(f.wa).toHaveLength(2);
    expect(f.wa.map((s) => (s.params.at(-1) as any).text).sort()).toEqual([s1.token, s2.token].sort());
    expect((await messages(a.org.id)).length).toBe(2);
  });

  it("two overlapping runReminders calls: exactly one Graph call per customer", async () => {
    const g = gated();
    const a = await setup("wj-c-vr");
    await setSettings(a.org.id, "wa_reminder_days = 15");
    const now = Date.now();
    await customer(a.org.id, "+971500000081", now - 15 * DAY);
    await customer(a.org.id, "+971500000082", now - 15 * DAY + 1);
    g.release();
    const [r1, r2] = await Promise.all([runReminders(E, a.org.id, now, 40, { left: 40 }), runReminders(E, a.org.id, now + 1, 40, { left: 40 })]);
    expect(r1.sent + r2.sent).toBe(2);
    expect(f.wa.map((s) => s.phone).sort()).toEqual(["+971500000081", "+971500000082"]);
  });

  it("overlapping rating reminders: one per bill", async () => {
    install();
    const a = await setup("wj-c-rr");
    await newSale(a.k1);
    const t0 = Date.now() + 1000;
    await runFeedback(E, a.org.id, t0, 40, { left: 40 });
    const g = gated();
    g.release();
    const later = t0 + 121 * 60_000;
    const [r1, r2] = await Promise.all([runFeedbackReminders(E, a.org.id, later, 40, { left: 40 }), runFeedbackReminders(E, a.org.id, later + 1, 40, { left: 40 })]);
    expect(r1.sent + r2.sent).toBe(1);
    expect(g.svc.wa).toHaveLength(1);
  });

  it("two concurrent POST /api/wa/feedback/run: no duplicate sends", async () => {
    const g = gated();
    const a = await setup("wj-c-route");
    await newSale(a.k1);
    await newSale(a.k1);
    g.release();
    const [x, y] = await Promise.all([call("POST", "/wa/feedback/run", a.ck), call("POST", "/wa/feedback/run", a.ck)]);
    const [bx, by] = [await json(x), await json(y)];
    expect(bx.sent + by.sent).toBe(2);
    expect(f.wa).toHaveLength(2);
    expect(new Set(f.wa.map((s) => s.phone)).size).toBe(2);
  });

  it("a budget stop releases the unsent claims: they go out next run (feedback, reminders, rating reminders)", async () => {
    install();
    const a = await setup("wj-c-release");
    await setSettings(a.org.id, "wa_reminder_days = 15");
    for (let i = 0; i < 3; i++) await newSale(a.k1);
    const now = Date.now();
    for (let i = 0; i < 3; i++) await customer(a.org.id, `+97150000009${i}`, now - 15 * DAY + i, { reminded: 5 });
    expect((await runFeedback(E, a.org.id, now + 1000, 40, { left: 1 })).sent).toBe(1);
    const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM sales WHERE org_id = ? AND wa_feedback_at IS NULL").bind(a.org.id).first<any>();
    expect(open.n).toBe(2);
    expect((await runReminders(E, a.org.id, now, 40, { left: 1 })).sent).toBe(1);
    // released customers get their previous wa_reminded_at back
    const prev = await env.DB.prepare("SELECT COUNT(*) AS n FROM customers WHERE org_id = ? AND wa_reminded_at = 5").bind(a.org.id).first<any>();
    expect(prev.n).toBe(2);
    const t1 = now + 2000;
    expect((await runFeedback(E, a.org.id, t1, 40, { left: 40 })).sent).toBe(2);
    expect((await runReminders(E, a.org.id, now + 1, 40, { left: 40 })).sent).toBe(2);
    const later = t1 + 121 * 60_000;
    expect((await runFeedbackReminders(E, a.org.id, later, 40, { left: 1 })).sent).toBe(1);
    expect((await runFeedbackReminders(E, a.org.id, later, 40, { left: 40 })).sent).toBe(2);
    expect(f.wa).toHaveLength(9);
  });

  it("the reminder window follows the DST change (Europe/London, 25-hour business day)", async () => {
    install();
    const a = await setup("wj-dst");
    // Business day 2026-10-24 (04:00 BST = 03:00Z) runs to 2026-10-25 04:00 GMT = 04:00Z: 25 hours.
    await setSettings(a.org.id, "timezone = 'Europe/London', day_start_hour = 4, phone_country = '44', wa_reminder_days = 2");
    await customer(a.org.id, "+447700900001", Date.UTC(2026, 9, 24, 3, 0)); // first minute of 10-24
    await customer(a.org.id, "+447700900002", Date.UTC(2026, 9, 25, 3, 30)); // 03:30 GMT: still 10-24 (the 25th hour)
    await customer(a.org.id, "+447700900003", Date.UTC(2026, 9, 24, 2, 59)); // 03:59 BST: 10-23
    await customer(a.org.id, "+447700900004", Date.UTC(2026, 9, 25, 4, 0)); // 10-25
    expect((await runReminders(E, a.org.id, Date.UTC(2026, 9, 26, 12, 0), 40, { left: 40 })).sent).toBe(2);
    expect(f.wa.map((s) => s.phone)).toEqual(["+447700900001", "+447700900002"]);
  });

  it("afterSale: a throwing bill send never stops the inline rating request", async () => {
    install({ send: (s) => { if (s.template === "ss_bill") throw new Error("graph down"); return { status: "sent", wa_id: "wamid.r" }; } });
    const a = await setup("wj-legs");
    await setSettings(a.org.id, "wa_bill_auto = 1, wa_feedback_enabled = 1, wa_feedback_delay_min = 0");
    const sale = await newSale(a.k1);
    await flush();
    expect(f.wa.map((s) => s.template).sort()).toEqual(["ss_bill", "ss_rating"]);
    expect((await messages(a.org.id)).map((r) => [r.kind, r.sale_id])).toEqual([["feedback", sale.id]]);
  });
});

describe("I2: manual job runs on the free-plan budget (45 statements, 40 subrequests)", () => {
  /** One request on a cold features cache with every D1 statement counted. */
  const counted = async (path: string, cookie: string, orgId: string) => {
    invalidateFeatures(orgId);
    const { db, count } = countingDb(env.DB);
    const res = await app.fetch(new Request(`https://x.test/api${path}`, { method: "POST", headers: { cookie } }), { ...E, DB: db }, ctx);
    return { res, count };
  };
  /** `n` bills of customer phones +97155xxxxxxx made `ago` ms before now, due a rating request. */
  const dueSales = async (orgId: string, barberId: number, n: number, ago: number) => {
    await env.DB.prepare(
      `INSERT INTO customers (org_id, name, phone, created_at)
       WITH RECURSIVE k(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM k WHERE i < ?2) SELECT ?1, 'Cust ' || i, '+97155' || printf('%07d', i), 1 FROM k`,
    ).bind(orgId, n).run();
    await env.DB.prepare(
      `INSERT INTO sales (org_id, bill_no, token, day, barber_id, customer_id, customer_label, amount, payment_mode, commission_pct, commission, vat_rate, vat_amount, created_by, created_at, updated_at)
       SELECT ?1, 'B-' || c.id, 'tok' || c.id || 'x' || hex(randomblob(4)), '2026-11-01', ?2, c.id, c.name, 100, 'cash', 40, 40, 0, 0, ?2, ?3, ?3
       FROM customers c WHERE c.org_id = ?1`,
    ).bind(orgId, barberId, Date.now() - ago).run();
  };

  it("/wa/reminders/run: 45 due customers, every send failing, stays within 45 statements and leaves the rest due", async () => {
    install({ send: () => ({ status: "failed", error: "boom" }) });
    const a = await setup("wj-i2-rem");
    await setSettings(a.org.id, "wa_reminder_days = 15");
    const now = Date.now();
    for (let i = 0; i < 45; i++) await customer(a.org.id, `+9715000${String(i).padStart(5, "0")}`, now - 15 * DAY + i);
    const { res, count } = await counted("/wa/reminders/run", a.ck, a.org.id);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.failed).toBeGreaterThan(0);
    expect(body.failed).toBe(f.wa.length);
    expect(count.statements, `D1 statements (round trips: ${count.calls})`).toBeLessThanOrEqual(45);
    expect(f.wa.length).toBeLessThanOrEqual(40);
    // A failed reminder is released (FM retries it); none is stranded under a claim.
    const claimed = await env.DB.prepare("SELECT COUNT(*) AS n FROM customers WHERE org_id = ? AND wa_reminded_at IS NOT NULL").bind(a.org.id).first<any>();
    expect(claimed.n).toBe(0);
  });

  it("/wa/reminders/run: all succeeding, the statement cap still holds and later runs send the rest", async () => {
    install();
    const a = await setup("wj-i2-rem-ok");
    await setSettings(a.org.id, "wa_reminder_days = 15");
    const now = Date.now();
    for (let i = 0; i < 45; i++) await customer(a.org.id, `+9715001${String(i).padStart(5, "0")}`, now - 15 * DAY + i);
    let sent = 0;
    for (let run = 0; run < 4 && sent < 45; run++) {
      const { res, count } = await counted("/wa/reminders/run", a.ck, a.org.id);
      expect(count.statements, `run ${run}: D1 statements (round trips: ${count.calls})`).toBeLessThanOrEqual(45);
      sent += (await json(res)).sent;
    }
    expect(sent).toBe(45);
    expect(new Set(f.wa.map((s) => s.phone)).size).toBe(45);
  });

  it("/wa/feedback/run: 45 due rating requests, failing or not, stays within 45 statements; unreached bills stay due", async () => {
    for (const mode of ["failed", "sent"] as const) {
      install({ send: () => (mode === "failed" ? { status: "failed", error: "boom" } : { status: "sent", wa_id: `wamid.${Math.random()}` }) });
      const a = await setup(`wj-i2-fb-${mode}`);
      await dueSales(a.org.id, a.b1.id, 45, 60_000);
      const { res, count } = await counted("/wa/feedback/run", a.ck, a.org.id);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body[mode]).toBeGreaterThan(0);
      expect(count.statements, `${mode}: D1 statements (round trips: ${count.calls})`).toBeLessThanOrEqual(45);
      expect(f.wa.length).toBeLessThanOrEqual(40);
      // Bills not reached are still due (not stranded under a claim): the next run picks them up.
      const asked = await env.DB.prepare("SELECT COUNT(*) AS n FROM sales WHERE org_id = ? AND wa_feedback_at IS NOT NULL").bind(a.org.id).first<any>();
      expect(asked.n).toBe(f.wa.length);
    }
  });
});

describe("I4: a sale with every hook on stays within the free plan (45 statements, 40 subrequests)", () => {
  const FCM = { FCM_SERVICE_ACCOUNT: "{\"fake\":true}" };
  /** One request plus all its waitUntil work (hooks, stats), every D1 statement counted, on a cold features cache. */
  const counted = async (method: string, path: string, cookie: string, orgId: string, body: unknown) => {
    await flush();
    invalidateFeatures(orgId);
    const { db, count } = countingDb(env.DB);
    const before = { wa: f.wa.length, push: f.pushes.length };
    const res = await app.fetch(
      new Request(`https://x.test/api${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }),
      { ...E, ...FCM, DB: db },
      ctx,
    );
    await flush();
    const pushes = f.pushes.slice(before.push);
    // Outbound: one Graph call per WhatsApp send; FCM one per token plus the OAuth token call.
    const subrequests = f.wa.length - before.wa + pushes.reduce((n, p) => n + p.tokens.length + 1, 0);
    return { res, count, subrequests, pushes };
  };
  const tokens = async (orgId: string, userId: number, n: number) =>
    env.DB.prepare(
      `INSERT INTO push_tokens (token, org_id, user_id, created_at, updated_at)
       WITH RECURSIVE k(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM k WHERE i < ?3) SELECT ?1 || '-tok-' || i, ?1, ?2, 1, i FROM k`,
    ).bind(orgId, userId, n).run();
  const items = async (ck: string) => {
    const svc = await json(await call("POST", "/services", ck, { category: "Cuts", name: "Cut", price: 20 }));
    return Array.from({ length: 30 }, (_, i) => (i % 2 ? { service_id: svc.id, qty: 2 } : { name: `Extra ${i}`, price: 5, qty: 1 }));
  };

  it("POST /sales: 30 items, bill + inline rating + push (45 admin devices), walk-in phone: <= 45 statements, <= 40 subrequests", async () => {
    install();
    const a = await setup("wj-i4-new");
    await setSettings(a.org.id, "wa_bill_auto = 1, wa_feedback_enabled = 1, wa_feedback_delay_min = 0, notify_sales = 1, notify_sale_min = 0");
    await tokens(a.org.id, a.own.id, 45);
    const body = { payment_mode: "cash", customer_phone: nextPhone(), items: await items(a.ck) };
    const { res, count, subrequests, pushes } = await counted("POST", "/sales", a.k1, a.org.id, body);
    expect(res.status).toBe(201);
    // Bill, then the rating request, then the push (M4 order), all three done.
    expect(f.wa.map((s) => s.template)).toEqual(["ss_bill", "ss_rating"]);
    expect(pushes).toHaveLength(1);
    expect(count.statements, `D1 statements (round trips: ${count.calls})`).toBeLessThanOrEqual(45);
    expect(subrequests).toBeLessThanOrEqual(40);
    const sale = await json(res);
    expect(sale.items).toHaveLength(30);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sale_items WHERE org_id = ? AND sale_id = ?").bind(a.org.id, sale.id).first<any>();
    expect(n.n).toBe(30);
    expect((await messages(a.org.id)).map((m) => [m.kind, m.status])).toEqual([["bill", "sent"], ["feedback", "sent"]]);
  });

  it("PUT /sales/:id: 30 items by the admin with the barber-change push on (45 devices): <= 45 statements, <= 40 subrequests", async () => {
    install();
    const a = await setup("wj-i4-edit");
    await setSettings(a.org.id, "notify_barber_changes = 1");
    await tokens(a.org.id, a.b1.id, 45);
    const sale = await newSale(a.k1);
    const body = { payment_mode: "card", customer_phone: nextPhone(), items: await items(a.ck) };
    const { res, count, subrequests, pushes } = await counted("PUT", `/sales/${sale.id}`, a.ck, a.org.id, body);
    expect(res.status).toBe(200);
    expect((await json(res)).items).toHaveLength(30);
    expect(pushes).toHaveLength(1);
    expect(count.statements, `D1 statements (round trips: ${count.calls})`).toBeLessThanOrEqual(45);
    expect(subrequests).toBeLessThanOrEqual(40);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sale_items WHERE org_id = ? AND sale_id = ?").bind(a.org.id, sale.id).first<any>();
    expect(n.n).toBe(30);
  });
});

describe("M4: afterSale runs bill, then the rating request, then the push, each isolated", () => {
  const FCM = { FCM_SERVICE_ACCOUNT: "{\"fake\":true}" };
  const sale = async (cookie: string) => {
    const r = await app.fetch(
      new Request("https://x.test/api/sales", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ amount: 25, payment_mode: "cash", customer_name: "Ali Khan", customer_phone: nextPhone() }),
      }),
      { ...E, ...FCM },
      ctx,
    );
    expect(r.status).toBe(201);
    await flush();
  };
  const ordered = (sendFails: boolean) => {
    const log: string[] = [];
    const svc = install({
      send: async (x) => {
        log.push(`start ${x.template}`);
        await new Promise((r) => setTimeout(r, 40));
        log.push(`end ${x.template}`);
        if (sendFails && x.template === "ss_bill") throw new Error("graph down");
        return { status: "sent", wa_id: `wamid.${Math.random()}` };
      },
    });
    const push = svc.services.push.send;
    svc.services.push.send = async (...a) => (log.push("push"), push(...a));
    return log;
  };
  const tokenFor = (orgId: string, userId: number) =>
    env.DB.prepare("INSERT INTO push_tokens (token, org_id, user_id, created_at, updated_at) VALUES (?, ?, ?, 1, 1)").bind(`${orgId}-t`, orgId, userId).run();

  it("the rating request starts only after the bill send finished; the push comes last", async () => {
    const log = ordered(false);
    const a = await setup("wj-m4-order");
    await setSettings(a.org.id, "wa_bill_auto = 1, wa_feedback_enabled = 1, wa_feedback_delay_min = 0, notify_sales = 1, notify_sale_min = 0");
    await tokenFor(a.org.id, a.own.id);
    await sale(a.k1);
    expect(log).toEqual(["start ss_bill", "end ss_bill", "start ss_rating", "end ss_rating", "push"]);
  });

  it("a throwing bill send stops neither the rating request nor the push", async () => {
    const log = ordered(true);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = await setup("wj-m4-iso");
    await setSettings(a.org.id, "wa_bill_auto = 1, wa_feedback_enabled = 1, wa_feedback_delay_min = 0, notify_sales = 1, notify_sale_min = 0");
    await tokenFor(a.org.id, a.own.id);
    await sale(a.k1);
    expect(log).toEqual(["start ss_bill", "end ss_bill", "start ss_rating", "end ss_rating", "push"]);
    expect(err.mock.calls.some((c) => /afterSale hook failed/.test(String(c[0])))).toBe(true);
    err.mockRestore();
  });
});

describe("M8: rating requests need the ratings feature", () => {
  const ratingsOff = async (orgId: string) => {
    await env.DB.prepare("INSERT INTO org_feature_overrides (org_id, feature_key, enabled, set_at) VALUES (?, 'ratings', 0, 1)").bind(orgId).run();
    invalidateFeatures(orgId);
  };
  it("no inline rating request after a sale when ratings is off (the bill still goes)", async () => {
    install();
    const a = await setup("wj-m8-inline");
    await setSettings(a.org.id, "wa_bill_auto = 1, wa_feedback_enabled = 1, wa_feedback_delay_min = 0");
    await ratingsOff(a.org.id);
    await newSale(a.k1);
    await flush();
    expect(f.wa.map((s) => s.template)).toEqual(["ss_bill"]);
  });
  it("/wa/feedback/run sends no rating request or reminder when ratings is off", async () => {
    install();
    const a = await setup("wj-m8-run");
    await ratingsOff(a.org.id);
    await newSale(a.k1);
    const r = await call("POST", "/wa/feedback/run", a.ck);
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ due: 0, sent: 0, failed: 0, skipped: 0 });
    expect(f.wa).toHaveLength(0);
  });
});
