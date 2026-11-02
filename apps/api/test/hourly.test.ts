import { env } from "cloudflare:test";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import worker from "../src/index";
import { makeOrg, makeUser } from "./helpers";
import { fakeServices, type WaSend } from "./fakes";
import { countingDb } from "./counting-db";
import { setServicesForTest } from "../src/core/services";
import { invalidateFeatures } from "../src/core/features-cache";
import { reportsRepo, waConfigRepo } from "../src/data/tenant";
import type { OrgStatus } from "../src/data/platform";
import { CRON_BUDGET, CRON_STMTS, hourly, rotationStart, tickIndex } from "../src/jobs/hourly";
import { moneyText } from "../src/lib/money";
import { meteredEnv } from "../src/lib/metered";

const E = { ...env, ROOT_DOMAIN: "", APP_ORIGIN: "https://app.salonstation.test", FCM_SERVICE_ACCOUNT: "fake-fcm-account" };
const TOKEN = "EAAGcronSECRETtoken1234567890";
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const TICK = 10 * MIN;

let f = fakeServices();
const install = (opts?: Parameters<typeof fakeServices>[0]) => {
  f = fakeServices(opts);
  f.install();
  return f;
};

// Storage is shared by the tests of one file: retire every org left by an earlier test so each cron sees only its own.
beforeEach(async () => {
  await env.DB.prepare("UPDATE orgs SET status = 'deleted'").run();
});
afterEach(() => {
  setServicesForTest(null);
  vi.useRealTimers();
});

let pnid = 70000000 + Math.floor(Math.random() * 1_000_000);
let seq = 0;
async function salon(slug: string, opts: { plan?: "free" | "pro" | "pro_max"; wa?: boolean; status?: OrgStatus; tz?: string } = {}) {
  const org = await makeOrg({ slug, plan: opts.plan ?? "pro_max", status: opts.status ?? "active" });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const phoneNumberId = String(++pnid);
  if (opts.wa !== false) {
    await waConfigRepo(env.DB, org.id, env.SECRETS_KEY).set({ phoneNumberId, wabaId: "123456789", token: TOKEN, testNumbers: null }, { id: own.id, name: "own" });
  }
  // Nothing on by default, so each test turns on exactly what it measures.
  await set(org.id, "notify_summary = 0, notify_reminder = 0, wa_reminder_enabled = 0, wa_feedback_enabled = 0, timezone = ?", opts.tz ?? "Asia/Dubai");
  invalidateFeatures(org.id);
  return { org, own, b1, phoneNumberId };
}
const set = (orgId: string, sql: string, ...binds: unknown[]) =>
  env.DB.prepare(`UPDATE org_settings SET ${sql} WHERE org_id = ?`).bind(...binds, orgId).run();
/** `n` customers whose last visit was 15 days (the default wa_reminder_days) before `at`: due a visit reminder at `at`. */
async function dueReminders(orgId: string, n: number, at: number) {
  await set(orgId, "wa_reminder_enabled = 1, wa_reminder_hour = 0");
  for (let i = 0; i < n; i++) {
    await env.DB.prepare("INSERT INTO customers (org_id, name, phone, created_at, last_visit_at) VALUES (?, ?, ?, 1, ?)")
      .bind(orgId, `Cust ${i}`, `+9715${String(++seq).padStart(8, "0")}`, at - 15 * DAY)
      .run();
  }
}
async function sale(orgId: string, barberId: number, day: string, amount: number, opts: { customerId?: number; createdAt?: number; commission?: number } = {}) {
  const n = ++seq;
  await env.DB.prepare(
    `INSERT INTO sales (org_id, bill_no, token, day, barber_id, customer_id, customer_label, amount, payment_mode, commission_pct, commission, vat_rate, vat_amount, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Walk-in', ?, 'cash', 40, ?, 0, 0, ?, ?, ?)`,
  )
    .bind(orgId, `B-${n}`, `tok${n}x${Math.random().toString(36).slice(2)}`, day, barberId, opts.customerId ?? null, amount, opts.commission ?? Math.round(amount * 0.4), barberId, opts.createdAt ?? 1, opts.createdAt ?? 1)
    .run();
}
const token = (orgId: string, userId: number, t: string) =>
  env.DB.prepare("INSERT INTO push_tokens (token, org_id, user_id, created_at, updated_at) VALUES (?, ?, ?, 1, 1)").bind(t, orgId, userId).run();
const sendsBy = (sends: WaSend[], phoneNumberId: string) => sends.filter((s) => s.cfg.phoneNumberId === phoneNumberId).length;
/** One cron invocation at `at`, with every D1 statement counted by an independent proxy. */
async function tick(at: number) {
  vi.setSystemTime(at);
  const { db, count } = countingDb(env.DB);
  const before = f.wa.length;
  const pushesBefore = f.pushes.length;
  const r = await hourly({ ...E, DB: db }, at);
  const pushes = f.pushes.slice(pushesBefore).filter((p) => p.tokens.length);
  const pushTokens = pushes.reduce((n, p) => n + p.tokens.length, 0);
  // The cron's own meter is exact: it agrees with the independent counting proxy below it, every tick.
  expect(CRON_STMTS - r.stmtsLeft, "meter vs counting proxy").toBe(count.statements);
  // R4 accounting: every WA send, every FCM token, and one OAuth call per push that had tokens.
  const subrequests = f.wa.length - before + pushTokens + pushes.length;
  expect(CRON_BUDGET - r.budgetLeft, "subrequests vs budget").toBe(subrequests);
  return { r, statements: count.statements, sends: f.wa.length - before, pushTokens, subrequests };
}

describe("hourly cron: per-org schedule", () => {
  it("Dubai and Kolkata summaries arrive at their own local 23:00, once each, across ticks of that hour (RF2)", async () => {
    install();
    const dxb = await salon("cr-dxb", { plan: "pro", wa: false, tz: "Asia/Dubai" });
    const kol = await salon("cr-kol", { plan: "pro", wa: false, tz: "Asia/Kolkata" });
    for (const s of [dxb, kol]) {
      await set(s.org.id, "notify_summary = 1, summary_hour = 23");
      await token(s.org.id, s.own.id, `tok-${s.org.slug}`);
    }
    await set(kol.org.id, "currency = 'INR', locale = 'en-IN'");
    await sale(dxb.org.id, dxb.b1.id, "2026-11-20", 2500, { commission: 1000 });
    await sale(dxb.org.id, dxb.own.id, "2026-11-20", 5000, { commission: 2000 });
    await env.DB.prepare("INSERT INTO company_expenses (org_id, uid, day, amount, note, created_by, created_at, updated_at) VALUES (?, 'ce1', '2026-11-20', 700, 'rent', ?, 1, 1)")
      .bind(dxb.org.id, dxb.own.id)
      .run();
    await env.DB.prepare("INSERT INTO expenses (org_id, barber_id, day, amount, note, created_at, updated_at) VALUES (?, ?, '2026-11-20', 300, 'tea', 1, 1)")
      .bind(dxb.org.id, dxb.b1.id)
      .run();

    // 17:30Z = 23:00 IST (21:30 Dubai); 19:00Z = 23:00 Dubai (00:30 IST, the "late" hour for Kolkata).
    const ticks = [Date.UTC(2026, 10, 20, 17, 20), Date.UTC(2026, 10, 20, 17, 30), Date.UTC(2026, 10, 20, 17, 40), Date.UTC(2026, 10, 20, 18, 50), Date.UTC(2026, 10, 20, 19, 0), Date.UTC(2026, 10, 20, 19, 10), Date.UTC(2026, 10, 20, 20, 10)];
    const seen: [number, string[]][] = [];
    for (const at of ticks) {
      const n = f.pushes.length;
      await tick(at);
      seen.push([at, f.pushes.slice(n).map((p) => p.tokens[0]!)]);
    }
    expect(seen).toEqual([
      [ticks[0], []],
      [ticks[1], ["tok-cr-kol"]],
      [ticks[2], []],
      [ticks[3], []],
      [ticks[4], ["tok-cr-dxb"]],
      [ticks[5], []],
      [ticks[6], []],
    ]);

    // FM's text, money in each org's currency, and the feed row next to the push.
    const sd = { currency: "AED", currency_minor: 100, locale: "en-AE" };
    const sum = await reportsRepo(env.DB, dxb.org.id).daySummary("2026-11-20");
    expect(sum).toMatchObject({ sales: 7500, count: 2, commission: 3000, expense: 1000, profit: 3500 });
    const dxbPush = f.pushes.find((p) => p.tokens[0] === "tok-cr-dxb")!.push;
    expect(dxbPush).toMatchObject({
      title: `Today: ${moneyText(7500, sd)} · 2 customers`,
      body: `Profit ${moneyText(sum.profit, sd)} · expense ${moneyText(sum.expense, sd)} · commission ${moneyText(3000, sd)} · top: own ${moneyText(5000, sd)}`,
      path: "/",
      tag: "summary-2026-11-20",
    });
    const kolPush = f.pushes.find((p) => p.tokens[0] === "tok-cr-kol")!.push;
    expect(kolPush.title).toBe(`Today: ${moneyText(0, { currency: "INR", currency_minor: 100, locale: "en-IN" })} · 0 customers`);
    expect(kolPush.body).not.toContain("top:");
    for (const s of [dxb, kol]) {
      const rows = await env.DB.prepare("SELECT user_id, title FROM notifications WHERE org_id = ?").bind(s.org.id).all<any>();
      expect(rows.results.map((r) => r.user_id)).toEqual([s.own.id]);
    }
  });

  it("the summary matches the overview report's totals for that day", async () => {
    const a = await salon("cr-ov", { plan: "pro", wa: false });
    await sale(a.org.id, a.b1.id, "2026-11-20", 4000, { commission: 1600 });
    await sale(a.org.id, a.b1.id, "2026-11-19", 900);
    await env.DB.prepare("INSERT INTO expenses (org_id, barber_id, day, amount, note, created_at, updated_at) VALUES (?, ?, '2026-11-20', 300, 'tea', 1, 1)")
      .bind(a.org.id, a.b1.id)
      .run();
    await env.DB.prepare("INSERT INTO company_expenses (org_id, uid, day, amount, note, created_at, updated_at) VALUES (?, 'ce2', '2026-11-20', 500, 'rent', 1, 1)")
      .bind(a.org.id)
      .run();
    const repo = reportsRepo(env.DB, a.org.id);
    const ov = await repo.overview(a.org.slug, { timezone: "Asia/Dubai", dayStartHour: 4 }, Date.UTC(2026, 10, 20, 12), "2026-11-20", "2026-11-20");
    const sum = await repo.daySummary("2026-11-20");
    expect(sum).toMatchObject({ sales: ov.totals.sales, count: ov.totals.count, commission: ov.totals.commission, expense: ov.totals.expense, profit: ov.totals.profit });
    expect(sum.top).toEqual({ name: "b1", sales: 4000 });
  });

  it("barber reminder: only active barbers with no sale today, once per business day, at reminder_hour", async () => {
    install();
    const a = await salon("cr-rem", { plan: "pro", wa: false });
    const b2 = await makeUser(a.org.id, { username: "b2", role: "barber" });
    const b3 = await makeUser(a.org.id, { username: "b3", role: "barber" });
    await env.DB.prepare("UPDATE users SET active = 0 WHERE org_id = ? AND id = ?").bind(a.org.id, b3.id).run();
    await set(a.org.id, "notify_reminder = 1, reminder_hour = 13");
    for (const [u, t] of [[a.b1.id, "t1"], [b2.id, "t2"], [b3.id, "t3"]] as const) await token(a.org.id, u, t);
    await sale(a.org.id, a.b1.id, "2026-11-20", 2500);
    await tick(Date.UTC(2026, 10, 20, 8, 50)); // 12:50 Dubai
    expect(f.pushes).toHaveLength(0);
    await tick(Date.UTC(2026, 10, 20, 9, 0)); // 13:00
    await tick(Date.UTC(2026, 10, 20, 10, 10)); // 14:10, the late hour: already done today
    expect(f.pushes.map((p) => [p.tokens, p.push.title, p.push.tag])).toEqual([[["t2"], "No sales logged yet today", "reminder-2026-11-20"]]);
    expect(f.pushes[0]!.push.body).toBe("Add each customer as you finish, so today's sheet stays right.");
    // Next business day it runs again.
    await tick(Date.UTC(2026, 10, 21, 9, 0));
    expect(f.pushes.map((p) => p.push.tag)).toEqual(["reminder-2026-11-20", "reminder-2026-11-21"]);
  });

  it("a push job missed in its hour still runs in the next hour (target+1), not later", async () => {
    install();
    const a = await salon("cr-late", { plan: "pro", wa: false });
    await set(a.org.id, "notify_summary = 1, summary_hour = 22");
    await token(a.org.id, a.own.id, "late");
    await tick(Date.UTC(2026, 10, 20, 19, 20)); // 23:20 Dubai: target+1
    expect(f.pushes.map((p) => p.push.tag)).toEqual(["summary-2026-11-20"]);
    const b = await salon("cr-late2", { plan: "pro", wa: false });
    await set(b.org.id, "notify_summary = 1, summary_hour = 22");
    await tick(Date.UTC(2026, 10, 20, 20, 0)); // 00:00 Dubai: two hours late, skipped
    expect(f.pushes).toHaveLength(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE org_id = ?").bind(b.org.id).first<{ n: number }>())!.n).toBe(0);
  });

  it("push jobs need the push feature (free plan: nothing)", async () => {
    install();
    const a = await salon("cr-free", { plan: "free", wa: false });
    await set(a.org.id, "notify_summary = 1, summary_hour = 23");
    await token(a.org.id, a.own.id, "free");
    await tick(Date.UTC(2026, 10, 20, 19, 0));
    expect(f.pushes).toHaveLength(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE org_id = ?").bind(a.org.id).first<{ n: number }>())!.n).toBe(0);
  });
});

describe("hourly cron: WhatsApp jobs", () => {
  it("an org without whatsapp makes no WA sends, even with a number and due work", async () => {
    install();
    const at = Date.UTC(2026, 10, 20, 8, 10);
    const pro = await salon("cr-nowa", { plan: "pro" });
    await dueReminders(pro.org.id, 3, at);
    const trial = await salon("cr-trial", { plan: "pro_max", status: "trial" });
    await dueReminders(trial.org.id, 3, at);
    const ok = await salon("cr-wa");
    await dueReminders(ok.org.id, 2, at);
    await tick(at);
    expect(sendsBy(f.wa, pro.phoneNumberId)).toBe(0);
    expect(sendsBy(f.wa, trial.phoneNumberId)).toBe(0);
    expect(sendsBy(f.wa, ok.phoneNumberId)).toBe(2);
  });

  it("expired, deactivated and deleted orgs are skipped; grace and past_due are served", async () => {
    install();
    const at = Date.UTC(2026, 10, 20, 8, 10);
    const orgs = [];
    for (const status of ["expired", "deactivated", "deleted", "grace", "past_due", "active"] as const) {
      const s = await salon(`cr-st-${status}`, { status });
      await dueReminders(s.org.id, 1, at);
      orgs.push([status, s.phoneNumberId] as const);
    }
    const { r } = await tick(at);
    expect(r.orgs).toBe(3);
    expect(orgs.map(([st, p]) => [st, sendsBy(f.wa, p)])).toEqual([
      ["expired", 0],
      ["deactivated", 0],
      ["deleted", 0],
      ["grace", 1],
      ["past_due", 1],
      ["active", 1],
    ]);
  });

  it("reminders wait for wa_reminder_hour; ratings only inside FEEDBACK_HOURS", async () => {
    install();
    const a = await salon("cr-hours");
    await dueReminders(a.org.id, 1, Date.UTC(2026, 10, 20, 3, 0));
    await set(a.org.id, "wa_reminder_hour = 11, wa_feedback_enabled = 1, wa_feedback_delay_min = 0, wa_feedback_reminder_min = 0");
    const c = await env.DB.prepare("INSERT INTO customers (org_id, name, phone, created_at) VALUES (?, 'Rated', '+971500000999', 1) RETURNING id").bind(a.org.id).first<{ id: number }>();
    await sale(a.org.id, a.b1.id, "2026-11-20", 2000, { customerId: c!.id, createdAt: Date.UTC(2026, 10, 20, 3, 0) });
    await tick(Date.UTC(2026, 10, 20, 4, 30)); // 08:30 Dubai: neither
    expect(f.wa).toHaveLength(0);
    await tick(Date.UTC(2026, 10, 20, 5, 0)); // 09:00: the rating request only
    expect(f.wa.map((s) => s.template)).toEqual(["ss_rating"]);
    await tick(Date.UTC(2026, 10, 20, 7, 0)); // 11:00: the visit reminder
    expect(f.wa.map((s) => s.template)).toEqual(["ss_rating", "ss_fresh_cut"]);
  });

  it("finishes an unfinished campaign on consecutive ticks, at most half a tick's statements per tick", async () => {
    install();
    const a = await salon("cr-camp");
    await campaign(a.org.id, 20);
    const counts = [];
    for (let k = 0; k < 3; k++) {
      const t = await tick(Date.UTC(2026, 10, 20, 8, 10 + k * 10));
      expect(t.statements - 1, "campaign statements (loader excluded)").toBeLessThanOrEqual(Math.floor(CRON_STMTS / 2));
      counts.push(f.wa.length);
    }
    expect(counts).toEqual([7, 14, 20]);
    const k = await env.DB.prepare("SELECT finished_at FROM wa_campaigns WHERE org_id = ?").bind(a.org.id).first<{ finished_at: number | null }>();
    expect(k!.finished_at).not.toBeNull();
  });

  it("a campaign needs whatsapp_campaigns (pro_max with the feature turned off: not drained)", async () => {
    install();
    const a = await salon("cr-camp-off");
    await env.DB.prepare("INSERT INTO org_feature_overrides (org_id, feature_key, enabled, set_at) VALUES (?, 'whatsapp_campaigns', 0, 1)").bind(a.org.id).run();
    invalidateFeatures(a.org.id);
    await campaign(a.org.id, 3);
    await tick(Date.UTC(2026, 10, 20, 8, 10));
    expect(f.wa).toHaveLength(0);
  });

  it("M8: rating requests and reminders need the ratings feature too (whatsapp alone: none; visit reminders still go)", async () => {
    install();
    const a = await salon("cr-no-ratings");
    await env.DB.prepare("INSERT INTO org_feature_overrides (org_id, feature_key, enabled, set_at) VALUES (?, 'ratings', 0, 1)").bind(a.org.id).run();
    invalidateFeatures(a.org.id);
    await dueReminders(a.org.id, 1, Date.UTC(2026, 10, 20, 3, 0));
    await set(a.org.id, "wa_feedback_enabled = 1, wa_feedback_delay_min = 0, wa_feedback_reminder_min = 0");
    const c = await env.DB.prepare("INSERT INTO customers (org_id, name, phone, created_at) VALUES (?, 'Rated', '+971500000998', 1) RETURNING id").bind(a.org.id).first<{ id: number }>();
    await sale(a.org.id, a.b1.id, "2026-11-20", 2000, { customerId: c!.id, createdAt: Date.UTC(2026, 10, 20, 3, 0) });
    await tick(Date.UTC(2026, 10, 20, 7, 0)); // 11:00 Dubai: inside FEEDBACK_HOURS
    expect(f.wa.map((s) => s.template)).toEqual(["ss_fresh_cut"]);
  });

  it("one org throwing does not stop the next", async () => {
    const at0 = Date.UTC(2026, 10, 20, 8, 10);
    const bad = await salon("cr-bad");
    const good = await salon("cr-good");
    await dueReminders(bad.org.id, 1, at0);
    await dueReminders(good.org.id, 1, at0);
    install({
      send: (s) => {
        if (s.cfg.phoneNumberId === bad.phoneNumberId) throw new Error("graph exploded");
        return { status: "sent", wa_id: "wamid.ok" };
      },
    });
    // Pick the tick whose rotation visits the failing org first.
    const ids = [bad.org.id, good.org.id].sort();
    const badFirst = ids[0] === bad.org.id ? 0 : 1;
    let at = at0;
    while (rotationStart(tickIndex(at), 2) !== badFirst) at += TICK;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { r } = await tick(at);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
    expect(f.wa.map((s) => s.cfg.phoneNumberId)).toEqual([bad.phoneNumberId, good.phoneNumberId]);
    expect(r.orgs).toBe(2);
    expect((await env.DB.prepare("SELECT status FROM wa_messages WHERE org_id = ?").bind(good.org.id).all<any>()).results).toEqual([{ status: "sent" }]);
  });
});

/** A campaign with `n` queued rows (customers with phones). */
async function campaign(orgId: string, n: number) {
  const k = await env.DB.prepare(
    "INSERT INTO wa_campaigns (org_id, uid, template, language, params, total, created_at) VALUES (?, ?, 'eid_offer', 'en', '[]', ?, 1) RETURNING id",
  )
    .bind(orgId, `u${++seq}`, n)
    .first<{ id: number }>();
  for (let i = 0; i < n; i++) {
    await env.DB.prepare("INSERT INTO wa_messages (org_id, kind, phone, template, status, campaign_id, created_at) VALUES (?, 'announcement', ?, 'eid_offer', 'queued', ?, 1)")
      .bind(orgId, `+9715${String(++seq).padStart(8, "0")}`, k!.id)
      .run();
  }
  return k!.id;
}

describe("hourly cron: free-plan budget (R2)", () => {
  it("with 30 WA-ready orgs each due reminders, one tick makes at most 40 sends and at most 45 D1 statements", async () => {
    install();
    const at = Date.UTC(2026, 10, 20, 8, 0); // minute 0: prune included
    for (let i = 0; i < 30; i++) await dueReminders((await salon(`cr-b${i}`)).org.id, 3, at);
    const t = await tick(at);
    expect(t.r.orgs).toBe(30);
    expect(t.sends).toBeGreaterThan(0);
    expect(t.sends).toBeLessThanOrEqual(CRON_BUDGET);
    expect(t.statements).toBeLessThanOrEqual(CRON_STMTS);
    expect(t.r.budgetLeft).toBe(CRON_BUDGET - t.sends);
  });

  it("whatever the load (campaigns, reminders, ratings, summaries, barber reminders, 39-device orgs), a tick stays within 40 sends and 45 statements", async () => {
    install();
    const at = Date.UTC(2026, 10, 20, 8, 0); // 12:00 Dubai, inside FEEDBACK_HOURS
    const orgs = [];
    for (let i = 0; i < 12; i++) {
      const s = await salon(`cr-load${i}`);
      orgs.push(s);
      await campaign(s.org.id, 20);
      await dueReminders(s.org.id, 5, at);
      await set(s.org.id, "wa_feedback_enabled = 1, wa_feedback_delay_min = 0, notify_summary = 1, summary_hour = 12, notify_reminder = 1, reminder_hour = 12");
      for (let j = 0; j < 4; j++) {
        const c = await env.DB.prepare("INSERT INTO customers (org_id, name, phone, created_at) VALUES (?, 'R', ?, 1) RETURNING id")
          .bind(s.org.id, `+9715${String(++seq).padStart(8, "0")}`)
          .first<{ id: number }>();
        await sale(s.org.id, s.own.id, "2026-11-20", 1000, { customerId: c!.id, createdAt: at - HOUR });
      }
      for (let j = 0; j < 39; j++) await token(s.org.id, s.own.id, `o${i}-${j}`);
      for (let j = 0; j < 19; j++) await token(s.org.id, s.b1.id, `b${i}-${j}`);
    }
    // 14 ticks: the push window (12:00-13:59 local) and the first ticks after it, where WhatsApp has the budget again.
    for (let k = 0; k < 14; k++) {
      const t = await tick(at + k * TICK);
      expect(t.subrequests, `tick ${k} subrequests (OAuth counted per push)`).toBeLessThanOrEqual(CRON_BUDGET);
      expect(t.statements, `tick ${k} statements`).toBeLessThanOrEqual(CRON_STMTS);
    }
    expect(f.wa.length).toBeGreaterThan(0);
    expect(f.pushes.length).toBeGreaterThan(0);
    // A 39-device push is one 40-subrequest step (39 + OAuth): it fits a fresh budget on its own.
    expect(Math.max(...f.pushes.map((p) => p.tokens.length))).toBeLessThanOrEqual(CRON_BUDGET - 1);
  });

  it("fairness: over consecutive ticks the start rotates and every org is served within the budget-derived bound", async () => {
    install();
    const k = 2;
    const at0 = Date.UTC(2026, 10, 20, 8, 10);
    const orgs = [];
    for (let i = 0; i < 30; i++) {
      const s = await salon(`cr-f${i}`);
      await dueReminders(s.org.id, k, at0);
      orgs.push(s);
    }
    // R2 ruling bound ceil(30k/40) counts sends only; every send also costs a D1 statement (its log row) and each newly
    // served org costs 3 more (WA config, due list, claim), out of 44 statements a tick after the org load. So:
    const bound = Math.ceil((30 * (k + 3)) / (CRON_STMTS - 1)) + 1;
    const servedAt = new Map<string, number>();
    for (let n = 0; n < 30 && servedAt.size < 30; n++) {
      const t = await tick(at0 + n * TICK);
      expect(t.sends).toBeLessThanOrEqual(CRON_BUDGET);
      expect(t.statements).toBeLessThanOrEqual(CRON_STMTS);
      for (const s of orgs) if (!servedAt.has(s.org.id) && sendsBy(f.wa, s.phoneNumberId) === k) servedAt.set(s.org.id, n + 1);
    }
    expect(servedAt.size).toBe(30);
    expect(Math.max(...servedAt.values())).toBeLessThanOrEqual(bound);
    // The start rotates: consecutive ticks begin at different orgs.
    expect(rotationStart(tickIndex(at0), 30)).not.toBe(rotationStart(tickIndex(at0 + TICK), 30));
  });
});

describe("hourly cron: pruning (R5)", () => {
  it("on the minute-0 tick removes old rate_hits, login_failures and job_runs only", async () => {
    install();
    const a = await salon("cr-prune", { plan: "pro", wa: false });
    const at = Date.UTC(2026, 10, 20, 8, 0);
    const minute = Math.floor(at / MIN);
    const login = Math.floor(at / (15 * MIN));
    const ins = (key: string, w: number) => env.DB.prepare("INSERT INTO rate_hits (key, window, n) VALUES (?, ?, 1)").bind(key, w).run();
    await ins("pub:old", minute - 6);
    await ins("pub:edge", minute - 5);
    await ins("pub:new", minute);
    await ins("login-ip:old", login - 2); // ended 15 minutes ago
    await ins("login-ip:recent", login - 1); // ended just now: kept (still within 5 minutes)
    await ins("login-ip:new", login);
    const lf = (k: string, t: number) => env.DB.prepare("INSERT INTO login_failures (org_id, key, at) VALUES (?, ?, ?)").bind(a.org.id, k, t).run();
    await lf("old", at - DAY - 1);
    await lf("new", at - DAY + MIN);
    const jr = (job: string, t: number) => env.DB.prepare("INSERT INTO job_runs (org_id, job, day, created_at) VALUES (?, ?, '2026-11-01', ?)").bind(a.org.id, job, t).run();
    await jr("old", at - 7 * DAY - 1);
    await jr("new", at - 6 * DAY);

    await tick(at + 10 * MIN); // not minute 0: nothing pruned
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_hits").first<{ n: number }>())!.n).toBe(6);

    await tick(at);
    const keys = (await env.DB.prepare("SELECT key FROM rate_hits ORDER BY key").all<{ key: string }>()).results.map((r) => r.key);
    expect(keys).toEqual(["login-ip:new", "login-ip:recent", "pub:edge", "pub:new"]);
    expect((await env.DB.prepare("SELECT key FROM login_failures WHERE org_id = ?").bind(a.org.id).all<any>()).results).toEqual([{ key: "new" }]);
    expect((await env.DB.prepare("SELECT job FROM job_runs WHERE org_id = ?").bind(a.org.id).all<any>()).results).toEqual([{ job: "new" }]);
  });
});

describe("scheduled entry", () => {
  it("export default has fetch and scheduled; scheduled hands hourly(scheduledTime) to waitUntil", async () => {
    install();
    const a = await salon("cr-entry");
    const at = Date.UTC(2026, 10, 20, 8, 10);
    await dueReminders(a.org.id, 1, at);
    vi.setSystemTime(at);
    expect(typeof (worker as any).fetch).toBe("function");
    const waits: Promise<unknown>[] = [];
    await (worker as any).scheduled({ scheduledTime: at, cron: "*/10 * * * *" }, E, { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} });
    expect(waits).toHaveLength(1);
    await waits[0];
    expect(sendsBy(f.wa, a.phoneNumberId)).toBe(1);
    const res = await (worker as any).fetch(new Request("https://x.test/api/health"), E, { waitUntil() {}, passThroughOnException() {} });
    expect(res.status).toBe(200);
  });
});

describe("hourly cron: fix round 1 (rotation, failed sends, big pushes, fail-closed meter)", () => {
  it("n = 7: a 1000-recipient campaign in the first org never starves the other six; all get their reminders within 7 ticks", async () => {
    install();
    const at0 = Date.UTC(2026, 10, 20, 8, 10);
    const orgs = [];
    for (let i = 0; i < 7; i++) orgs.push(await salon(`cr-seven${i}`));
    orgs.sort((a, b) => (a.org.id < b.org.id ? -1 : 1));
    const [big, ...rest] = orgs;
    await env.DB.prepare(
      `INSERT INTO wa_campaigns (org_id, uid, template, language, params, total, created_at) VALUES (?, 'big', 'eid_offer', 'en', '[]', 1000, 1)`,
    )
      .bind(big!.org.id)
      .run();
    await env.DB.prepare(
      `INSERT INTO wa_messages (org_id, kind, phone, template, status, campaign_id, created_at)
       WITH RECURSIVE k(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM k WHERE i < 1000)
       SELECT ?1, 'announcement', '+97158' || printf('%07d', i), 'eid_offer', 'queued', (SELECT id FROM wa_campaigns WHERE org_id = ?1 AND uid = 'big'), 1 FROM k`,
    )
      .bind(big!.org.id)
      .run();
    for (const s of rest) await dueReminders(s.org.id, 2, at0);
    // Start at the tick where the campaign org leads, the worst case for the others.
    let at = at0;
    while (rotationStart(tickIndex(at), 7) !== 0) at += TICK;
    for (let k = 0; k < 7; k++) {
      const t = await tick(at + k * TICK);
      expect(t.statements).toBeLessThanOrEqual(CRON_STMTS);
      expect(t.subrequests).toBeLessThanOrEqual(CRON_BUDGET);
    }
    expect(rest.map((s) => sendsBy(f.wa, s.phoneNumberId))).toEqual([2, 2, 2, 2, 2, 2]);
    expect(sendsBy(f.wa, big!.phoneNumberId)).toBeGreaterThan(0);
  });

  it("failed sends (2 statements each for visit reminders) keep every tick within 45 statements and 40 sends", async () => {
    install({ send: () => ({ status: "failed", error: "graph down" }) });
    const at = Date.UTC(2026, 10, 20, 8, 0);
    for (let i = 0; i < 20; i++) {
      const s = await salon(`cr-fail${i}`);
      await dueReminders(s.org.id, 6, at);
      await set(s.org.id, "wa_feedback_enabled = 1, wa_feedback_delay_min = 0");
      const c = await env.DB.prepare("INSERT INTO customers (org_id, name, phone, created_at) VALUES (?, 'R', ?, 1) RETURNING id")
        .bind(s.org.id, `+9715${String(++seq).padStart(8, "0")}`)
        .first<{ id: number }>();
      await sale(s.org.id, s.own.id, "2026-11-20", 1000, { customerId: c!.id, createdAt: at - HOUR });
    }
    for (let k = 0; k < 4; k++) {
      const t = await tick(at + k * TICK);
      expect(t.statements, `tick ${k}`).toBeLessThanOrEqual(CRON_STMTS);
      expect(t.sends, `tick ${k}`).toBeLessThanOrEqual(CRON_BUDGET);
    }
    // Failed visit reminders were released (retried next tick, as FM), so the same customers come round again.
    expect(f.wa.length).toBeGreaterThan(0);
    const failed = await env.DB.prepare("SELECT COUNT(*) AS n FROM wa_messages WHERE status = 'failed'").first<{ n: number }>();
    expect(failed!.n).toBe(f.wa.length);
  });

  it("a push to more than 90 recipients re-checks its cost and stays within 45 statements and 40 subrequests", async () => {
    install();
    const a = await salon("cr-big-push", { plan: "pro", wa: false });
    await set(a.org.id, "notify_reminder = 1, reminder_hour = 13");
    // 95 more idle barbers (direct rows: no password hashing), each with a device; plus b1.
    await env.DB.prepare(
      `INSERT INTO users (org_id, username, name, role, password_hash, created_at)
       WITH RECURSIVE k(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM k WHERE i < 95)
       SELECT ?1, 'bb' || i, 'Barber ' || i, 'barber', 'x', 1 FROM k`,
    )
      .bind(a.org.id)
      .run();
    await env.DB.prepare("INSERT INTO push_tokens (token, org_id, user_id, created_at, updated_at) SELECT 'tk' || id, org_id, id, 1, id FROM users WHERE org_id = ? AND role = 'barber'")
      .bind(a.org.id)
      .run();
    const t = await tick(Date.UTC(2026, 10, 20, 9, 0)); // 13:00 Dubai
    expect(t.statements).toBeLessThanOrEqual(CRON_STMTS);
    expect(t.subrequests).toBeLessThanOrEqual(CRON_BUDGET);
    expect(f.pushes).toHaveLength(1);
    expect(f.pushes[0]!.tokens).toHaveLength(CRON_BUDGET - 1);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE org_id = ?").bind(a.org.id).first<{ n: number }>();
    expect(n!.n).toBe(96);
  });

  it("the metered DB fails closed: an unmetered D1 method throws instead of running uncounted", async () => {
    const budget = { left: 0, stmts: 10 };
    const m = meteredEnv({ DB: env.DB }, budget);
    expect(() => (m.DB as any).withSession("first-primary")).toThrow(/not metered/);
    expect(() => (m.DB as any).dump()).toThrow(/not metered/);
    const st = m.DB.prepare("SELECT 1 AS x").bind();
    expect(await st.first()).toEqual({ x: 1 });
    await m.DB.batch([m.DB.prepare("SELECT 1"), m.DB.prepare("SELECT 2")]);
    expect(budget.stmts).toBe(7);
  });
});

describe("rotationStart", () => {
  const old = (tick: number, n: number) => (n <= 1 ? 0 : (tick * 7) % n);
  const coversAll = (f: (t: number, n: number) => number, n: number, t0: number) =>
    new Set(Array.from({ length: n }, (_, i) => f(t0 + i, n))).size === n;
  const t0s = [0, 1, 6, 13, tickIndex(Date.UTC(2026, 10, 20, 8, 10)), 2_951_234];

  it("for every n in 1..40, any n consecutive ticks start at all n distinct orgs", () => {
    for (let n = 1; n <= 40; n++) for (const t0 of t0s) expect(coversAll(rotationStart, n, t0), `n=${n} t0=${t0}`).toBe(true);
  });

  it("the old (tick * 7) % n fails exactly where 7 divides n; the new one does not", () => {
    for (const n of [7, 14, 21, 28, 35]) {
      expect(coversAll(old, n, t0s[4]!), `old n=${n}`).toBe(false);
      expect(coversAll(rotationStart, n, t0s[4]!), `new n=${n}`).toBe(true);
    }
  });

  it("stride: 7 when coprime with n, else the next coprime prime (n = 7 -> 11); 0 for n <= 1", () => {
    expect(rotationStart(1, 30)).toBe(7);
    expect(rotationStart(1, 7)).toBe(11 % 7);
    expect(rotationStart(1, 77)).toBe(13);
    expect(rotationStart(5, 1)).toBe(0);
    expect(rotationStart(5, 0)).toBe(0);
  });
});
