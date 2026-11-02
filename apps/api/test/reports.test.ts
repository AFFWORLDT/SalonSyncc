import { env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import app from "../src/index";
import { randomToken } from "../src/core/crypto";
import { makeOrg, makeUser, loginAs } from "./helpers";

const E = { ...env, ROOT_DOMAIN: "" };
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const get = async (path: string, cookie: string): Promise<Response> => app.fetch(new Request(`https://x.test/api${path}`, { headers: { cookie } }), E, ctx);
const json = async (r: Response): Promise<any> => r.json();

let seq = 0;
async function sale(orgId: string, barberId: number, day: string, amount: number, commission: number, opts: { deleted?: boolean; createdAt?: number } = {}) {
  seq++;
  await env.DB.prepare(
    `INSERT INTO sales(org_id,bill_no,token,day,barber_id,customer_label,amount,payment_mode,commission_pct,commission,vat_rate,vat_amount,created_by,created_at,updated_at,deleted_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(orgId, `T-${seq}`, randomToken(12), day, barberId, `Customer ${seq}`, amount, "cash", 20, commission, 0, 0, barberId, opts.createdAt ?? 1000 + seq, 1, opts.deleted ? 5 : null)
    .run();
}
const expense = (orgId: string, barberId: number, day: string, amount: number, note: string | null = null) =>
  env.DB.prepare("INSERT INTO expenses(org_id,barber_id,day,amount,note,created_at,updated_at) VALUES(?,?,?,?,?,1,1)").bind(orgId, barberId, day, amount, note).run();
const company = (orgId: string, day: string, amount: number) =>
  env.DB.prepare("INSERT INTO company_expenses(org_id,uid,day,amount,note,created_at,updated_at) VALUES(?,?,?,?,?,1,1)").bind(orgId, randomToken(9), day, amount, "rent").run();

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro_max") {
  const org = await makeOrg({ slug, plan });
  const owner = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  return { org, owner, b1, b2, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1"), k2: await loginAs(slug, "b2") };
}

/** Hand-computed fixture, March 2025 (Dubai). Org B gets the same shape with huge numbers that must never leak. */
async function fixture(a: Awaited<ReturnType<typeof setup>>) {
  const o = a.org.id;
  await sale(o, a.b1.id, "2025-03-01", 10000, 2000);
  await sale(o, a.b1.id, "2025-03-01", 5000, 1000);
  await sale(o, a.b1.id, "2025-03-02", 8000, 1600);
  await sale(o, a.b1.id, "2025-03-02", 9999, 999, { deleted: true });
  await sale(o, a.b2.id, "2025-03-01", 20000, 3000);
  await expense(o, a.b1.id, "2025-03-01", 1500, "tea");
  await company(o, "2025-03-01", 4000);
  await company(o, "2025-03-31", 500);
  await company(o, "2025-04-01", 700);
}

afterEach(() => { vi.useRealTimers(); });

describe("GET /api/reports/daily", () => {
  it("matches the hand-computed fixture; shopProfit = sales - expenses - commission", async () => {
    const a = await setup("rep-daily");
    await fixture(a);
    const r = await get("/reports/daily?month=2025-03", a.ck);
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.month).toBe("2025-03");
    expect(d.rows).toHaveLength(31);
    const d1 = d.rows[0];
    expect(d1).toMatchObject({ day: "2025-03-01", sales: 35000, commission: 6000, expense: 5500, company_expense: 4000, profit: 23500 });
    expect(d1.cells[a.b1.id]).toEqual({ sales: 15000, commission: 3000, expense: 1500, count: 2 });
    expect(d1.cells[a.b2.id]).toEqual({ sales: 20000, commission: 3000, expense: 0, count: 1 });
    expect(d.rows[1]).toMatchObject({ day: "2025-03-02", sales: 8000, commission: 1600, expense: 0, profit: 6400 });
    expect(d.rows[30]).toMatchObject({ day: "2025-03-31", sales: 0, expense: 500, company_expense: 500, profit: -500 });
    expect(d.totals).toMatchObject({ sales: 43000, commission: 7600, expense: 6000, company_expense: 4500, profit: 29400 });
    expect(d.totals.cells[a.b1.id]).toEqual({ sales: 23000, commission: 4600, expense: 1500, count: 3 });
    expect(d.barbers.map((b: any) => b.id).sort()).toEqual([a.b1.id, a.b2.id].sort());
  });

  it("RF3: each org sees only its own numbers", async () => {
    const a = await setup("rep-iso-a");
    const b = await setup("rep-iso-b");
    await fixture(a);
    await sale(b.org.id, b.b1.id, "2025-03-01", 99999, 9999);
    await expense(b.org.id, b.b1.id, "2025-03-01", 7777);
    await company(b.org.id, "2025-03-01", 8888);
    const da = await json(await get("/reports/daily?month=2025-03", a.ck));
    const db = await json(await get("/reports/daily?month=2025-03", b.ck));
    expect(da.totals).toMatchObject({ sales: 43000, expense: 6000 });
    expect(db.totals).toMatchObject({ sales: 99999, commission: 9999, expense: 7777 + 8888, company_expense: 8888, profit: 99999 - 16665 - 9999 });
    expect(db.barbers.map((x: any) => x.id)).toEqual([b.b1.id, b.b2.id].sort((x, y) => x - y).filter((id) => [b.b1.id, b.b2.id].includes(id)));
    // Org B's overview and monthly do not see A's rows either.
    const ob = await json(await get("/reports/overview?from=2025-03-01&to=2025-03-31", b.ck));
    expect(ob.totals).toMatchObject({ sales: 99999, count: 1 });
    expect(ob.recent).toHaveLength(1);
    const mb = await json(await get("/reports/monthly?year=2025", b.ck));
    expect(mb.months[2].totals).toMatchObject({ sales: 99999 });
    expect(mb.months[3].totals.company_expense).toBe(0);
  });
});

describe("GET /api/reports/monthly", () => {
  it("groups by month and counts company expenses in each month", async () => {
    const a = await setup("rep-monthly");
    await fixture(a);
    const m = await json(await get("/reports/monthly?year=2025", a.ck));
    expect(m.year).toBe("2025");
    expect(m.months).toHaveLength(12);
    expect(m.months[2].totals).toEqual({ sales: 43000, count: 4, commission: 7600, expense: 6000, company_expense: 4500, profit: 29400 });
    expect(m.months[2].cells[a.b1.id]).toEqual({ sales: 23000, count: 3, commission: 4600, expense: 1500 });
    expect(m.months[3].totals).toEqual({ sales: 0, count: 0, commission: 0, expense: 700, company_expense: 700, profit: -700 });
    expect(m.months[0].totals.sales).toBe(0);
  });
});

describe("GET /api/reports/overview", () => {
  it("totals, previous period, per-barber, daily series and recent", async () => {
    const a = await setup("rep-ov");
    await fixture(a);
    await sale(a.org.id, a.b2.id, "2025-02-28", 1000, 100); // the day before the range
    const o = await json(await get("/reports/overview?from=2025-03-01&to=2025-03-02", a.ck));
    expect(o).toMatchObject({ from: "2025-03-01", to: "2025-03-02", series_by: "day" });
    expect(o.totals).toEqual({ sales: 43000, count: 4, commission: 7600, expense: 5500, company_expense: 4000, profit: 43000 - 5500 - 7600 });
    // previous = the same 2 days before: 02-27..02-28
    expect(o.prev_totals).toMatchObject({ sales: 1000, count: 1, commission: 100, expense: 0, profit: 900 });
    expect(o.series).toEqual([
      { key: "2025-03-01", sales: 35000, profit: 23500 },
      { key: "2025-03-02", sales: 8000, profit: 6400 },
    ]);
    const p1 = o.per_barber.find((x: any) => x.id === a.b1.id);
    expect(p1).toMatchObject({ sales: 23000, count: 3, commission: 4600, expense: 1500, expense_entered: true });
    expect(o.per_barber.find((x: any) => x.id === a.b2.id)).toMatchObject({ sales: 20000, expense_entered: false });
    expect(o.recent).toHaveLength(4);
    expect(o.recent.every((s: any) => s.items !== undefined && s.deleted_at === undefined)).toBe(true);
    expect(o.recent.map((s: any) => s.amount)).not.toContain(9999);
  });

  it("returns a monthly series past 92 days and caps the range at 731 days", async () => {
    const a = await setup("rep-ov-long");
    await fixture(a);
    const o = await json(await get("/reports/overview?from=2025-01-01&to=2025-06-30", a.ck));
    expect(o.series_by).toBe("month");
    expect(o.series.map((s: any) => s.key)).toEqual(["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"]);
    expect(o.series[2]).toEqual({ key: "2025-03", sales: 43000, profit: 29400 });
    expect(o.series[3]).toEqual({ key: "2025-04", sales: 0, profit: -700 });
    const d92 = await json(await get("/reports/overview?from=2025-03-01&to=2025-05-31", a.ck)); // exactly 92 days
    expect(d92.series_by).toBe("day");
    expect(d92.series).toHaveLength(92);
    const cap = await json(await get("/reports/overview?from=2000-01-01&to=2025-06-30", a.ck));
    expect(cap.to).toBe("2025-06-30");
    expect(cap.from).toBe("2023-07-01"); // 731 days inclusive (2024 is a leap year)
    expect(cap.series_by).toBe("month");
    // swapped bounds are put right; future `to` is clamped to today
    const sw = await json(await get("/reports/overview?from=2025-03-02&to=2025-03-01", a.ck));
    expect([sw.from, sw.to]).toEqual(["2025-03-01", "2025-03-02"]);
    const fut = await json(await get("/reports/overview?from=2025-03-01&to=2999-01-01", a.ck));
    expect(fut.to).toBe(fut.today);
  });

  it("defaults to today", async () => {
    const a = await setup("rep-ov-today");
    const o = await json(await get("/reports/overview", a.ck));
    expect(o.from).toBe(o.today);
    expect(o.to).toBe(o.today);
    expect(o.series).toHaveLength(1);
  });
});

describe("GET /api/reports/me", () => {
  it("a barber sees only their own days; an admin sees their own as a barber", async () => {
    const a = await setup("rep-me");
    await fixture(a);
    await sale(a.org.id, a.owner.id, "2025-03-05", 3000, 300);
    const m = await json(await get("/reports/me?month=2025-03", a.k1));
    expect(m.month).toBe("2025-03");
    expect(m.days).toEqual([
      { day: "2025-03-02", sales: 8000, count: 1, commission: 1600, expense: 0, net: 8000 },
      { day: "2025-03-01", sales: 15000, count: 2, commission: 3000, expense: 1500, net: 13500 },
    ]);
    expect(m.totals).toEqual({ sales: 23000, count: 3, commission: 4600, expense: 1500, net: 21500 });
    const other = await json(await get("/reports/me?month=2025-03", a.k2));
    expect(other.totals).toMatchObject({ sales: 20000, count: 1, expense: 0 });
    const own = await json(await get("/reports/me?month=2025-03", a.ck));
    expect(own.totals).toMatchObject({ sales: 3000, count: 1 });
  });

  it("RF2: today and the default month follow the org clock", async () => {
    const a = await setup("rep-me-rf2");
    await env.DB.prepare("UPDATE org_settings SET timezone = 'Asia/Kolkata', day_start_hour = 4 WHERE org_id = ?").bind(a.org.id).run();
    await sale(a.org.id, a.b1.id, "2026-11-01", 1000, 100);
    await sale(a.org.id, a.b1.id, "2026-11-02", 2000, 200);
    await expense(a.org.id, a.b1.id, "2026-11-01", 300, "lunch");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 1, 22, 0)); // 2026-11-02 03:30 IST: still business day 11-01
    const before = await json(await get("/reports/me", a.k1));
    expect(before.month).toBe("2026-11");
    expect(before.today).toMatchObject({ sales: 1000, count: 1, expense: 300, net: 700, expense_note: "lunch" });
    vi.setSystemTime(Date.UTC(2026, 10, 1, 23, 0)); // 04:30 IST: business day 11-02
    const after = await json(await get("/reports/me", a.k1));
    expect(after.today).toMatchObject({ sales: 2000, count: 1, expense: 0, expense_note: null });
    // The month default rolls with the business day too: 2026-12-01 03:30 IST is still November.
    vi.setSystemTime(Date.UTC(2026, 10, 30, 22, 0));
    expect((await json(await get("/reports/me", a.k1))).month).toBe("2026-11");
    vi.setSystemTime(Date.UTC(2026, 10, 30, 23, 0));
    expect((await json(await get("/reports/me", a.k1))).month).toBe("2026-12");
    // overview's today as well
    expect((await json(await get("/reports/overview", a.ck))).today).toBe("2026-12-01");
  });

  it("sees today's sales even when asking for another month", async () => {
    const a = await setup("rep-me-today");
    const today = (await json(await get("/reports/overview", a.ck))).today as string;
    await sale(a.org.id, a.b1.id, today, 4000, 400);
    const m = await json(await get("/reports/me?month=2020-01", a.k1));
    expect(m.days).toEqual([]);
    expect(m.today).toMatchObject({ sales: 4000, count: 1, commission: 400, net: 4000 });
  });
});

describe("access and feature gates", () => {
  it("overview, daily and monthly are admin-only; /me is for everyone", async () => {
    const a = await setup("rep-roles");
    for (const p of ["/reports/overview", "/reports/daily", "/reports/monthly"]) {
      const r = await get(p, a.k1);
      expect(r.status, p).toBe(403);
      expect(await json(r)).toEqual({ error: "You don't have access to this" });
      expect((await get(p, a.ck)).status, p).toBe(200);
    }
    expect((await get("/reports/me", a.k1)).status).toBe(200);
  });

  it("free org: /monthly is 403 feature_disabled, /daily and /me are included; pro: /monthly 200", async () => {
    const f = await setup("rep-free", "free");
    const m = await get("/reports/monthly", f.ck);
    expect(m.status).toBe(403);
    expect(await json(m)).toMatchObject({ code: "feature_disabled" });
    expect((await get("/reports/daily", f.ck)).status).toBe(200);
    expect((await get("/reports/me", f.k1)).status).toBe(200);
    expect((await get("/reports/overview", f.ck)).status).toBe(200);
    const p = await setup("rep-pro", "pro");
    expect((await get("/reports/monthly", p.ck)).status).toBe(200);
    expect((await get("/reports/daily", p.ck)).status).toBe(200);
  });

  it("each route is gated by its own feature only (override off daily_sheet: /me, /overview, /monthly unaffected)", async () => {
    const p = await setup("rep-gates", "pro");
    await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,0,?)").bind(p.org.id, "daily_sheet", Date.now()).run();
    const d = await get("/reports/daily", p.ck);
    expect(d.status).toBe(403);
    expect(await json(d)).toMatchObject({ code: "feature_disabled" });
    expect((await get("/reports/monthly", p.ck)).status).toBe(200);
    expect((await get("/reports/me", p.k1)).status).toBe(200);
    expect((await get("/reports/overview", p.ck)).status).toBe(200);
    const q = await setup("rep-gates2", "pro");
    await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,0,?)").bind(q.org.id, "reports_advanced", Date.now()).run();
    expect((await get("/reports/monthly", q.ck)).status).toBe(403);
    expect((await get("/reports/daily", q.ck)).status).toBe(200);
    expect((await get("/reports/me", q.k1)).status).toBe(200);
  });

  it("ignores malformed month/year (falls back to the current one)", async () => {
    const a = await setup("rep-bad");
    const d = await json(await get("/reports/daily?month=nope", a.ck));
    expect(d.month).toMatch(/^\d{4}-\d{2}$/);
    const m = await json(await get("/reports/monthly?year=20x5", a.ck));
    expect(m.year).toMatch(/^\d{4}$/);
  });
});
