import { env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import app from "../src/index";
import { businessDay, addDays, dayStamp } from "../src/lib/clock";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { ledgerRepo } from "../src/data/tenant";
import { hooks } from "../src/tenant/sales/hooks";

// waitUntil work (customer stats, hooks) is collected so tests can await it deterministically.
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
const post = async (ck: string, body: unknown) => call("POST", "/sales", ck, body);
const json = async (r: Response): Promise<any> => r.json();

const dubaiToday = () => businessDay(Date.now(), { timezone: "Asia/Dubai", dayStartHour: 4 });

async function setup(slug: string) {
  const org = await makeOrg({ slug, plan: "pro_max" });
  await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  return { org, b1, b2, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1"), k2: await loginAs(slug, "b2") };
}
const setSettings = (orgId: string, sql: string, ...binds: unknown[]) =>
  env.DB.prepare(`UPDATE org_settings SET ${sql} WHERE org_id = ?`).bind(...binds, orgId).run();

afterEach(() => { vi.useRealTimers(); });

describe("POST /api/sales", () => {
  it("numbers bills per org per day and labels walk-ins Customer n", async () => {
    const a = await setup("alpha-bill");
    const stamp = dayStamp(dubaiToday());
    const r1 = await post(a.ck, { amount: 25, payment_mode: "cash" });
    expect(r1.status).toBe(201);
    const s1 = await json(r1);
    expect(s1).toMatchObject({ bill_no: `ALP-${stamp}-001`, customer_label: "Customer 1", amount: 2500, day: dubaiToday(), customer_id: null, items: [] });
    expect(s1.token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const s2 = await json(await post(a.ck, { amount: "30.5", payment_mode: "card" }));
    expect(s2).toMatchObject({ bill_no: `ALP-${stamp}-002`, customer_label: "Customer 2", amount: 3050, payment_mode: "card" });
    const b = await setup("beta-bill");
    expect((await json(await post(b.ck, { amount: 10, payment_mode: "cash" }))).bill_no).toBe(`BET-${stamp}-001`);
    // A named customer does not use up a walk-in number.
    expect((await json(await post(a.ck, { amount: 10, payment_mode: "cash", customer_name: "Ali" }))).customer_label).toBe("Ali");
    expect((await json(await post(a.ck, { amount: 10, payment_mode: "cash" }))).customer_label).toBe("Customer 3");
  });

  it("validates before using up a bill number", async () => {
    const a = await setup("val-bill");
    expect((await post(a.ck, { amount: 25, payment_mode: "bitcoin" })).status).toBe(400);
    expect((await post(a.ck, { amount: 0, payment_mode: "cash" })).status).toBe(400);
    expect((await post(a.ck, { amount: "abc", payment_mode: "cash" })).status).toBe(400);
    expect((await post(a.ck, { amount: 25, payment_mode: "cash", customer_phone: "12" })).status).toBe(400);
    expect((await post(a.ck, { items: [{ name: "Wax" }], payment_mode: "cash" })).status).toBe(400);
    expect((await json(await post(a.ck, { amount: 25, payment_mode: "cash" }))).bill_no).toMatch(/-001$/);
  });

  it("commission (barber pct, else default) and VAT (only when enabled) in percent, snapshotted", async () => {
    const a = await setup("comm-vat");
    await setSettings(a.org.id, "default_commission_pct = ?, vat_enabled = 1, vat_rate = ?", 10, 5);
    await env.DB.prepare("UPDATE users SET commission_pct = 20 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b1.id).run();
    const s1 = await json(await post(a.k1, { amount: 105, payment_mode: "cash" }));
    expect(s1).toMatchObject({ barber_id: a.b1.id, amount: 10500, commission_pct: 20, commission: 2100, vat_rate: 5, vat_amount: 500 });
    const s2 = await json(await post(a.k2, { amount: 105, payment_mode: "cash" }));
    expect(s2).toMatchObject({ barber_id: a.b2.id, commission_pct: 10, commission: 1050, vat_amount: 500 });
    await setSettings(a.org.id, "vat_enabled = 0");
    const s3 = await json(await post(a.k2, { amount: 33.33, payment_mode: "cash" }));
    expect(s3).toMatchObject({ amount: 3333, commission: 333, vat_rate: 0, vat_amount: 0 });
    // Changing the barber's rate later does not rewrite the stored sale.
    await env.DB.prepare("UPDATE users SET commission_pct = 50 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b1.id).run();
    const row = await env.DB.prepare("SELECT commission_pct, commission FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, s1.id).first();
    expect(row).toEqual({ commission_pct: 20, commission: 2100 });
  });

  it("uses the org's minor unit", async () => {
    const a = await setup("kwd-sale");
    await setSettings(a.org.id, "currency = 'KWD', currency_minor = 1000");
    expect((await json(await post(a.ck, { amount: 1.255, payment_mode: "cash" }))).amount).toBe(1255);
  });

  it("items: catalogue name; typed price wins else catalogue price; hidden services ok; qty 1..20; one-off items; max 30", async () => {
    const a = await setup("items-sale");
    const svc = await json(await call("POST", "/services", a.ck, { category: "Haircuts", name: "Haircut", price: 30 }));
    const hidden = await json(await call("POST", "/services", a.ck, { category: "Haircuts", name: "Old", price: 5, active: false }));
    const r = await post(a.k1, {
      payment_mode: "cash",
      amount: 999,
      items: [
        { service_id: svc.id, qty: 2, price: 10, name: "Cheap" },
        { service_id: svc.id, qty: 1 },
        { service_id: svc.id, qty: 1, price: "" },
        { service_id: hidden.id, qty: 1 },
        { name: "Wax", price: "5.5", qty: 0 },
        { name: "Gel", price: 1, qty: 50 },
      ],
    });
    expect(r.status).toBe(201);
    const s = await json(r);
    expect(s.items).toEqual([
      { service_id: svc.id, name: "Haircut", price: 1000, qty: 2 },
      { service_id: svc.id, name: "Haircut", price: 3000, qty: 1 },
      { service_id: svc.id, name: "Haircut", price: 3000, qty: 1 },
      { service_id: hidden.id, name: "Old", price: 500, qty: 1 },
      { service_id: null, name: "Wax", price: 550, qty: 1 },
      { service_id: null, name: "Gel", price: 100, qty: 20 },
    ]);
    expect(s.amount).toBe(2000 + 3000 + 3000 + 500 + 550 + 2000);
    const rows = await env.DB.prepare("SELECT org_id, sale_id, service_id, name, price, qty FROM sale_items WHERE org_id = ? ORDER BY id").bind(a.org.id).all<any>();
    expect(rows.results).toHaveLength(6);
    expect(rows.results.every((x) => x.sale_id === s.id)).toBe(true);
    const badPrice = await post(a.k1, { payment_mode: "cash", items: [{ service_id: svc.id, price: "abc" }] });
    expect(badPrice.status).toBe(400);
    expect(await badPrice.json()).toEqual({ error: "Enter a price for Haircut, e.g. 25" });
    const gone = await post(a.k1, { payment_mode: "cash", items: [{ service_id: 999999 }] });
    expect(gone.status).toBe(400);
    expect(await gone.json()).toEqual({ error: "One of the services no longer exists. Refresh and pick again." });
    const many = Array.from({ length: 31 }, () => ({ service_id: svc.id }));
    expect((await post(a.k1, { payment_mode: "cash", items: many })).status).toBe(400);
    expect((await post(a.k1, { payment_mode: "cash", items: many.slice(0, 30) })).status).toBe(201);
  });

  it("customer upsert: admin overwrites the name, a barber only fills a blank one; stats refresh", async () => {
    const a = await setup("cust-sale");
    const s1 = await json(await post(a.k1, { amount: 20, payment_mode: "cash", customer_name: "Ali", customer_phone: "050 123 4567" }));
    expect(s1).toMatchObject({ customer_label: "Ali", customer_phone: "0501234567" });
    expect(s1.customer_id).toBeGreaterThan(0);
    const s2 = await json(await post(a.k1, { amount: 30, payment_mode: "card", customer_name: "Bob", customer_phone: "+971501234567" }));
    expect(s2).toMatchObject({ customer_id: s1.customer_id, customer_label: "Bob" });
    const name = async () => (await env.DB.prepare("SELECT name FROM customers WHERE org_id = ? AND id = ?").bind(a.org.id, s1.customer_id).first<any>()).name;
    expect(await name()).toBe("Ali");
    const s3 = await json(await post(a.k2, { amount: 10, payment_mode: "cash", customer_phone: "0501234567" }));
    expect(s3.customer_label).toBe("Ali");
    await json(await post(a.ck, { amount: 10, payment_mode: "cash", customer_name: "Ahmed", customer_phone: "0501234567" }));
    expect(await name()).toBe("Ahmed");
    // A new phone with no name: blank customer, walk-in label; a barber can then fill the name in.
    const s5 = await json(await post(a.k1, { amount: 10, payment_mode: "cash", customer_phone: "0559998888" }));
    expect(s5.customer_label).toBe("Customer 1");
    await post(a.k1, { amount: 10, payment_mode: "cash", customer_phone: "0559998888", customer_name: "Zed" });
    expect((await env.DB.prepare("SELECT name FROM customers WHERE org_id = ? AND id = ?").bind(a.org.id, s5.customer_id).first<any>()).name).toBe("Zed");
    await flush();
    const st = await env.DB.prepare("SELECT visits, spent, last_visit_at FROM customers WHERE org_id = ? AND id = ?").bind(a.org.id, s1.customer_id).first<any>();
    expect(st).toMatchObject({ visits: 4, spent: 7000 });
    expect(st.last_visit_at).toBeGreaterThan(0);
  });

  it("RF3: another org upserting the same phone gets its own customer", async () => {
    const a = await setup("rf3-a");
    const b = await setup("rf3-b");
    const sa = await json(await post(a.ck, { amount: 20, payment_mode: "cash", customer_name: "Ali", customer_phone: "0501234567" }));
    const sb = await json(await post(b.ck, { amount: 20, payment_mode: "cash", customer_name: "Other", customer_phone: "0501234567" }));
    expect(sb.customer_id).not.toBe(sa.customer_id);
    await flush();
    const ca = await env.DB.prepare("SELECT name, visits FROM customers WHERE org_id = ? AND id = ?").bind(a.org.id, sa.customer_id).first();
    expect(ca).toEqual({ name: "Ali", visits: 1 });
    const cb = await env.DB.prepare("SELECT name, visits FROM customers WHERE org_id = ? AND id = ?").bind(b.org.id, sb.customer_id).first();
    expect(cb).toEqual({ name: "Other", visits: 1 });
  });

  it("posts the ledger (cash/bank + commission on the barber book) and the audit row", async () => {
    const a = await setup("ledger-sale");
    await setSettings(a.org.id, "default_commission_pct = 20");
    const s = await json(await post(a.k1, { amount: 50, payment_mode: "cash", customer_name: "Ali" }));
    const lines = await env.DB.prepare("SELECT book, account, barber_id, amount, kind, source, source_id, ref, memo, day, actor_id, reversed FROM ledger_entries WHERE org_id = ? ORDER BY id")
      .bind(a.org.id).all<any>();
    expect(lines.results).toEqual([
      { book: "shop", account: "cash", barber_id: null, amount: 5000, kind: "sale", source: "sale", source_id: s.id, ref: s.bill_no, memo: `Bill ${s.bill_no} · Ali`, day: s.day, actor_id: a.b1.id, reversed: 0 },
      { book: "barber", account: null, barber_id: a.b1.id, amount: 1000, kind: "commission", source: "sale", source_id: s.id, ref: s.bill_no, memo: `Commission · ${s.bill_no}`, day: s.day, actor_id: a.b1.id, reversed: 0 },
    ]);
    const audit = await env.DB.prepare("SELECT entity, entity_id, ref, action, actor_id, after FROM audit_log WHERE org_id = ? AND entity = 'sale'").bind(a.org.id).all<any>();
    expect(audit.results).toHaveLength(1);
    expect(audit.results[0]).toMatchObject({ entity_id: s.id, ref: s.bill_no, action: "create", actor_id: a.b1.id });
    expect(JSON.parse(audit.results[0].after)).toMatchObject({ amount: 5000, commission: 1000, commission_pct: 20, barber_id: a.b1.id, customer_label: "Ali", payment_mode: "cash", items: [] });
    // Card goes to the bank; no commission means no barber line.
    await setSettings(a.org.id, "default_commission_pct = 0");
    const c = await json(await post(a.k2, { amount: 10, payment_mode: "card" }));
    const cl = await env.DB.prepare("SELECT book, account, amount FROM ledger_entries WHERE org_id = ? AND source = 'sale' AND source_id = ?").bind(a.org.id, c.id).all();
    expect(cl.results).toEqual([{ book: "shop", account: "bank", amount: 1000 }]);
  });

  it("RF2: a sale at 03:30 org time lands on the previous business day (Kolkata)", async () => {
    const a = await setup("rf2-kol");
    await setSettings(a.org.id, "timezone = 'Asia/Kolkata', day_start_hour = 4, phone_country = '91'");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 1, 22, 0)); // 2026-11-02 03:30 IST
    const s = await json(await post(a.ck, { amount: 10, payment_mode: "cash" }));
    expect(s).toMatchObject({ day: "2026-11-01", bill_no: "RF2-20261101-001" });
    vi.setSystemTime(Date.UTC(2026, 10, 1, 23, 0)); // 04:30 IST
    expect(await json(await post(a.ck, { amount: 10, payment_mode: "cash" }))).toMatchObject({ day: "2026-11-02", bill_no: "RF2-20261102-001" });
    const p = await json(await post(a.ck, { amount: 10, payment_mode: "cash", customer_phone: "98765 43210" }));
    expect(p.customer_phone).toBe("+919876543210");
  });

  it("admin: past day and another barber of the same org; barbers always sell as themselves today", async () => {
    const a = await setup("admin-sale");
    const today = dubaiToday();
    const s = await json(await post(a.ck, { amount: 10, payment_mode: "cash", barber_id: a.b1.id, day: addDays(today, -3) }));
    expect(s).toMatchObject({ barber_id: a.b1.id, barber_name: "b1", day: addDays(today, -3), bill_no: expect.stringContaining(dayStamp(addDays(today, -3))) });
    const created = await env.DB.prepare("SELECT created_by FROM sales WHERE org_id = ? AND id = ?").bind(a.org.id, s.id).first<any>();
    expect(created.created_by).not.toBe(a.b1.id);
    expect((await post(a.ck, { amount: 10, payment_mode: "cash", day: addDays(today, 1) })).status).toBe(400);
    expect((await post(a.ck, { amount: 10, payment_mode: "cash", day: "2026-13-01" })).status).toBe(400);
    const own = await json(await post(a.ck, { amount: 10, payment_mode: "cash" }));
    expect(own.barber_name).toBe("own");
    const bs = await json(await post(a.k1, { amount: 10, payment_mode: "cash", barber_id: a.b2.id, day: addDays(today, -3) }));
    expect(bs).toMatchObject({ barber_id: a.b1.id, day: today });
    await env.DB.prepare("UPDATE users SET active = 0 WHERE org_id = ? AND id = ?").bind(a.org.id, a.b2.id).run();
    const r = await post(a.ck, { amount: 10, payment_mode: "cash", barber_id: a.b2.id });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Choose an active barber" });
    expect((await post(a.ck, { amount: 10, payment_mode: "cash", barber_id: "abc" })).status).toBe(400);
  });

  it("RF1: org B's admin cannot use org A's barber or service", async () => {
    const a = await setup("rf1-a");
    const b = await setup("rf1-b");
    const svcA = await json(await call("POST", "/services", a.ck, { category: "Haircuts", name: "Cut", price: 20 }));
    const r = await post(b.ck, { amount: 10, payment_mode: "cash", barber_id: a.b1.id });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Choose an active barber" });
    const rs = await post(b.ck, { payment_mode: "cash", items: [{ service_id: svcA.id }] });
    expect(rs.status).toBe(400);
    expect(await rs.json()).toEqual({ error: "One of the services no longer exists. Refresh and pick again." });
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sales WHERE org_id = ?").bind(b.org.id).first<any>();
    expect(n.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM sales WHERE barber_id = ?").bind(a.b1.id).first<any>()).n).toBe(0);
  });
});

describe("GET /api/sales", () => {
  it("barbers see only their own; admin filters, paging, total and sum; org scoped", async () => {
    const a = await setup("list-a");
    const s1 = await json(await post(a.k1, { amount: 10, payment_mode: "cash", customer_name: "Ali", customer_phone: "0501234567" }));
    await post(a.k1, { amount: 20, payment_mode: "card" });
    await post(a.k2, { amount: 40, payment_mode: "cash" });
    const mine = await json(await call("GET", "/sales", a.k1));
    expect(mine).toMatchObject({ total: 2, sum: 3000, page: 1, page_size: 50 });
    expect(mine.items.every((x: any) => x.barber_id === a.b1.id)).toBe(true);
    // A barber's barber_id filter is ignored.
    expect((await json(await call("GET", `/sales?barber_id=${a.b2.id}`, a.k1))).total).toBe(2);
    const all = await json(await call("GET", "/sales", a.ck));
    expect(all).toMatchObject({ total: 3, sum: 7000 });
    expect(all.items[0]).toMatchObject({ barber_name: "b2", amount: 4000, items: [] });
    expect((await json(await call("GET", `/sales?barber_id=${a.b2.id}`, a.ck))).total).toBe(1);
    expect((await json(await call("GET", "/sales?payment_mode=card", a.ck))).sum).toBe(2000);
    expect((await json(await call("GET", `/sales?q=${encodeURIComponent(s1.bill_no)}`, a.ck))).items.map((x: any) => x.id)).toEqual([s1.id]);
    expect((await json(await call("GET", "/sales?q=0501", a.ck))).total).toBe(1);
    expect((await json(await call("GET", "/sales?q=ali", a.ck))).total).toBe(1);
    expect((await json(await call("GET", "/sales?q=%25", a.ck))).total).toBe(0);
    expect((await json(await call("GET", `/sales?customer_id=${s1.customer_id}`, a.ck))).total).toBe(1);
    expect((await json(await call("GET", `/sales?day=${s1.day}`, a.ck))).total).toBe(3);
    expect((await json(await call("GET", `/sales?from=${addDays(s1.day, 1)}`, a.ck))).total).toBe(0);
    expect((await json(await call("GET", `/sales?to=${addDays(s1.day, -1)}`, a.ck))).total).toBe(0);
    const p = await json(await call("GET", "/sales?page_size=2&page=2", a.ck));
    expect(p).toMatchObject({ total: 3, page: 2, page_size: 2 });
    expect(p.items).toHaveLength(1);
    expect((await json(await call("GET", "/sales?page_size=500", a.ck))).page_size).toBe(200);
    expect((await call("GET", "/sales?barber_id=abc", a.ck)).status).toBe(400);

    const b = await setup("list-b");
    expect(await json(await call("GET", "/sales", b.ck))).toMatchObject({ total: 0, sum: 0, items: [] });
    expect((await json(await call("GET", `/sales?barber_id=${a.b1.id}`, b.ck))).total).toBe(0);
    expect((await json(await call("GET", `/sales?customer_id=${s1.customer_id}`, b.ck))).total).toBe(0);
  });
});

describe("GET /api/customers (autocomplete)", () => {
  it("is shared by the whole salon and scoped by org; q needs 2+ chars", async () => {
    const a = await setup("ac-a");
    await post(a.k1, { amount: 10, payment_mode: "cash", customer_name: "Alice", customer_phone: "0501234567" });
    await post(a.k2, { amount: 10, payment_mode: "cash", customer_name: "Zed", customer_phone: "0551112222" });
    await flush();
    const names = async (ck: string, q?: string) =>
      ((await json(await call("GET", `/customers${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`, ck))).items as any[]).map((x) => x.name);
    // Every barber sees the salon's customers, whoever added them.
    expect((await names(a.k1)).sort()).toEqual(["Alice", "Zed"]);
    expect((await names(a.k2)).sort()).toEqual(["Alice", "Zed"]);
    const first = await json(await call("GET", "/customers", a.k1));
    expect(Object.keys(first.items[0]).sort()).toEqual(["id", "name", "phone"]);
    expect(await names(a.k1, "A")).toEqual([]);
    expect(await names(a.k1, "Al")).toEqual(["Alice"]);
    expect(await names(a.k1, "1234")).toEqual(["Alice"]);
    expect(await names(a.k1, "Zed")).toEqual(["Zed"]);
    expect(await names(a.k1, "055 111 2222")).toEqual(["Zed"]);
    const b = await setup("ac-b");
    expect(await names(b.k1)).toEqual([]);
    expect(await names(b.k1, "0501234567")).toEqual([]);
    expect(await names(b.ck, "Alice")).toEqual([]);
  });

  it("a name-only customer is saved once for the salon and shows up for every barber", async () => {
    const a = await setup("ac-name");
    const s1 = await json(await post(a.k1, { amount: 10, payment_mode: "cash", customer_name: "Garam" }));
    const s2 = await json(await post(a.k2, { amount: 10, payment_mode: "cash", customer_name: "garam" }));
    await flush();
    expect(s1.customer_id).toBeGreaterThan(0);
    expect(s2.customer_id).toBe(s1.customer_id);
    const items = (await json(await call("GET", "/customers", a.k2))).items as any[];
    expect(items).toEqual([{ id: s1.customer_id, name: "Garam", phone: null }]);
    // A walk-in with no name stays off the list.
    await post(a.k1, { amount: 10, payment_mode: "cash" });
    expect((await json(await call("GET", "/customers", a.k1))).items).toHaveLength(1);
  });

  it("PUT /customers/:id: any barber adds the mobile; a mobile in use is refused", async () => {
    const a = await setup("ac-edit");
    const s = await json(await post(a.k1, { amount: 10, payment_mode: "cash", customer_name: "Garam" }));
    await post(a.k1, { amount: 10, payment_mode: "cash", customer_name: "Ali", customer_phone: "0501234567" });
    await flush();
    const r = await call("PUT", `/customers/${s.customer_id}`, a.k2, { name: "Garam K", phone: "055 111 2222" });
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ id: s.customer_id, name: "Garam K", phone: "0551112222" });
    expect((await call("PUT", `/customers/${s.customer_id}`, a.k2, { name: "Garam", phone: "0501234567" })).status).toBe(409);
    expect((await call("PUT", `/customers/${s.customer_id}`, a.k2, { name: "", phone: "" })).status).toBe(400);
    expect((await call("PUT", `/customers/${s.customer_id}`, a.k2, { name: "X", phone: "12" })).status).toBe(400);
    expect((await call("PUT", "/customers/999999", a.k2, { name: "X" })).status).toBe(404);
  });
});

describe("referential rulings", () => {
  it("deleting a service keeps the sold item's snapshot with service_id NULL", async () => {
    const a = await setup("svc-del-sale");
    const svc = await json(await call("POST", "/services", a.ck, { category: "Haircuts", name: "Cut", price: 20 }));
    const s = await json(await post(a.k1, { payment_mode: "cash", items: [{ service_id: svc.id, qty: 1 }] }));
    expect((await call("DELETE", `/services/${svc.id}`, a.ck)).status).toBe(200);
    const items = await env.DB.prepare("SELECT service_id, name, price, qty FROM sale_items WHERE org_id = ? AND sale_id = ?").bind(a.org.id, s.id).all();
    expect(items.results).toEqual([{ service_id: null, name: "Cut", price: 2000, qty: 1 }]);
    const list = await json(await call("GET", "/sales", a.ck));
    expect(list.items[0].items).toEqual([{ service_id: null, name: "Cut", price: 2000, qty: 1 }]);
  });

  it("users with sales (as barber or creator) or ledger lines are deactivated, not deleted", async () => {
    const a = await setup("act-sale");
    const adm = await makeUser(a.org.id, { username: "adm", role: "admin" });
    const b3 = await makeUser(a.org.id, { username: "b3", role: "barber" });
    const b4 = await makeUser(a.org.id, { username: "b4", role: "barber" });
    await post(a.k1, { amount: 10, payment_mode: "cash" });
    await post(await loginAs("act-sale", "adm"), { amount: 10, payment_mode: "cash", barber_id: a.b2.id });
    await env.DB.prepare(
      "INSERT INTO ledger_entries (org_id, at, day, book, account, barber_id, amount, kind, source, source_id, memo) VALUES (?, 1, '2026-11-01', 'barber', NULL, ?, -100, 'payout', 'payout', 1, 'x')",
    ).bind(a.org.id, b3.id).run();
    for (const id of [a.b1.id, adm.id, b3.id]) expect(await json(await call("DELETE", `/users/${id}`, a.ck)), String(id)).toMatchObject({ deactivated: true });
    expect(await json(await call("DELETE", `/users/${b4.id}`, a.ck))).toMatchObject({ deleted: true });
  });
});

describe("a service deleted between resolving the items and the write batch (M7)", () => {
  it("answers 400 with a refresh hint and writes nothing", async () => {
    const a = await setup("svc-race-sale");
    const svc = await json(await call("POST", "/services", a.ck, { category: "Haircuts", name: "Cut", price: 20 }));
    let done = false;
    const DB = new Proxy(env.DB, {
      get(t, k) {
        if (k === "batch")
          return async (stmts: D1PreparedStatement[]) => {
            if (!done) {
              done = true;
              await env.DB.prepare("DELETE FROM services WHERE org_id = ? AND id = ?").bind(a.org.id, svc.id).run();
            }
            return t.batch(stmts);
          };
        const v = (t as any)[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const r = await app.fetch(
      new Request("https://x.test/api/sales", {
        method: "POST",
        headers: { cookie: a.k1, "content-type": "application/json" },
        body: JSON.stringify({ payment_mode: "cash", items: [{ service_id: svc.id, qty: 1 }] }),
      }),
      { ...E, DB },
      ctx,
    );
    expect(done).toBe(true);
    expect(r.status).toBe(400);
    expect(await json(r)).toEqual({ error: "One of the services no longer exists. Refresh and pick again." });
    for (const t of ["sales", "sale_items", "ledger_entries"])
      expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE org_id = ?`).bind(a.org.id).first<any>()).n, t).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE org_id = ? AND entity = 'sale'").bind(a.org.id).first<any>()).n).toBe(0);
  });
});

describe("a service deleted mid-request on PUT /sales/:id (Plan 3 start follow-up)", () => {
  it("answers 400 like create, not 500", async () => {
    const a = await setup("svc-race-put");
    const svc = await json(await call("POST", "/services", a.ck, { category: "Haircuts", name: "Cut", price: 20 }));
    const sale = await json(await post(a.ck, { payment_mode: "cash", items: [{ service_id: svc.id, qty: 1 }] }));
    let done = false;
    const DB = new Proxy(env.DB, {
      get(t, k) {
        if (k === "batch")
          return async (stmts: D1PreparedStatement[]) => {
            if (!done) {
              done = true;
              await env.DB.prepare("DELETE FROM services WHERE org_id = ? AND id = ?").bind(a.org.id, svc.id).run();
            }
            return t.batch(stmts);
          };
        const v = (t as any)[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const r = await app.fetch(
      new Request(`https://x.test/api/sales/${sale.id}`, {
        method: "PUT",
        headers: { cookie: a.ck, "content-type": "application/json" },
        body: JSON.stringify({ payment_mode: "card", items: [{ service_id: svc.id, qty: 2 }] }),
      }),
      { ...E, DB },
      ctx,
    );
    expect(done).toBe(true);
    expect(r.status).toBe(400);
    expect(await json(r)).toEqual({ error: "One of the services no longer exists. Refresh and pick again." });
  });
});

describe("ledger data layer and hooks", () => {
  it("reverseStmts only touches the caller's org (INV§8.4)", async () => {
    const a = await setup("lg-rev-a");
    const b = await setup("lg-rev-b");
    const s = await json(await post(a.ck, { amount: 10, payment_mode: "cash" }));
    // Org B reversing the same (source, source_id) must not reverse org A's lines.
    await env.DB.batch(ledgerRepo(env.DB, b.org.id).reverseStmts("sale", s.id, 1));
    const live = () => env.DB.prepare("SELECT org_id, amount, reversed, reverses_id FROM ledger_entries WHERE source = 'sale' AND source_id = ? ORDER BY id").bind(s.id).all<any>();
    expect((await live()).results).toEqual([{ org_id: a.org.id, amount: 1000, reversed: 0, reverses_id: null }]);
    await env.DB.batch(ledgerRepo(env.DB, a.org.id).reverseStmts("sale", s.id, 1));
    const after = (await live()).results;
    expect(after.map((l) => [l.org_id, l.amount, l.reversed])).toEqual([[a.org.id, 1000, 1], [a.org.id, -1000, 0]]);
    expect(after[1].reverses_id).toBeGreaterThan(0);
    // Reversing again finds no live line.
    await env.DB.batch(ledgerRepo(env.DB, a.org.id).reverseStmts("sale", s.id, 1));
    expect((await live()).results).toHaveLength(2);
  });

  it("calls hooks.afterSale with the created sale", async () => {
    const a = await setup("hook-sale");
    const seen: number[] = [];
    const orig = hooks.afterSale;
    hooks.afterSale = async (_c, sale) => { seen.push(sale.id); };
    try {
      const s = await json(await post(a.ck, { amount: 10, payment_mode: "cash" }));
      await flush();
      expect(seen).toEqual([s.id]);
    } finally {
      hooks.afterSale = orig;
    }
  });
});
