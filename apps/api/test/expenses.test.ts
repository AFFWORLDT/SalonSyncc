import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { businessDay, addDays } from "../src/lib/clock";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { invalidateFeatures } from "../src/core/features-cache";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "" };
const callIn = (e: any, method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    e,
    ctx,
  );
const call = (method: string, path: string, cookie: string, body?: unknown) => callIn(E, method, path, cookie, body);
const json = async (r: Response): Promise<any> => r.json();
const dubaiToday = () => businessDay(Date.now(), { timezone: "Asia/Dubai", dayStartHour: 4 });

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro_max") {
  const org = await makeOrg({ slug, plan });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  return { org, own, b1, b2, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1"), k2: await loginAs(slug, "b2") };
}
const allowExpense = (orgId: string, userId: number) =>
  env.DB.prepare("UPDATE users SET can_add_expense = 1 WHERE org_id = ? AND id = ?").bind(orgId, userId).run();

/** Balance per book/account/barber from every line (reversals included). */
async function balances(orgId: string) {
  const r = await env.DB.prepare(
    "SELECT book, account, barber_id, SUM(amount) AS bal FROM ledger_entries WHERE org_id = ? GROUP BY book, account, barber_id ORDER BY book, account, barber_id",
  ).bind(orgId).all<any>();
  return r.results;
}
const liveLines = async (orgId: string, source: string, id: number) =>
  (await env.DB.prepare(
    "SELECT book, account, amount FROM ledger_entries WHERE org_id = ? AND source = ? AND source_id = ? AND reversed = 0 AND reverses_id IS NULL ORDER BY id",
  ).bind(orgId, source, id).all()).results;
const lineCount = async (orgId: string, source: string, id: number) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE org_id = ? AND source = ? AND source_id = ?").bind(orgId, source, id).first<any>()).n;
const audits = async (orgId: string, entity: string, id: number) =>
  (await env.DB.prepare("SELECT action, before, after FROM audit_log WHERE org_id = ? AND entity = ? AND entity_id = ? ORDER BY id").bind(orgId, entity, id).all<any>())
    .results.map((r) => ({ action: r.action, before: r.before && JSON.parse(r.before), after: r.after && JSON.parse(r.after) }));
const expenseRows = async (orgId: string) =>
  (await env.DB.prepare("SELECT barber_id, day, amount, note FROM expenses WHERE org_id = ? ORDER BY barber_id, day").bind(orgId).all()).results;

/** An env whose DB runs `race` once, right before the route's write batch. */
const racing = (race: () => Promise<unknown>) => {
  let done = false;
  const DB = new Proxy(env.DB, {
    get(t, k) {
      if (k === "batch")
        return async (stmts: D1PreparedStatement[]) => {
          if (!done) { done = true; await race(); }
          return t.batch(stmts);
        };
      const v = (t as any)[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { ...E, DB };
};

describe("PUT /api/expenses (barber expense, one per barber per day)", () => {
  it("RF5: a barber without can_add_expense gets 403 with FM's text; with it, only for self and only today", async () => {
    const a = await setup("ex-rf5");
    const r = await call("PUT", "/expenses", a.k1, { amount: 20, note: "tea" });
    expect(r.status).toBe(403);
    expect(await json(r)).toEqual({ error: "Expenses are added by the admin. Ask them to add yours." });
    expect(await expenseRows(a.org.id)).toEqual([]);

    await allowExpense(a.org.id, a.b1.id);
    // A barber's day and barber_id are ignored (FM): always their own, today.
    const ok = await call("PUT", "/expenses", a.k1, { amount: 20, note: "tea", day: addDays(dubaiToday(), -3), barber_id: a.b2.id });
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ barber_id: a.b1.id, barber_name: "b1", day: dubaiToday(), amount: 2000, note: "tea" });
    expect(await expenseRows(a.org.id)).toEqual([{ barber_id: a.b1.id, day: dubaiToday(), amount: 2000, note: "tea" }]);
  });

  it("upsert keeps one row per barber per day; edits reverse and repost; amount 0 deletes with a reversal", async () => {
    const a = await setup("ex-upsert");
    const day = addDays(dubaiToday(), -1);
    const r1 = await json(await call("PUT", "/expenses", a.ck, { amount: 50, note: "tea", barber_id: a.b1.id, day }));
    expect(r1).toMatchObject({ barber_id: a.b1.id, day, amount: 5000, note: "tea" });
    expect(await liveLines(a.org.id, "expense", r1.id)).toEqual([{ book: "shop", account: "cash", amount: -5000 }]);

    const r2 = await json(await call("PUT", "/expenses", a.ck, { amount: 70, note: "tea", barber_id: a.b1.id, day }));
    expect(r2.id).toBe(r1.id);
    expect(await expenseRows(a.org.id)).toEqual([{ barber_id: a.b1.id, day, amount: 7000, note: "tea" }]);
    expect(await liveLines(a.org.id, "expense", r1.id)).toEqual([{ book: "shop", account: "cash", amount: -7000 }]);
    expect(await balances(a.org.id)).toEqual([{ book: "shop", account: "cash", barber_id: null, bal: -7000 }]);

    // A note-only change does not repost.
    await call("PUT", "/expenses", a.ck, { amount: 70, note: "lunch", barber_id: a.b1.id, day });
    expect(await lineCount(a.org.id, "expense", r1.id)).toBe(3);

    const d = await call("PUT", "/expenses", a.ck, { amount: 0, barber_id: a.b1.id, day });
    expect(await json(d)).toEqual({ ok: true, deleted: true });
    expect(await expenseRows(a.org.id)).toEqual([]);
    expect(await liveLines(a.org.id, "expense", r1.id)).toEqual([]);
    expect(await balances(a.org.id)).toEqual([{ book: "shop", account: "cash", barber_id: null, bal: 0 }]);

    // Deleting again is a no-op (no extra audit row).
    expect(await json(await call("PUT", "/expenses", a.ck, { amount: "0", barber_id: a.b1.id, day }))).toEqual({ ok: true, deleted: true });
    const log = await audits(a.org.id, "expense", r1.id);
    expect(log.map((l) => l.action)).toEqual(["create", "update", "update", "delete"]);
    expect(log[0]).toEqual({ action: "create", before: null, after: { barber_id: a.b1.id, barber_name: "b1", day, amount: 5000, note: "tea" } });
    expect(log[3]).toMatchObject({ before: { amount: 7000, note: "lunch" }, after: null });
  });

  it("admin: no future day, only an active barber of the same org; bad amount is 400", async () => {
    const a = await setup("ex-adm");
    const b = await setup("ex-adm-b");
    const fut = await call("PUT", "/expenses", a.ck, { amount: 5, barber_id: a.b1.id, day: addDays(dubaiToday(), 1) });
    expect(fut.status).toBe(400);
    expect(await json(fut)).toEqual({ error: "Pick a valid day (not in the future)" });
    const other = await call("PUT", "/expenses", a.ck, { amount: 5, barber_id: b.b1.id });
    expect(other.status).toBe(400);
    await env.DB.prepare("UPDATE users SET active = 0 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b2.id).run();
    expect((await call("PUT", "/expenses", a.ck, { amount: 5, barber_id: a.b2.id })).status).toBe(400);
    const amt = await call("PUT", "/expenses", a.ck, { amount: "abc", barber_id: a.b1.id });
    expect(amt.status).toBe(400);
    expect(await json(amt)).toEqual({ error: "Enter the expense amount (e.g. 50)" });
    expect(await expenseRows(a.org.id)).toEqual([]);
    expect(await expenseRows(b.org.id)).toEqual([]);
  });

  it("stale update: the losing PUT gets 409, writes nothing, and the ledger matches the winner", async () => {
    const a = await setup("ex-occ");
    const day = dubaiToday();
    const first = await json(await call("PUT", "/expenses", a.ck, { amount: 10, barber_id: a.b1.id, day }));
    const e = racing(() => call("PUT", "/expenses", a.ck, { amount: 30, barber_id: a.b1.id, day }));
    const r = await callIn(e, "PUT", "/expenses", a.ck, { amount: 20, barber_id: a.b1.id, day, note: "stale" });
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ error: "This expense was changed by someone else. Reload and try again.", code: "stale" });
    expect(await expenseRows(a.org.id)).toEqual([{ barber_id: a.b1.id, day, amount: 3000, note: null }]);
    expect(await liveLines(a.org.id, "expense", first.id)).toEqual([{ book: "shop", account: "cash", amount: -3000 }]);
    expect((await audits(a.org.id, "expense", first.id)).map((l) => l.action)).toEqual(["create", "update"]);
  });

  it("racing inserts: the loser gets 409 and posts no second line (uniqueness guard)", async () => {
    const a = await setup("ex-occ-ins");
    const day = dubaiToday();
    const e = racing(() => call("PUT", "/expenses", a.ck, { amount: 30, barber_id: a.b1.id, day }));
    const r = await callIn(e, "PUT", "/expenses", a.ck, { amount: 20, barber_id: a.b1.id, day });
    expect(r.status).toBe(409);
    expect(await json(r)).toMatchObject({ code: "stale" });
    const rows = await env.DB.prepare("SELECT id, amount FROM expenses WHERE org_id = ?").bind(a.org.id).all<any>();
    expect(rows.results).toHaveLength(1);
    expect(await liveLines(a.org.id, "expense", rows.results[0].id)).toEqual([{ book: "shop", account: "cash", amount: -3000 }]);
    expect(await balances(a.org.id)).toEqual([{ book: "shop", account: "cash", barber_id: null, bal: -3000 }]);
  });

  it("stale delete (amount 0): 409 and nothing reversed", async () => {
    const a = await setup("ex-occ-del");
    const day = dubaiToday();
    const first = await json(await call("PUT", "/expenses", a.ck, { amount: 10, barber_id: a.b1.id, day }));
    const e = racing(() => call("PUT", "/expenses", a.ck, { amount: 40, barber_id: a.b1.id, day }));
    const r = await callIn(e, "PUT", "/expenses", a.ck, { amount: 0, barber_id: a.b1.id, day });
    expect(r.status).toBe(409);
    expect(await liveLines(a.org.id, "expense", first.id)).toEqual([{ book: "shop", account: "cash", amount: -4000 }]);
    expect((await audits(a.org.id, "expense", first.id)).map((l) => l.action)).toEqual(["create", "update"]);
  });
});

describe("GET /api/expenses", () => {
  it("barbers see only their own; admins filter by barber, month or day; orgs never see each other's", async () => {
    const a = await setup("ex-get");
    const b = await setup("ex-get-b");
    const today = dubaiToday();
    await call("PUT", "/expenses", a.ck, { amount: 10, barber_id: a.b1.id, day: today });
    await call("PUT", "/expenses", a.ck, { amount: 20, barber_id: a.b2.id, day: today });
    await call("PUT", "/expenses", b.ck, { amount: 99, barber_id: b.b1.id, day: today });
    const month = today.slice(0, 7);

    const mine = await json(await call("GET", `/expenses?month=${month}&barber_id=${a.b2.id}`, a.k1));
    expect(mine.map((x: any) => x.barber_id)).toEqual([a.b1.id]);
    const all = await json(await call("GET", `/expenses?month=${month}`, a.ck));
    expect(all.map((x: any) => x.amount).sort()).toEqual([1000, 2000]);
    expect(all[0]).toEqual({ id: expect.any(Number), barber_id: expect.any(Number), barber_name: expect.any(String), day: today, amount: expect.any(Number), note: null, updated_at: expect.any(Number) });
    const one = await json(await call("GET", `/expenses?barber_id=${a.b2.id}`, a.ck));
    expect(one.map((x: any) => x.amount)).toEqual([2000]);
    expect(await json(await call("GET", `/expenses?day=${today}`, a.ck))).toHaveLength(2);
    expect(await json(await call("GET", `/expenses?day=${addDays(today, -40)}`, a.ck))).toEqual([]);
    expect(await json(await call("GET", "/expenses?month=2001-01", a.ck))).toEqual([]);
    // Another org's barber id filters to nothing.
    expect(await json(await call("GET", `/expenses?barber_id=${b.b1.id}`, a.ck))).toEqual([]);
  });

  it("free plan includes expenses (200); an override turning it off gives 403 on both routers", async () => {
    const a = await setup("ex-free", "free");
    expect((await call("GET", "/expenses", a.ck)).status).toBe(200);
    expect((await call("PUT", "/expenses", a.ck, { amount: 5, barber_id: a.b1.id })).status).toBe(200);
    expect((await call("GET", "/company-expenses", a.ck)).status).toBe(200);
    await env.DB.prepare("INSERT INTO org_feature_overrides(org_id,feature_key,enabled,set_at) VALUES(?,?,0,?)").bind(a.org.id, "expenses", Date.now()).run();
    invalidateFeatures(a.org.id); // the per-isolate features cache (60 s TTL) already holds this org from the calls above
    for (const [m, p] of [["GET", "/expenses"], ["PUT", "/expenses"], ["GET", "/company-expenses"], ["POST", "/company-expenses"]] as const) {
      const r = await call(m, p, a.ck, m === "GET" ? undefined : { amount: 5, note: "x" });
      expect(r.status, `${m} ${p}`).toBe(403);
      expect(await json(r)).toMatchObject({ code: "feature_disabled" });
    }
  });
});

describe("company expenses (admin)", () => {
  it("barbers get 403; validation follows FM", async () => {
    const a = await setup("ce-val");
    const r = await call("POST", "/company-expenses", a.k1, { amount: 5, note: "rent" });
    expect(r.status).toBe(403);
    expect(await json(r)).toEqual({ error: "You don't have access to this" });
    expect((await call("GET", "/company-expenses", a.k1)).status).toBe(403);
    const cases: [unknown, string][] = [
      [{ amount: 5 }, "Say what the expense is for (e.g. rent)"],
      [{ amount: "x", note: "rent" }, "Enter the expense amount (e.g. 500)"],
      [{ amount: 5, note: "rent", paid_from: "card" }, "Paid from: choose Cash or Bank"],
      [{ amount: 5, note: "rent", day: addDays(dubaiToday(), 1) }, "Pick a valid day (not in the future)"],
    ];
    for (const [body, error] of cases) {
      const res = await call("POST", "/company-expenses", a.ck, body);
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error });
    }
  });

  it("create, edit (reverse + repost), delete (hard, reversal); ledger balances net correctly; audit rows", async () => {
    const a = await setup("ce-crud");
    const today = dubaiToday();
    const c1 = await json(await call("POST", "/company-expenses", a.ck, { amount: 100, note: "rent" }));
    expect(c1).toEqual({ id: expect.any(Number), day: today, amount: 10000, note: "rent", paid_from: "cash", created_by: a.own.id, created_by_name: "own", updated_at: expect.any(Number) });
    const c2 = await json(await call("POST", "/company-expenses", a.ck, { amount: 30, note: "power", paid_from: "bank" }));
    expect(await liveLines(a.org.id, "company_expense", c2.id)).toEqual([{ book: "shop", account: "bank", amount: -3000 }]);
    expect(await balances(a.org.id)).toEqual([
      { book: "shop", account: "bank", barber_id: null, bal: -3000 },
      { book: "shop", account: "cash", barber_id: null, bal: -10000 },
    ]);

    const u = await call("PUT", `/company-expenses/${c1.id}`, a.ck, { amount: 80, note: "rent", paid_from: "bank", day: today });
    expect(u.status).toBe(200);
    expect(await json(u)).toMatchObject({ id: c1.id, amount: 8000, paid_from: "bank" });
    expect(await liveLines(a.org.id, "company_expense", c1.id)).toEqual([{ book: "shop", account: "bank", amount: -8000 }]);
    expect(await balances(a.org.id)).toEqual([
      { book: "shop", account: "bank", barber_id: null, bal: -11000 },
      { book: "shop", account: "cash", barber_id: null, bal: 0 },
    ]);
    // Note-only edits don't repost.
    await call("PUT", `/company-expenses/${c1.id}`, a.ck, { amount: 80, note: "rent nov", paid_from: "bank", day: today });
    expect(await lineCount(a.org.id, "company_expense", c1.id)).toBe(3);

    const list = await json(await call("GET", `/company-expenses?month=${today.slice(0, 7)}`, a.ck));
    expect(list.map((x: any) => x.id)).toEqual([c2.id, c1.id]);

    const d = await call("DELETE", `/company-expenses/${c1.id}`, a.ck);
    expect(await json(d)).toEqual({ ok: true });
    expect(await env.DB.prepare("SELECT id FROM company_expenses WHERE org_id = ? AND id = ?").bind(a.org.id, c1.id).first()).toBeNull();
    expect(await liveLines(a.org.id, "company_expense", c1.id)).toEqual([]);
    expect(await balances(a.org.id)).toEqual([
      { book: "shop", account: "bank", barber_id: null, bal: -3000 },
      { book: "shop", account: "cash", barber_id: null, bal: 0 },
    ]);
    expect((await call("DELETE", `/company-expenses/${c1.id}`, a.ck)).status).toBe(404);
    expect((await call("PUT", `/company-expenses/${c1.id}`, a.ck, { amount: 1, note: "x" })).status).toBe(404);
    const log = await audits(a.org.id, "company_expense", c1.id);
    expect(log.map((l) => l.action)).toEqual(["create", "update", "update", "delete"]);
    expect(log[0].after).toEqual({ day: today, amount: 10000, note: "rent", paid_from: "cash" });
    expect(log[1]).toMatchObject({ before: { amount: 10000, paid_from: "cash" }, after: { amount: 8000, paid_from: "bank" } });
    expect(log[3]).toMatchObject({ before: { amount: 8000, note: "rent nov" }, after: null });
  });

  it("RF4: parallel creates across 2 orgs get the right id in the response, the audit row and the ledger line", async () => {
    const a = await setup("ce-rf4-a");
    const b = await setup("ce-rf4-b");
    const jobs = [];
    for (let i = 1; i <= 6; i++) {
      jobs.push(call("POST", "/company-expenses", a.ck, { amount: i, note: `a${i}` }).then(json).then((r) => ({ org: a.org.id, amount: i * 100, note: `a${i}`, r })));
      jobs.push(call("POST", "/company-expenses", b.ck, { amount: i + 10, note: `b${i}`, paid_from: "bank" }).then(json).then((r) => ({ org: b.org.id, amount: (i + 10) * 100, note: `b${i}`, r })));
    }
    const done = await Promise.all(jobs);
    expect(new Set(done.map((d) => d.r.id)).size).toBe(12);
    for (const d of done) {
      expect(d.r).toMatchObject({ amount: d.amount, note: d.note });
      const row = await env.DB.prepare("SELECT org_id, amount, note FROM company_expenses WHERE id = ?").bind(d.r.id).first();
      expect(row).toEqual({ org_id: d.org, amount: d.amount, note: d.note });
      const aud = await env.DB.prepare("SELECT org_id, ref, after FROM audit_log WHERE entity = 'company_expense' AND entity_id = ?").bind(d.r.id).all<any>();
      expect(aud.results).toHaveLength(1);
      expect(aud.results[0]).toMatchObject({ org_id: d.org, ref: d.note });
      expect(JSON.parse(aud.results[0].after)).toMatchObject({ amount: d.amount });
      const led = await env.DB.prepare("SELECT org_id, amount FROM ledger_entries WHERE source = 'company_expense' AND source_id = ?").bind(d.r.id).all();
      expect(led.results).toEqual([{ org_id: d.org, amount: -d.amount }]);
    }
  });

  it("stale PUT gets 409 and writes nothing; edit vs delete gets 404; stale DELETE gets 409", async () => {
    const a = await setup("ce-occ");
    const c1 = await json(await call("POST", "/company-expenses", a.ck, { amount: 10, note: "rent" }));
    const path = `/company-expenses/${c1.id}`;
    const r = await callIn(racing(() => call("PUT", path, a.ck, { amount: 30, note: "rent", paid_from: "bank" })), "PUT", path, a.ck, { amount: 20, note: "stale" });
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ error: "This expense was changed by someone else. Reload and try again.", code: "stale" });
    expect(await env.DB.prepare("SELECT amount, note, paid_from FROM company_expenses WHERE org_id = ? AND id = ?").bind(a.org.id, c1.id).first())
      .toEqual({ amount: 3000, note: "rent", paid_from: "bank" });
    expect(await liveLines(a.org.id, "company_expense", c1.id)).toEqual([{ book: "shop", account: "bank", amount: -3000 }]);
    expect((await audits(a.org.id, "company_expense", c1.id)).map((l) => l.action)).toEqual(["create", "update"]);

    const sd = await callIn(racing(() => call("PUT", path, a.ck, { amount: 40, note: "rent" })), "DELETE", path, a.ck);
    expect(sd.status).toBe(409);
    expect(await liveLines(a.org.id, "company_expense", c1.id)).toEqual([{ book: "shop", account: "cash", amount: -4000 }]);

    const ed = await callIn(racing(() => call("DELETE", path, a.ck)), "PUT", path, a.ck, { amount: 50, note: "late" });
    expect(ed.status).toBe(404);
    expect(await liveLines(a.org.id, "company_expense", c1.id)).toEqual([]);
    for (const x of await balances(a.org.id)) expect(x.bal).toBe(0);
    expect((await audits(a.org.id, "company_expense", c1.id)).map((l) => l.action)).toEqual(["create", "update", "update", "delete"]);

    // Double DELETE: exactly one delete audit row.
    const c2 = await json(await call("POST", "/company-expenses", a.ck, { amount: 10, note: "x" }));
    const p2 = `/company-expenses/${c2.id}`;
    expect((await callIn(racing(() => call("DELETE", p2, a.ck)), "DELETE", p2, a.ck)).status).toBe(404);
    expect((await audits(a.org.id, "company_expense", c2.id)).map((l) => l.action)).toEqual(["create", "delete"]);
    expect(await lineCount(a.org.id, "company_expense", c2.id)).toBe(2);
  });
});
