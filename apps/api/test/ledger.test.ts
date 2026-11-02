import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { businessDay, addDays } from "../src/lib/clock";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "" };
const callIn = async (e: any, method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
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
const ok = async (r: Response | Promise<Response>): Promise<any> => {
  const res = await r;
  const body = await res.json();
  if (res.status >= 300) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
};
const dubaiToday = () => businessDay(Date.now(), { timezone: "Asia/Dubai", dayStartHour: 4 });

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro_max") {
  const org = await makeOrg({ slug, plan });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  await env.DB.prepare("UPDATE users SET commission_pct = 20 WHERE org_id = ? AND id = ?").bind(org.id, b1.id).run();
  await env.DB.prepare("UPDATE users SET commission_pct = 10 WHERE org_id = ? AND id = ?").bind(org.id, b2.id).run();
  return { org, own, b1, b2, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1") };
}

/** Live (unreversed, non-reversal) lines of one source. */
const liveLines = async (orgId: string, source: string, id: number) =>
  (await env.DB.prepare(
    "SELECT book, account, barber_id, amount FROM ledger_entries WHERE org_id = ? AND source = ? AND source_id = ? AND reversed = 0 AND reverses_id IS NULL ORDER BY id",
  ).bind(orgId, source, id).all()).results;
const lineCount = async (orgId: string, source: string, id: number) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE org_id = ? AND source = ? AND source_id = ?").bind(orgId, source, id).first<any>()).n;
const audits = async (orgId: string, entity: string, id: number) =>
  (await env.DB.prepare("SELECT action, before, after FROM audit_log WHERE org_id = ? AND entity = ? AND entity_id = ? ORDER BY id").bind(orgId, entity, id).all<any>())
    .results.map((r) => ({ action: r.action, before: r.before && JSON.parse(r.before), after: r.after && JSON.parse(r.after) }));

/** An env whose DB runs `race` once, right before the route's (skip+1)-th batch. */
const racing = (race: () => Promise<unknown>, skip = 0) => {
  let seen = 0;
  let done = false;
  const DB = new Proxy(env.DB, {
    get(t, k) {
      if (k === "batch")
        return async (stmts: D1PreparedStatement[]) => {
          if (!done && seen++ === skip) { done = true; await race(); }
          return t.batch(stmts);
        };
      const v = (t as any)[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { ...E, DB };
};

describe("ledger: hand-computed balances across every source", () => {
  it("openings, sales, expenses, a company expense, a transfer and a payout give the fixture's balances and books", async () => {
    const a = await setup("lg-fix");
    const today = dubaiToday();
    const d1 = addDays(today, -3);
    const d2 = addDays(today, -2);
    const d3 = addDays(today, -1);

    // Openings on an empty ledger: cash 500, bank 1000, b1 is owed 50.
    const o1 = await ok(call("PUT", "/ledger/balances", a.ck, { cash: 500, bank: "1000", barbers: { [a.b1.id]: 50 } }));
    expect(o1).toEqual({ cash: 50000, bank: 100000, barbers: { [a.b1.id]: 5000 } });

    // Sales through the real route (b1 20%, b2 10%).
    await ok(call("POST", "/sales", a.ck, { amount: 100, payment_mode: "cash", barber_id: a.b1.id, day: d1 }));
    await ok(call("POST", "/sales", a.ck, { amount: 200, payment_mode: "card", barber_id: a.b1.id, day: d2 }));
    await ok(call("POST", "/sales", a.ck, { amount: 50, payment_mode: "cash", barber_id: a.b2.id, day: d2 }));
    // A barber expense (cash) and a company expense (bank).
    await ok(call("PUT", "/expenses", a.ck, { amount: 30, barber_id: a.b1.id, day: d2 }));
    await ok(call("POST", "/company-expenses", a.ck, { amount: 400, note: "rent", paid_from: "bank", day: d3 }));
    // Move 100 from the drawer to the bank; pay b1 40 from the drawer.
    const t = await call("POST", "/transfers", a.ck, { amount: 100, from_account: "cash", to_account: "bank", day: d3, note: "deposit" });
    expect(t.status).toBe(201);
    expect(await json(t)).toEqual({
      id: expect.any(Number), day: d3, amount: 10000, from_account: "cash", to_account: "bank", note: "deposit", created_by_name: "own", updated_at: expect.any(Number),
    });
    const p = await call("POST", "/payouts", a.ck, { barber_id: a.b1.id, amount: 40, paid_from: "cash", day: d3 });
    expect(p.status).toBe(201);
    expect(await json(p)).toEqual({
      id: expect.any(Number), barber_id: a.b1.id, barber_name: "b1", day: d3, amount: 4000, paid_from: "cash", note: null, updated_at: expect.any(Number),
    });

    // cash = 50000 + 10000 + 5000 - 3000 - 10000 - 4000 = 48000
    // bank = 100000 + 20000 - 40000 + 10000 = 90000
    // b1 = 5000 + 2000 + 4000 - 4000 = 7000; b2 = 500
    expect(await ok(call("GET", "/ledger/balances", a.ck))).toEqual({ cash: 48000, bank: 90000, barbers: { [a.b1.id]: 7000, [a.b2.id]: 500 } });

    const shop = await ok(call("GET", `/ledger/shop?from=${d1}&to=${today}`, a.ck));
    expect(shop).toMatchObject({ from: d1, to: today, account: "all", opening: { cash: 0, bank: 0 }, closing: { cash: 48000, bank: 90000 } });
    expect(shop.lines.map((l: any) => [l.day, l.account, l.amount, l.kind])).toEqual([
      [d1, "cash", 10000, "sale"],
      [d2, "bank", 20000, "sale"],
      [d2, "cash", 5000, "sale"],
      [d2, "cash", -3000, "expense"],
      [d3, "bank", -40000, "company_expense"],
      [d3, "cash", -10000, "transfer"],
      [d3, "bank", 10000, "transfer"],
      [d3, "cash", -4000, "payout"],
      [today, "cash", 50000, "opening"],
      [today, "bank", 100000, "opening"],
    ]);
    expect(shop.lines.map((l: any) => l.balance)).toEqual([10000, 30000, 35000, 32000, -8000, -18000, -8000, -12000, 38000, 138000]);
    expect(shop.lines[0]).toMatchObject({ source: "sale", reversed: false, reverses_id: null, actor_name: "own", barber_id: null });

    // One account, and a window: opening = everything before `from`, closing = everything up to `to`.
    const cash = await ok(call("GET", `/ledger/shop?from=${d3}&to=${d3}&account=cash`, a.ck));
    // before d3: cash 10000 + 5000 - 3000 = 12000, bank 20000; up to d3: cash -2000, bank -10000
    expect(cash).toMatchObject({ account: "cash", opening: { cash: 12000, bank: 20000 }, closing: { cash: -2000, bank: -10000 } });
    expect(cash.lines.map((l: any) => [l.amount, l.balance])).toEqual([[-10000, 2000], [-4000, -2000]]);

    // Barber balances: earned = commission, paid = payouts, balance includes the opening.
    const barbers = await ok(call("GET", "/ledger/barbers", a.ck));
    expect(barbers).toEqual([
      { id: a.b1.id, name: "b1", avatar_url: null, active: true, earned: 6000, paid: 4000, balance: 7000 },
      { id: a.b2.id, name: "b2", avatar_url: null, active: true, earned: 500, paid: 0, balance: 500 },
    ]);
    // Barber book with a running balance from the opening before `from`.
    const book = await ok(call("GET", `/ledger/barbers/${a.b1.id}?from=${d2}&to=${today}`, a.ck));
    expect(book).toMatchObject({ barber: { id: a.b1.id, balance: 7000 }, from: d2, to: today, opening: 2000 });
    expect(book.lines.map((l: any) => [l.day, l.kind, l.amount, l.balance])).toEqual([
      [d2, "commission", 4000, 6000],
      [d3, "payout", -4000, 2000],
      [today, "opening", 5000, 7000],
    ]);

    // Setting the balances again reverses the previous opening and posts the new difference.
    const o2 = await ok(call("PUT", "/ledger/balances", a.ck, { cash: 450, bank: 900 }));
    expect(o2).toEqual({ cash: 45000, bank: 90000, barbers: { [a.b1.id]: 7000, [a.b2.id]: 500 } });
    // base cash = 48000 - 50000 = -2000 -> opening 47000; base bank = 90000 - 100000 = -10000 -> opening 100000
    expect(await liveLines(a.org.id, "opening", 0)).toEqual([
      { book: "shop", account: "cash", barber_id: null, amount: 47000 },
      { book: "shop", account: "bank", barber_id: null, amount: 100000 },
    ]);
    // b1 was not listed: their opening is untouched.
    expect(await liveLines(a.org.id, "opening", a.b1.id)).toEqual([{ book: "barber", account: null, barber_id: a.b1.id, amount: 5000 }]);
    // Setting b1 to 0 removes what they are owed (negative values are allowed too).
    expect(await ok(call("PUT", "/ledger/balances", a.ck, { cash: 450, bank: 900, barbers: { [a.b1.id]: 0, [a.b2.id]: "-5" } })))
      .toEqual({ cash: 45000, bank: 90000, barbers: { [a.b1.id]: 0, [a.b2.id]: -500 } });
    const log = await audits(a.org.id, "opening", 0);
    expect(log.map((l) => l.action)).toEqual(["update", "update", "update"]);
    expect(log[1]).toEqual({ action: "update", before: { cash: 48000, bank: 90000, barbers: {} }, after: { cash: 45000, bank: 90000, barbers: {} } });
  });

  it("openings validate the amounts and the barbers (same org only)", async () => {
    const a = await setup("lg-open-val");
    const b = await setup("lg-open-val-b");
    const bad = await call("PUT", "/ledger/balances", a.ck, { cash: "abc", bank: 0 });
    expect(bad.status).toBe(400);
    expect(await json(bad)).toEqual({ error: "Enter the cash drawer amount in AED (0 is fine)" });
    const xo = await call("PUT", "/ledger/balances", a.ck, { cash: 0, bank: 0, barbers: { [b.b1.id]: 10 } });
    expect(xo.status).toBe(400);
    expect(await json(xo)).toEqual({ error: "Choose a barber from your team" });
    expect(await lineCount(a.org.id, "opening", 0)).toBe(0);
    expect(await lineCount(b.org.id, "opening", b.b1.id)).toBe(0);
  });

  it("stale openings: a concurrent PUT wins, the loser gets 409 and the ledger matches the winner", async () => {
    const a = await setup("lg-open-occ");
    await ok(call("PUT", "/ledger/balances", a.ck, { cash: 100, bank: 100 }));
    const r = await callIn(racing(() => call("PUT", "/ledger/balances", a.ck, { cash: 300, bank: 100 })), "PUT", "/ledger/balances", a.ck, { cash: 200, bank: 100 });
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ error: "The balances were changed by someone else. Reload and try again.", code: "stale" });
    expect(await ok(call("GET", "/ledger/balances", a.ck))).toEqual({ cash: 30000, bank: 10000, barbers: {} });
    expect(await liveLines(a.org.id, "opening", 0)).toEqual([
      { book: "shop", account: "cash", barber_id: null, amount: 30000 },
      { book: "shop", account: "bank", barber_id: null, amount: 10000 },
    ]);
    expect((await audits(a.org.id, "opening", 0)).length).toBe(2);
  });
});

describe("payouts", () => {
  it("edit reverses and reposts; delete reverses; audit rows", async () => {
    const a = await setup("lg-pay");
    const today = dubaiToday();
    const p = await ok(call("POST", "/payouts", a.ck, { barber_id: a.b1.id, amount: 40, paid_from: "cash", note: "week 1" }));
    expect(p).toMatchObject({ day: today, amount: 4000, note: "week 1" });
    expect(await liveLines(a.org.id, "payout", p.id)).toEqual([
      { book: "shop", account: "cash", barber_id: null, amount: -4000 },
      { book: "barber", account: null, barber_id: a.b1.id, amount: -4000 },
    ]);

    const u = await call("PUT", `/payouts/${p.id}`, a.ck, { barber_id: a.b2.id, amount: 60, paid_from: "bank", day: addDays(today, -1) });
    expect(u.status).toBe(200);
    expect(await json(u)).toMatchObject({ id: p.id, barber_id: a.b2.id, barber_name: "b2", amount: 6000, paid_from: "bank", day: addDays(today, -1), note: null });
    expect(await liveLines(a.org.id, "payout", p.id)).toEqual([
      { book: "shop", account: "bank", barber_id: null, amount: -6000 },
      { book: "barber", account: null, barber_id: a.b2.id, amount: -6000 },
    ]);
    expect(await lineCount(a.org.id, "payout", p.id)).toBe(6);
    expect(await ok(call("GET", "/ledger/balances", a.ck))).toEqual({ cash: 0, bank: -6000, barbers: { [a.b1.id]: 0, [a.b2.id]: -6000 } });
    // A note-only edit does not repost.
    await ok(call("PUT", `/payouts/${p.id}`, a.ck, { barber_id: a.b2.id, amount: 60, paid_from: "bank", day: addDays(today, -1), note: "fixed" }));
    expect(await lineCount(a.org.id, "payout", p.id)).toBe(6);

    const list = await ok(call("GET", `/payouts?month=${addDays(today, -1).slice(0, 7)}&barber_id=${a.b2.id}`, a.ck));
    expect(list.map((x: any) => x.id)).toEqual([p.id]);
    expect(await ok(call("GET", `/payouts?month=${addDays(today, -1).slice(0, 7)}&barber_id=${a.b1.id}`, a.ck))).toEqual([]);

    expect(await ok(call("DELETE", `/payouts/${p.id}`, a.ck))).toEqual({ ok: true });
    expect(await liveLines(a.org.id, "payout", p.id)).toEqual([]);
    expect(await ok(call("GET", "/ledger/balances", a.ck))).toEqual({ cash: 0, bank: 0, barbers: { [a.b1.id]: 0, [a.b2.id]: 0 } });
    expect((await call("DELETE", `/payouts/${p.id}`, a.ck)).status).toBe(404);
    expect((await call("PUT", `/payouts/${p.id}`, a.ck, { barber_id: a.b1.id, amount: 1, paid_from: "cash" })).status).toBe(404);
    const log = await audits(a.org.id, "payout", p.id);
    expect(log.map((l) => l.action)).toEqual(["create", "update", "update", "delete"]);
    expect(log[0].after).toEqual({ barber_id: a.b1.id, barber_name: "b1", day: today, amount: 4000, paid_from: "cash", note: "week 1" });
    expect(log[1]).toMatchObject({ before: { barber_id: a.b1.id, amount: 4000 }, after: { barber_id: a.b2.id, amount: 6000 } });
  });

  it("validation follows FM; RF1: another org's or an inactive barber is 400", async () => {
    const a = await setup("lg-pay-val");
    const b = await setup("lg-pay-val-b");
    const today = dubaiToday();
    await env.DB.prepare("UPDATE users SET active = 0 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b2.id).run();
    for (const [body, error] of [
      [{ barber_id: b.b1.id, amount: 10, paid_from: "cash" }, "Choose an active barber"],
      [{ barber_id: a.b2.id, amount: 10, paid_from: "cash" }, "Choose an active barber"],
      [{ amount: 10, paid_from: "cash" }, "Choose an active barber"],
      [{ barber_id: a.b1.id, amount: 0, paid_from: "cash" }, "Enter the amount paid (e.g. 500)"],
      [{ barber_id: a.b1.id, amount: 10, paid_from: "safe" }, "Paid from: choose Cash or Bank"],
      [{ barber_id: a.b1.id, amount: 10, paid_from: "cash", day: addDays(today, 1) }, "Pick a valid day (not in the future)"],
    ] as const) {
      const r = await call("POST", "/payouts", a.ck, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(await json(r)).toEqual({ error });
    }
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM barber_payouts WHERE org_id = ?").bind(a.org.id).first<any>()).n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE org_id = ?").bind(a.org.id).first<any>()).n).toBe(0);
  });

  it("stale PUT gets 409 and writes nothing; stale DELETE gets 409; edit vs delete gets 404", async () => {
    const a = await setup("lg-pay-occ");
    const p = await ok(call("POST", "/payouts", a.ck, { barber_id: a.b1.id, amount: 10, paid_from: "cash" }));
    const path = `/payouts/${p.id}`;
    const r = await callIn(racing(() => call("PUT", path, a.ck, { barber_id: a.b1.id, amount: 30, paid_from: "bank" })), "PUT", path, a.ck, { barber_id: a.b2.id, amount: 20, paid_from: "cash" });
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ error: "This payout was changed by someone else. Reload and try again.", code: "stale" });
    expect(await env.DB.prepare("SELECT barber_id, amount, paid_from FROM barber_payouts WHERE org_id = ? AND id = ?").bind(a.org.id, p.id).first())
      .toEqual({ barber_id: a.b1.id, amount: 3000, paid_from: "bank" });
    expect(await liveLines(a.org.id, "payout", p.id)).toEqual([
      { book: "shop", account: "bank", barber_id: null, amount: -3000 },
      { book: "barber", account: null, barber_id: a.b1.id, amount: -3000 },
    ]);
    expect((await audits(a.org.id, "payout", p.id)).map((l) => l.action)).toEqual(["create", "update"]);

    const sd = await callIn(racing(() => call("PUT", path, a.ck, { barber_id: a.b1.id, amount: 40, paid_from: "cash" })), "DELETE", path, a.ck);
    expect(sd.status).toBe(409);
    expect(await liveLines(a.org.id, "payout", p.id)).toEqual([
      { book: "shop", account: "cash", barber_id: null, amount: -4000 },
      { book: "barber", account: null, barber_id: a.b1.id, amount: -4000 },
    ]);

    const ed = await callIn(racing(() => call("DELETE", path, a.ck)), "PUT", path, a.ck, { barber_id: a.b1.id, amount: 50, paid_from: "cash" });
    expect(ed.status).toBe(404);
    expect(await liveLines(a.org.id, "payout", p.id)).toEqual([]);
    const bal = await ok(call("GET", "/ledger/balances", a.ck));
    expect(bal).toEqual({ cash: 0, bank: 0, barbers: { [a.b1.id]: 0 } });
    expect((await audits(a.org.id, "payout", p.id)).map((l) => l.action)).toEqual(["create", "update", "update", "delete"]);
  });

  it("a user with a payout is deactivated, not deleted", async () => {
    const a = await setup("lg-pay-act");
    await env.DB.prepare(
      "INSERT INTO barber_payouts (org_id, uid, barber_id, day, amount, paid_from, created_at, updated_at) VALUES (?, 'x1', ?, '2026-11-01', 100, 'cash', 1, 1)",
    ).bind(a.org.id, a.b2.id).run();
    expect(await ok(call("DELETE", `/users/${a.b2.id}`, a.ck))).toMatchObject({ deactivated: true });
  });
});

describe("transfers", () => {
  it("create, edit (reverse + repost), delete; FM validation; month list", async () => {
    const a = await setup("lg-tr");
    const today = dubaiToday();
    for (const [body, error] of [
      [{ amount: 10, from_account: "cash", to_account: "cash" }, "Pick two different accounts"],
      [{ amount: 10, from_account: "x", to_account: "cash" }, "From: choose Cash or Bank"],
      [{ amount: 10, from_account: "cash", to_account: "y" }, "To: choose Cash or Bank"],
      [{ amount: -1, from_account: "cash", to_account: "bank" }, "Enter the amount (e.g. 2000)"],
      [{ amount: 1, from_account: "cash", to_account: "bank", day: addDays(today, 1) }, "Pick a valid day (not in the future)"],
    ] as const) {
      const r = await call("POST", "/transfers", a.ck, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(await json(r)).toEqual({ error });
    }
    const t = await ok(call("POST", "/transfers", a.ck, { amount: 100, from_account: "cash", to_account: "bank" }));
    expect(await liveLines(a.org.id, "transfer", t.id)).toEqual([
      { book: "shop", account: "cash", barber_id: null, amount: -10000 },
      { book: "shop", account: "bank", barber_id: null, amount: 10000 },
    ]);
    const u = await ok(call("PUT", `/transfers/${t.id}`, a.ck, { amount: 25, from_account: "bank", to_account: "cash", note: "change" }));
    expect(u).toMatchObject({ id: t.id, amount: 2500, from_account: "bank", to_account: "cash", note: "change" });
    expect(await liveLines(a.org.id, "transfer", t.id)).toEqual([
      { book: "shop", account: "bank", barber_id: null, amount: -2500 },
      { book: "shop", account: "cash", barber_id: null, amount: 2500 },
    ]);
    expect(await ok(call("GET", "/ledger/balances", a.ck))).toEqual({ cash: 2500, bank: -2500, barbers: {} });
    expect((await ok(call("GET", `/transfers?month=${today.slice(0, 7)}`, a.ck))).map((x: any) => x.id)).toEqual([t.id]);

    // Stale PUT: 409, nothing written.
    const path = `/transfers/${t.id}`;
    const s = await callIn(racing(() => call("PUT", path, a.ck, { amount: 30, from_account: "cash", to_account: "bank" })), "PUT", path, a.ck, { amount: 40, from_account: "cash", to_account: "bank" });
    expect(s.status).toBe(409);
    expect(await json(s)).toMatchObject({ code: "stale" });
    expect(await ok(call("GET", "/ledger/balances", a.ck))).toEqual({ cash: -3000, bank: 3000, barbers: {} });

    expect(await ok(call("DELETE", path, a.ck))).toEqual({ ok: true });
    expect(await liveLines(a.org.id, "transfer", t.id)).toEqual([]);
    expect(await ok(call("GET", "/ledger/balances", a.ck))).toEqual({ cash: 0, bank: 0, barbers: {} });
    expect((await call("DELETE", path, a.ck)).status).toBe(404);
    expect((await audits(a.org.id, "transfer", t.id)).map((l) => l.action)).toEqual(["create", "update", "update", "delete"]);
  });
});

describe("RF4: parallel payout and transfer creates across orgs", () => {
  it("each response id is the audit entity_id and the ledger source_id, in the right org", async () => {
    const a = await setup("lg-rf4-a");
    const b = await setup("lg-rf4-b");
    const jobs: Promise<{ org: string; kind: string; amount: number; r: any }>[] = [];
    for (let i = 1; i <= 5; i++) {
      for (const o of [a, b]) {
        const amt = o === a ? i : i + 10;
        jobs.push(ok(call("POST", "/payouts", o.ck, { barber_id: o.b1.id, amount: amt, paid_from: "cash" })).then((r) => ({ org: o.org.id, kind: "payout", amount: amt * 100, r })));
        jobs.push(ok(call("POST", "/transfers", o.ck, { amount: amt, from_account: "cash", to_account: "bank" })).then((r) => ({ org: o.org.id, kind: "transfer", amount: amt * 100, r })));
      }
    }
    const done = await Promise.all(jobs);
    for (const d of done) {
      const table = d.kind === "payout" ? "barber_payouts" : "money_transfers";
      expect(await env.DB.prepare(`SELECT org_id, amount FROM ${table} WHERE id = ?`).bind(d.r.id).first()).toEqual({ org_id: d.org, amount: d.amount });
      expect(d.r.amount).toBe(d.amount);
      const aud = await env.DB.prepare("SELECT org_id, after FROM audit_log WHERE entity = ? AND entity_id = ?").bind(d.kind, d.r.id).all<any>();
      expect(aud.results).toHaveLength(1);
      expect(aud.results[0].org_id).toBe(d.org);
      expect(JSON.parse(aud.results[0].after)).toMatchObject({ amount: d.amount });
      const led = await env.DB.prepare("SELECT org_id, amount FROM ledger_entries WHERE source = ? AND source_id = ? ORDER BY id").bind(d.kind, d.r.id).all();
      expect(led.results).toEqual([{ org_id: d.org, amount: -d.amount }, { org_id: d.org, amount: d.kind === "payout" ? -d.amount : d.amount }]);
    }
  });
});

describe("access", () => {
  it("pro (no ledger) gets 403 feature_disabled on every route; pro_max gets 200; barbers get 403", async () => {
    const p = await setup("lg-pro", "pro");
    for (const [m, path, body] of [
      ["GET", "/transfers", undefined],
      ["POST", "/transfers", { amount: 1, from_account: "cash", to_account: "bank" }],
      ["PUT", "/transfers/1", {}],
      ["DELETE", "/transfers/1", undefined],
      ["GET", "/ledger/balances", undefined],
      ["PUT", "/ledger/balances", { cash: 0, bank: 0 }],
      ["GET", "/ledger/shop", undefined],
      ["GET", "/payouts", undefined],
      ["POST", "/payouts", {}],
      ["PUT", "/payouts/1", {}],
      ["DELETE", "/payouts/1", undefined],
      ["GET", "/ledger/barbers", undefined],
      ["GET", "/ledger/barbers/1", undefined],
    ] as const) {
      const r = await call(m, path, p.ck, body);
      expect(r.status, `${m} ${path}`).toBe(403);
      expect(await json(r)).toMatchObject({ code: "feature_disabled" });
    }
    const x = await setup("lg-pm");
    for (const path of ["/transfers", "/ledger/balances", "/ledger/shop", "/payouts", "/ledger/barbers"]) {
      expect((await call("GET", path, x.ck)).status, path).toBe(200);
      const r = await call("GET", path, x.k1);
      expect(r.status, `barber ${path}`).toBe(403);
      expect(await json(r)).toEqual({ error: "You don't have access to this" });
    }
    // No router-level guard: an unknown path under /ledger is 404, even without a session.
    expect((await call("GET", "/ledger/nope", "")).status).toBe(404);
    expect((await call("GET", "/ledger/nope", x.ck)).status).toBe(404);
  });

  it("GET /ledger/barbers/:id is 404 for an unknown id", async () => {
    const a = await setup("lg-bb-404");
    expect((await call("GET", "/ledger/barbers/999999", a.ck)).status).toBe(404);
  });
});
