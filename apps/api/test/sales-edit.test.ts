import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { businessDay, addDays } from "../src/lib/clock";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { PUBLIC_LIMITS } from "../src/lib/limits";
import { hooks } from "../src/tenant/sales/hooks";

// waitUntil work (customer stats) is collected so tests can await it deterministically.
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
const flush = async () => { while (pending.length) await pending.shift(); };
const E = { ...env, ROOT_DOMAIN: "" };
const call = async (method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
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
const post = async (ck: string, body: unknown) => json(await call("POST", "/sales", ck, body));
const put = (ck: string, id: number, body: unknown) => call("PUT", `/sales/${id}`, ck, body);
const del = (ck: string, id: number) => call("DELETE", `/sales/${id}`, ck);

const dubaiToday = () => businessDay(Date.now(), { timezone: "Asia/Dubai", dayStartHour: 4 });

async function setup(slug: string) {
  const org = await makeOrg({ slug, plan: "pro_max" });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  return { org, own, b1, b2, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1"), k2: await loginAs(slug, "b2") };
}
const setSettings = (orgId: string, sql: string, ...binds: unknown[]) =>
  env.DB.prepare(`UPDATE org_settings SET ${sql} WHERE org_id = ?`).bind(...binds, orgId).run();

/** Balance per book/account/barber from every line (reversals included). */
async function balances(orgId: string) {
  const r = await env.DB.prepare(
    "SELECT book, account, barber_id, SUM(amount) AS bal FROM ledger_entries WHERE org_id = ? GROUP BY book, account, barber_id ORDER BY book, account, barber_id",
  ).bind(orgId).all<any>();
  return r.results;
}
const lineCount = async (orgId: string, saleId: number) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE org_id = ? AND source = 'sale' AND source_id = ?").bind(orgId, saleId).first<any>()).n;

describe("PUT /api/sales/:id", () => {
  it("barbers: own sale and today only (403); admin edits any sale in the org", async () => {
    const a = await setup("ed-perm");
    const today = dubaiToday();
    const mine = await post(a.k1, { amount: 10, payment_mode: "cash" });
    const other = await post(a.k2, { amount: 10, payment_mode: "cash" });
    const old = await post(a.ck, { amount: 10, payment_mode: "cash", barber_id: a.b1.id, day: addDays(today, -1) });

    const r1 = await put(a.k1, other.id, { amount: 20, payment_mode: "cash" });
    expect(r1.status).toBe(403);
    expect(await r1.json()).toEqual({ error: "You don't have access to this" });
    const r2 = await put(a.k1, old.id, { amount: 20, payment_mode: "cash" });
    expect(r2.status).toBe(403);
    expect(await r2.json()).toEqual({ error: "Old sales can only be changed by the admin" });
    expect((await del(a.k1, other.id)).status).toBe(403);
    expect((await del(a.k1, old.id)).status).toBe(403);

    const ok = await put(a.k1, mine.id, { amount: 20, payment_mode: "card", note: "fix" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: mine.id, bill_no: mine.bill_no, token: mine.token, amount: 2000, payment_mode: "card", note: "fix", barber_id: a.b1.id });
    // A barber can't move the sale to someone else or another day.
    expect(await json(await put(a.k1, mine.id, { amount: 20, payment_mode: "card", barber_id: a.b2.id, day: addDays(today, -2) }))).toMatchObject({ barber_id: a.b1.id, day: today });

    // Admin: another barber's old sale, move barber and day.
    const adm = await put(a.ck, old.id, { amount: 30, payment_mode: "cash", barber_id: a.b2.id, day: addDays(today, -3) });
    expect(adm.status).toBe(200);
    expect(await adm.json()).toMatchObject({ id: old.id, bill_no: old.bill_no, amount: 3000, barber_id: a.b2.id, barber_name: "b2", day: addDays(today, -3) });
    expect((await put(a.ck, old.id, { amount: 30, payment_mode: "cash", day: addDays(today, 1) })).status).toBe(400);
    expect((await put(a.ck, old.id, { amount: 30, payment_mode: "cash", barber_id: 999999 })).status).toBe(400);
    expect((await put(a.ck, old.id, { amount: 0, payment_mode: "cash" })).status).toBe(400);
    expect((await put(a.ck, old.id, { amount: 10, payment_mode: "bitcoin" })).status).toBe(400);
    expect((await put(a.ck, 999999, { amount: 10, payment_mode: "cash" })).status).toBe(404);
    const created = await env.DB.prepare("SELECT created_by FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, old.id).first<any>();
    expect(created.created_by).toBe(a.own.id);
  });

  it("recomputes commission (snapshot pct unless the barber changes) and VAT (snapshot rate); items replaced", async () => {
    const a = await setup("ed-money");
    await setSettings(a.org.id, "default_commission_pct = 10, vat_enabled = 1, vat_rate = 5");
    await env.DB.prepare("UPDATE users SET commission_pct = 20 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b1.id).run();
    const svc = await json(await call("POST", "/services", a.ck, { category: "Haircuts", name: "Cut", price: 30 }));
    const s = await post(a.k1, { payment_mode: "cash", items: [{ service_id: svc.id, qty: 1 }, { name: "Wax", price: 5, qty: 1 }] });
    expect(s).toMatchObject({ amount: 3500, commission_pct: 20, commission: 700 });
    // Later rate changes don't touch an edited sale's snapshot when the barber stays.
    await env.DB.prepare("UPDATE users SET commission_pct = 50 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b1.id).run();
    await setSettings(a.org.id, "vat_rate = 10");
    const e = await json(await put(a.k1, s.id, { payment_mode: "cash", items: [{ name: "Gel", price: 21, qty: 1 }] }));
    expect(e).toMatchObject({ amount: 2100, commission_pct: 20, commission: 420, vat_rate: 5, vat_amount: 100, items: [{ service_id: null, name: "Gel", price: 2100, qty: 1 }] });
    const items = await env.DB.prepare("SELECT name FROM sale_items WHERE org_id = ? AND sale_id = ?").bind(a.org.id, s.id).all();
    expect(items.results).toEqual([{ name: "Gel" }]);
    // Moving to another barber takes their current pct (else the default).
    const m = await json(await put(a.ck, s.id, { payment_mode: "cash", amount: 21, barber_id: a.b2.id }));
    expect(m).toMatchObject({ barber_id: a.b2.id, commission_pct: 10, commission: 210, items: [] });
  });

  it("money changes reverse and repost; balances stay consistent; note-only changes don't repost; audit before/after", async () => {
    const a = await setup("ed-ledger");
    await setSettings(a.org.id, "default_commission_pct = 20");
    const s = await post(a.k1, { amount: 50, payment_mode: "cash", customer_name: "Ali" });
    expect(await lineCount(a.org.id, s.id)).toBe(2);

    // Note and name only: memo changes, no repost.
    expect((await put(a.k1, s.id, { amount: 50, payment_mode: "cash", customer_name: "Ali B", note: "hello" })).status).toBe(200);
    expect(await lineCount(a.org.id, s.id)).toBe(2);

    // Money: amount and mode change -> 2 reversals + 2 new lines.
    expect((await put(a.k1, s.id, { amount: 80, payment_mode: "card", customer_name: "Ali B", note: "hello" })).status).toBe(200);
    expect(await lineCount(a.org.id, s.id)).toBe(6);
    expect(await balances(a.org.id)).toEqual([
      { book: "barber", account: null, barber_id: a.b1.id, bal: 1600 },
      { book: "shop", account: "bank", barber_id: null, bal: 8000 },
      { book: "shop", account: "cash", barber_id: null, bal: 0 },
    ]);
    const live = await env.DB.prepare("SELECT book, account, amount FROM ledger_entries WHERE org_id = ? AND source_id = ? AND reversed = 0 AND reverses_id IS NULL ORDER BY id")
      .bind(a.org.id, s.id).all();
    expect(live.results).toEqual([{ book: "shop", account: "bank", amount: 8000 }, { book: "barber", account: null, amount: 1600 }]);

    // Admin moves to b2: b1's commission goes back to 0, b2 is owed.
    await put(a.ck, s.id, { amount: 80, payment_mode: "card", barber_id: a.b2.id });
    const bal = await balances(a.org.id);
    expect(bal).toContainEqual({ book: "barber", account: null, barber_id: a.b1.id, bal: 0 });
    expect(bal).toContainEqual({ book: "barber", account: null, barber_id: a.b2.id, bal: 1600 });

    const audit = await env.DB.prepare("SELECT action, before, after FROM audit_log WHERE org_id = ? AND entity = 'sale' AND entity_id = ? ORDER BY id").bind(a.org.id, s.id).all<any>();
    expect(audit.results.map((x) => x.action)).toEqual(["create", "update", "update", "update"]);
    const u = audit.results[2];
    expect(JSON.parse(u.before)).toMatchObject({ amount: 5000, payment_mode: "cash", note: "hello", customer_label: "Ali B" });
    expect(JSON.parse(u.after)).toMatchObject({ amount: 8000, payment_mode: "card", commission: 1600 });
  });

  it("walk-in label: kept on edit; customer stats refreshed for old and new customer", async () => {
    const a = await setup("ed-cust");
    const w = await post(a.k1, { amount: 10, payment_mode: "cash" });
    expect(w.customer_label).toBe("Customer 1");
    expect(await json(await put(a.k1, w.id, { amount: 12, payment_mode: "cash" }))).toMatchObject({ customer_label: "Customer 1", amount: 1200 });

    const s = await post(a.k1, { amount: 10, payment_mode: "cash", customer_name: "Ali", customer_phone: "0501234567" });
    await flush();
    const stats = async (id: number) => env.DB.prepare("SELECT name, visits, spent FROM customers WHERE org_id = ? AND id = ?").bind(a.org.id, id).first<any>();
    expect(await stats(s.customer_id)).toMatchObject({ visits: 1, spent: 1000 });
    const e = await json(await put(a.k1, s.id, { amount: 20, payment_mode: "cash", customer_phone: "0559998888" }));
    expect(e.customer_id).not.toBe(s.customer_id);
    expect(e.customer_phone).toBe("0559998888");
    expect(e.customer_label).toMatch(/^Customer \d+$/);
    await flush();
    expect(await stats(s.customer_id)).toMatchObject({ visits: 0, spent: 0 });
    expect(await stats(e.customer_id)).toMatchObject({ visits: 1, spent: 2000 });
    // Removing the phone moves the sale to a name-only customer "Zed" (saved for the whole salon).
    const n = await json(await put(a.k1, s.id, { amount: 20, payment_mode: "cash", customer_name: "Zed" }));
    expect(n).toMatchObject({ customer_phone: null, customer_label: "Zed" });
    expect(n.customer_id).not.toBe(e.customer_id);
    await flush();
    expect(await stats(e.customer_id)).toMatchObject({ visits: 0 });
    expect(await stats(n.customer_id)).toMatchObject({ name: "Zed", visits: 1 });
    expect((await put(a.k1, s.id, { amount: 20, payment_mode: "cash", customer_phone: "12" })).status).toBe(400);
  });
});

describe("DELETE /api/sales/:id", () => {
  it("soft-deletes, reverses the lines, audits, refreshes stats; deleted sales 404 and drop out of the list", async () => {
    const a = await setup("del-sale");
    await setSettings(a.org.id, "default_commission_pct = 20");
    const s = await post(a.k1, { amount: 50, payment_mode: "cash", customer_name: "Ali", customer_phone: "0501234567" });
    const keep = await post(a.k1, { amount: 10, payment_mode: "card" });
    await flush();
    const r = await del(a.k1, s.id);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const row = await env.DB.prepare("SELECT deleted_at FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, s.id).first<any>();
    expect(row.deleted_at).toBeGreaterThan(0);
    expect(await lineCount(a.org.id, s.id)).toBe(4);
    expect(await balances(a.org.id)).toEqual([
      { book: "barber", account: null, barber_id: a.b1.id, bal: 200 },
      { book: "shop", account: "bank", barber_id: null, bal: 1000 },
      { book: "shop", account: "cash", barber_id: null, bal: 0 },
    ]);
    const audit = await env.DB.prepare("SELECT action, before, after FROM audit_log WHERE org_id = ? AND entity = 'sale' AND entity_id = ? ORDER BY id").bind(a.org.id, s.id).all<any>();
    expect(audit.results.map((x) => x.action)).toEqual(["create", "delete"]);
    expect(JSON.parse(audit.results[1].before)).toMatchObject({ amount: 5000 });
    expect(audit.results[1].after).toBeNull();
    await flush();
    expect(await env.DB.prepare("SELECT visits, spent FROM customers WHERE org_id = ? AND id = ?").bind(a.org.id, s.customer_id).first()).toEqual({ visits: 0, spent: 0 });

    expect((await del(a.k1, s.id)).status).toBe(404);
    expect((await put(a.ck, s.id, { amount: 10, payment_mode: "cash" })).status).toBe(404);
    expect(await lineCount(a.org.id, s.id)).toBe(4);
    const list = await json(await call("GET", "/sales", a.ck));
    expect(list.items.map((x: any) => x.id)).toEqual([keep.id]);
    // Admin may delete an old sale of anyone.
    const old = await post(a.ck, { amount: 10, payment_mode: "cash", barber_id: a.b2.id, day: addDays(dubaiToday(), -5) });
    expect((await del(a.ck, old.id)).status).toBe(200);
    // Users with only deleted sales still count as having activity (deactivated, not deleted).
    expect(await json(await call("DELETE", `/users/${a.b2.id}`, a.ck))).toMatchObject({ deactivated: true });
  });
});

describe("optimistic concurrency (a concurrent write lands between the read and the batch)", () => {
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
  const callIn = (e: any, method: string, path: string, cookie: string, body?: unknown) =>
    app.fetch(
      new Request(`https://x.test/api${path}`, {
        method,
        headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      e,
      ctx,
    );
  const auditCount = async (orgId: string, saleId: number, action?: string) =>
    (await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE org_id = ? AND entity = 'sale' AND entity_id = ?${action ? " AND action = ?" : ""}`)
      .bind(orgId, saleId, ...(action ? [action] : [])).first<any>()).n;
  const liveLines = async (orgId: string, saleId: number) =>
    (await env.DB.prepare("SELECT book, account, amount FROM ledger_entries WHERE org_id = ? AND source = 'sale' AND source_id = ? AND reversed = 0 AND reverses_id IS NULL ORDER BY id")
      .bind(orgId, saleId).all()).results;

  it("edit vs edit: the stale PUT gets 409 and writes nothing; the ledger matches the winner", async () => {
    const a = await setup("occ-ee");
    await setSettings(a.org.id, "default_commission_pct = 20");
    const s = await post(a.k1, { amount: 50, payment_mode: "cash" });
    // The winner reposts to 80 card; the loser (read the 50 cash version) sends a note-only change.
    const e = racing(() => put(a.ck, s.id, { amount: 80, payment_mode: "card" }));
    const r = await callIn(e, "PUT", `/sales/${s.id}`, a.k1, { amount: 50, payment_mode: "cash", note: "stale" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "This sale was changed by someone else. Reload and try again.", code: "stale" });
    const row = await env.DB.prepare("SELECT amount, payment_mode, note FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, s.id).first();
    expect(row).toEqual({ amount: 8000, payment_mode: "card", note: null });
    expect(await auditCount(a.org.id, s.id, "update")).toBe(1);
    expect(await lineCount(a.org.id, s.id)).toBe(6);
    expect(await liveLines(a.org.id, s.id)).toEqual([{ book: "shop", account: "bank", amount: 8000 }, { book: "barber", account: null, amount: 1600 }]);
  });

  it("edit vs delete: the PUT gets 404, posts no lines, and the deleted sale's lines net to 0", async () => {
    const a = await setup("occ-ed");
    await setSettings(a.org.id, "default_commission_pct = 20");
    const s = await post(a.k1, { amount: 50, payment_mode: "cash", note: "x" });
    const e = racing(() => del(a.ck, s.id));
    const r = await callIn(e, "PUT", `/sales/${s.id}`, a.k1, { amount: 70, payment_mode: "card", items: [{ name: "Gel", price: 70 }] });
    expect(r.status).toBe(404);
    expect(await liveLines(a.org.id, s.id)).toEqual([]);
    expect(await lineCount(a.org.id, s.id)).toBe(4);
    for (const b of await balances(a.org.id)) expect(b.bal).toBe(0);
    expect(await auditCount(a.org.id, s.id, "update")).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM sale_items WHERE org_id = ? AND sale_id = ?").bind(a.org.id, s.id).first<any>()).n).toBe(0);
  });

  it("afterSaleEdit / afterSaleDelete run once when the write took effect, never on a stale 409", async () => {
    const a = await setup("occ-hooks");
    const edits: [number, number, number][] = [];
    const dels: number[] = [];
    const orig = { e: hooks.afterSaleEdit, d: hooks.afterSaleDelete };
    hooks.afterSaleEdit = async (_c, before, after) => { edits.push([before.id, before.amount, after.amount]); };
    hooks.afterSaleDelete = async (_c, sale) => { dels.push(sale.id); };
    try {
      const s = await post(a.k1, { amount: 50, payment_mode: "cash" });
      expect((await put(a.ck, s.id, { amount: 60, payment_mode: "cash" })).status).toBe(200);
      await flush();
      expect(edits).toEqual([[s.id, 5000, 6000]]);
      // stale PUT: only the racing winner's edit fires
      const r = await callIn(racing(() => put(a.ck, s.id, { amount: 70, payment_mode: "card" })), "PUT", `/sales/${s.id}`, a.k1, { amount: 60, payment_mode: "cash", note: "x" });
      expect(r.status).toBe(409);
      await flush();
      expect(edits).toEqual([[s.id, 5000, 6000], [s.id, 6000, 7000]]);
      // stale DELETE: no delete hook (the racing edit fires its own edit hook)
      const d = await callIn(racing(() => put(a.ck, s.id, { amount: 80, payment_mode: "card" })), "DELETE", `/sales/${s.id}`, a.k1);
      expect(d.status).toBe(409);
      await flush();
      expect(dels).toEqual([]);
      expect(edits).toHaveLength(3);
      expect((await del(a.ck, s.id)).status).toBe(200);
      await flush();
      expect(dels).toEqual([s.id]);
      // a hook that throws never fails the request
      hooks.afterSaleDelete = () => { throw new Error("boom"); };
      const s2 = await post(a.k1, { amount: 10, payment_mode: "cash" });
      expect((await del(a.ck, s2.id)).status).toBe(200);
      await flush();
    } finally {
      hooks.afterSaleEdit = orig.e;
      hooks.afterSaleDelete = orig.d;
    }
  });

  it("stale DELETE gets 409 and reverses nothing; double DELETE writes exactly one delete audit row", async () => {
    const a = await setup("occ-del");
    const s = await post(a.k1, { amount: 50, payment_mode: "cash" });
    const r = await callIn(racing(() => put(a.ck, s.id, { amount: 60, payment_mode: "cash" })), "DELETE", `/sales/${s.id}`, a.k1);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "stale" });
    expect((await env.DB.prepare("SELECT deleted_at FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, s.id).first<any>()).deleted_at).toBeNull();
    expect(await liveLines(a.org.id, s.id)).toEqual([{ book: "shop", account: "cash", amount: 6000 }]);
    expect(await auditCount(a.org.id, s.id, "delete")).toBe(0);

    const d = await callIn(racing(() => del(a.ck, s.id)), "DELETE", `/sales/${s.id}`, a.k1);
    expect(d.status).toBe(404);
    expect(await auditCount(a.org.id, s.id, "delete")).toBe(1);
    expect(await liveLines(a.org.id, s.id)).toEqual([]);
    expect(await lineCount(a.org.id, s.id)).toBe(4);
  });
});

describe("GET /api/public/receipt/:token", () => {
  const ROOT = "salonkit.online";
  const getReceipt = (host: string, token: string, root = ROOT) =>
    app.fetch(new Request(`https://${host}/api/public/receipt/${token}`, { headers: { "CF-Connecting-IP": "7.7.7.7" } }), { ...env, ROOT_DOMAIN: root }, ctx);

  it("takes the org from the token (not the host) and returns that org's branding, no internal fields", async () => {
    const a = await setup("rc-a");
    await makeOrg({ slug: "rc-b" });
    await setSettings(
      a.org.id,
      "display_name = 'Alpha Cuts', salon_name_ar = 'ألفا', tagline = 'Sharp', address = 'Main St', contact_phone = '+97141234567', trn = '100000000000003', licence_no = 'L-1', receipt_footer = 'Thanks!', default_commission_pct = 20, vat_enabled = 1, vat_rate = 5",
    );
    // the logo comes from org_assets (derived URL), not a stored column
    await env.DB.prepare("INSERT INTO org_assets(org_id, kind, bytes, type, v) VALUES(?, 'logo', ?, 'image/png', 3)").bind(a.org.id, new Uint8Array([1, 2])).run();
    const s = await post(a.k1, { payment_mode: "card", items: [{ name: "Cut", price: 21, qty: 1 }], customer_name: "Ali", customer_phone: "0501234567", note: "n" });
    const r = await getReceipt(`rc-b.${ROOT}`, s.token);
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body).toEqual({
      sale: {
        bill_no: s.bill_no,
        day: s.day,
        barber_name: "b1",
        customer_label: "Ali",
        customer_phone: "0501234567",
        amount: 2100,
        payment_mode: "card",
        vat_rate: 5,
        vat_amount: 100,
        created_at: s.created_at,
        items: [{ service_id: null, name: "Cut", price: 2100, qty: 1 }],
        note: "n",
      },
      salon: {
        salon_name: "Alpha Cuts",
        display_name: "Alpha Cuts",
        salon_name_ar: "ألفا",
        tagline: "Sharp",
        address: "Main St",
        phone: "+97141234567",
        trn: "100000000000003",
        licence_no: "L-1",
        receipt_footer: "Thanks!",
        google_maps_url: null,
        logo_url: "/api/public/logo/3?org=rc-a",
        currency: "AED",
        currency_minor: 100,
        locale: expect.any(String),
        timezone: "Asia/Dubai",
      },
    });
    // workers.dev style (no ROOT_DOMAIN) works too.
    expect((await getReceipt("x.test", s.token, "")).status).toBe(200);
  });

  it("404 for unknown tokens, deleted sales and deactivated or deleted orgs", async () => {
    const a = await setup("rc-404");
    const s = await post(a.k1, { amount: 10, payment_mode: "cash" });
    const t = await post(a.k1, { amount: 10, payment_mode: "cash" });
    expect((await getReceipt("x.test", "nope", "")).status).toBe(404);
    expect(await (await getReceipt("x.test", "nope", "")).json()).toEqual({ error: "Not found" });
    expect((await del(a.k1, s.id)).status).toBe(200);
    expect((await getReceipt("x.test", s.token, "")).status).toBe(404);
    expect((await getReceipt("x.test", t.token, "")).status).toBe(200);
    await env.DB.prepare("UPDATE orgs SET status = 'deactivated' WHERE id = ?").bind(a.org.id).run();
    expect((await getReceipt("x.test", t.token, "")).status).toBe(404);
    await env.DB.prepare("UPDATE orgs SET status = 'deleted' WHERE id = ?").bind(a.org.id).run();
    expect((await getReceipt("x.test", t.token, "")).status).toBe(404);
  });

  it("is rate limited per IP (pub bucket)", async () => {
    const hit = () => app.fetch(new Request("https://x.test/api/public/receipt/nope-nope-nope", { headers: { "CF-Connecting-IP": "6.6.6.6" } }), E, ctx);
    for (let i = 0; i < PUBLIC_LIMITS.pub; i++) expect((await hit()).status, `hit ${i}`).toBe(404);
    expect((await hit()).status).toBe(429);
  });
});
