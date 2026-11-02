import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";

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
const sell = async (ck: string, body: unknown) => {
  const r = await call("POST", "/sales", ck, body);
  if (r.status !== 201) throw new Error(`sale failed ${r.status} ${await r.text()}`);
  const s = await json(r);
  await flush();
  return s;
};

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro") {
  const org = await makeOrg({ slug, plan });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  const b2 = await makeUser(org.id, { username: "b2", role: "barber" });
  return { org, own, b1, b2, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1"), k2: await loginAs(slug, "b2") };
}

/** Ali: 2 visits (b1 cash 50 with 2 cuts, b2 card 30 with a beard); Sara: 1 visit (b1). Org B has its own customer. */
async function fixture(slug: string, plan: "free" | "pro" | "pro_max" = "pro") {
  const a = await setup(slug, plan);
  await sell(a.k1, { payment_mode: "cash", customer_name: "Ali", customer_phone: "0501111111", items: [{ name: "Cut", price: 25, qty: 2 }] });
  await sell(a.k2, { payment_mode: "card", customer_phone: "0501111111", items: [{ name: "Beard", price: 30 }] });
  await sell(a.k1, { payment_mode: "cash", amount: 15, customer_name: "Sara", customer_phone: "0502222222" });
  const ali = await env.DB.prepare("SELECT id FROM customers WHERE org_id = ? AND name = 'Ali'").bind(a.org.id).first<{ id: number }>();
  const sara = await env.DB.prepare("SELECT id FROM customers WHERE org_id = ? AND name = 'Sara'").bind(a.org.id).first<{ id: number }>();
  return { ...a, ali: ali!.id, sara: sara!.id };
}

describe("GET /api/customers", () => {
  it("admin with customers_crm: full paged list with visits, spent, wa_opt_out; newest visit first; own org only", async () => {
    const a = await fixture("cu-list");
    const b = await setup("cu-list-b");
    await sell(b.ck, { payment_mode: "cash", amount: 99, customer_name: "Bob", customer_phone: "0503333333" });
    await env.DB.prepare("UPDATE customers SET wa_opt_out = 1 WHERE org_id = ? AND id = ?").bind(a.org.id, a.sara).run();
    const r = await call("GET", "/customers", a.ck);
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body).toMatchObject({ total: 2, page: 1, page_size: 50 });
    expect(body.items).toEqual([
      { id: a.sara, name: "Sara", phone: "0502222222", visits: 1, spent: 1500, last_visit_at: expect.any(Number), wa_opt_out: true },
      { id: a.ali, name: "Ali", phone: "0501111111", visits: 2, spent: 8000, last_visit_at: expect.any(Number), wa_opt_out: false },
    ]);
    // FM filters: q matches name or phone digits (any length for admins); paging.
    expect((await json(await call("GET", "/customers?q=al", a.ck))).items.map((c: any) => c.id)).toEqual([a.ali]);
    expect((await json(await call("GET", "/customers?q=2222", a.ck))).items.map((c: any) => c.id)).toEqual([a.sara]);
    expect((await json(await call("GET", "/customers?q=Bob", a.ck))).items).toEqual([]);
    const p2 = await json(await call("GET", "/customers?page=2&page_size=1", a.ck));
    expect(p2).toMatchObject({ total: 2, page: 2, page_size: 1 });
    expect(p2.items.map((c: any) => c.id)).toEqual([a.ali]);
  });

  it("admin WITHOUT customers_crm gets the barber-style autocomplete (no 403); barbers always do", async () => {
    const f = await fixture("cu-free", "free");
    const r = await call("GET", "/customers", f.ck);
    expect(r.status).toBe(200);
    const body = await json(r);
    // The owner served nobody: own-recent list is empty, and rows never carry CRM fields.
    expect(body).toEqual({ items: [], total: 0, page: 1, page_size: 8 });
    expect((await json(await call("GET", "/customers?q=0501111111", f.ck))).items).toEqual([{ id: f.ali, name: "Ali", phone: "0501111111" }]);

    const p = await fixture("cu-barber");
    const mine = await json(await call("GET", "/customers", p.k1));
    expect(mine.items).toEqual([{ id: p.sara, name: "Sara", phone: "0502222222" }, { id: p.ali, name: "Ali", phone: "0501111111" }]);
  });
});

describe("GET /api/customers/:id", () => {
  it("returns the CustomerDetail for this org", async () => {
    const a = await fixture("cu-detail");
    const r = await call("GET", `/customers/${a.ali}`, a.ck);
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d).toEqual({
      id: a.ali,
      name: "Ali",
      phone: "0501111111",
      visits: 2,
      spent: 8000,
      last_visit_at: expect.any(Number),
      wa_opt_out: false,
      first_visit_at: expect.any(Number),
      avg_bill: 4000,
      cash_visits: 1,
      card_visits: 1,
      barbers: expect.arrayContaining([{ id: a.b1.id, name: "b1", visits: 1 }, { id: a.b2.id, name: "b2", visits: 1 }]),
      services: [{ name: "Cut", qty: 2 }, { name: "Beard", qty: 1 }],
    });
    expect(d.barbers).toHaveLength(2);
    expect(d.first_visit_at).toBeLessThanOrEqual(d.last_visit_at);
  });

  it("another org's id is 404; free plan admin 403 feature_disabled; barber 403; bad id 400", async () => {
    const a = await fixture("cu-iso");
    const b = await setup("cu-iso-b");
    const x = await call("GET", `/customers/${a.ali}`, b.ck);
    expect(x.status).toBe(404);
    const f = await fixture("cu-iso-free", "free");
    const ff = await call("GET", `/customers/${f.ali}`, f.ck);
    expect(ff.status).toBe(403);
    expect(await json(ff)).toMatchObject({ code: "feature_disabled" });
    const bb = await call("GET", `/customers/${a.ali}`, a.k1);
    expect(bb.status).toBe(403);
    expect(await json(bb)).toEqual({ error: "You don't have access to this" });
    expect((await call("GET", "/customers/abc", a.ck)).status).toBe(400);
  });
});
