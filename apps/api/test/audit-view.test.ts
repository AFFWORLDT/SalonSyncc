import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { businessDayStart } from "../src/lib/clock";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
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

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro_max") {
  const org = await makeOrg({ slug, plan });
  const own = await makeUser(org.id, { username: "own", role: "owner" });
  const b1 = await makeUser(org.id, { username: "b1", role: "barber" });
  return { org, own, b1, ck: await loginAs(slug, "own"), k1: await loginAs(slug, "b1") };
}

let seq = 0;
async function addAudit(orgId: string, o: Partial<{ at: number; actor_id: number | null; actor_name: string; entity: string; entity_id: number | null; ref: string | null; action: string; before: unknown; after: unknown }> = {}) {
  const r = await env.DB.prepare(
    "INSERT INTO audit_log(org_id,at,actor_id,actor_name,entity,entity_id,ref,action,before,after) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id",
  )
    .bind(orgId, o.at ?? Date.now() + ++seq, o.actor_id ?? null, o.actor_name ?? "Someone", o.entity ?? "sale", o.entity_id ?? null, o.ref ?? null, o.action ?? "update",
      o.before === undefined ? null : JSON.stringify(o.before), o.after === undefined ? null : JSON.stringify(o.after))
    .first<{ id: number }>();
  return r!.id;
}

describe("GET /api/audit", () => {
  it("lists newest first with changed fields, total and paging", async () => {
    const a = await setup("au-list");
    for (let i = 1; i <= 5; i++) await addAudit(a.org.id, { ref: `R${i}`, before: { amount: i, note: "x" }, after: { amount: i + 1, note: "x" } });
    const r = await json(await call("GET", "/audit?page_size=2&page=2", a.ck));
    expect(r).toMatchObject({ total: 5, page: 2, page_size: 2 });
    expect(r.items.map((e: any) => e.ref)).toEqual(["R3", "R2"]);
    expect(r.items[0].changed).toEqual(["amount"]);
    expect(r.items[0].before).toEqual({ amount: 3, note: "x" });
  });

  it("clamps page and page_size", async () => {
    const a = await setup("au-clamp");
    await addAudit(a.org.id);
    expect(await json(await call("GET", "/audit?page=-4&page_size=100000", a.ck))).toMatchObject({ page: 1, page_size: 200 });
    expect(await json(await call("GET", "/audit?page=abc&page_size=0", a.ck))).toMatchObject({ page: 1 });
    expect(await json(await call("GET", "/audit?page=999999999999", a.ck))).toMatchObject({ page: 100000, items: [] });
  });

  it("filters by entity, actor, day range (org clock) and q (escaped)", async () => {
    const a = await setup("au-filter");
    const clock = { timezone: "Asia/Dubai", dayStartHour: 4 };
    const d1 = businessDayStart("2026-10-01", clock);
    const d2 = businessDayStart("2026-10-02", clock);
    await addAudit(a.org.id, { at: d1 + 1000, entity: "sale", actor_id: a.own.id, ref: "BILL-1" });
    await addAudit(a.org.id, { at: d2 - 1000, entity: "expense", actor_id: a.b1.id, ref: "100%_off" });
    await addAudit(a.org.id, { at: d2 + 1000, entity: "sale", actor_id: a.b1.id, ref: "BILL-2", actor_name: "Zed" });
    const refs = async (qs: string) => (await json(await call("GET", `/audit?${qs}`, a.ck))).items.map((e: any) => e.ref).sort();
    expect(await refs("entity=expense")).toEqual(["100%_off"]);
    expect(await refs(`actor_id=${a.b1.id}`)).toEqual(["100%_off", "BILL-2"]);
    expect(await refs("from=2026-10-02")).toEqual(["BILL-2"]);
    expect(await refs("to=2026-10-01")).toEqual(["BILL-1", "100%_off"].sort());
    expect(await refs("from=2026-10-01&to=2026-10-01")).toEqual(["100%_off", "BILL-1"].sort());
    expect(await refs("q=BILL")).toEqual(["BILL-1", "BILL-2"]);
    expect(await refs("q=%25")).toEqual(["100%_off"]);
    expect(await refs("q=_")).toEqual(["100%_off"]);
    expect(await refs("q=zed")).toEqual(["BILL-2"]);
    expect(await refs("from=garbage")).toHaveLength(3);
    expect(await refs("actor_id=notanumber")).toEqual([]); // bad id: nothing, no 5xx
  });

  it("actor_id of another org returns nothing", async () => {
    const a = await setup("au-act-a");
    const b = await setup("au-act-b");
    await addAudit(b.org.id, { actor_id: b.own.id, ref: "B-ONLY" });
    await addAudit(a.org.id, { actor_id: a.own.id, ref: "A1" });
    const r = await call("GET", `/audit?actor_id=${b.own.id}`, a.ck);
    expect(r.status).toBe(200);
    expect((await json(r)).items.map((e: any) => e.ref).filter((x: string) => x === "B-ONLY")).toEqual([]);
  });

  it("changed fields are right for a real sale edit", async () => {
    const a = await setup("au-sale");
    const sale = await json(await call("POST", "/sales", a.ck, { amount: 10, payment_mode: "cash" }));
    const up = await call("PUT", `/sales/${sale.id}`, a.ck, { amount: 25, payment_mode: "card" });
    expect(up.status).toBe(200);
    const h = await json(await call("GET", `/sales/${sale.id}/history`, a.ck));
    expect(h.map((e: any) => e.action)).toEqual(["create", "update"]);
    expect(h[0].changed.length).toBeGreaterThan(0);
    expect(h[1].changed).toEqual(expect.arrayContaining(["amount", "payment_mode"]));
    expect(h[1].changed).not.toContain("bill_no");
  });

  it("org B sees none of A's entries", async () => {
    const a = await setup("au-iso-a");
    const b = await setup("au-iso-b");
    await addAudit(a.org.id, { ref: "SECRET-A" });
    const r = await json(await call("GET", "/audit?q=SECRET", b.ck));
    expect(r).toMatchObject({ total: 0, items: [] });
    expect((await json(await call("GET", "/audit?q=SECRET", a.ck))).total).toBe(1);
  });

  it("barber 403; pro org 403 feature_disabled; unknown path 404", async () => {
    const a = await setup("au-acl");
    expect((await call("GET", "/audit", a.k1)).status).toBe(403);
    const p = await setup("au-acl-pro", "pro");
    const r = await call("GET", "/audit", p.ck);
    expect(r.status).toBe(403);
    expect(await json(r)).toMatchObject({ code: "feature_disabled" });
    expect((await call("GET", "/sales/1/history", p.ck)).status).toBe(403);
    expect((await call("GET", "/audit/nope", a.ck)).status).toBe(404);
  });
});

describe("GET /api/sales/:id/history", () => {
  it("returns oldest first, only that sale; deleted sale keeps history; unknown id 404", async () => {
    const a = await setup("hi-1");
    const s1 = await json(await call("POST", "/sales", a.ck, { amount: 10, payment_mode: "cash" }));
    const s2 = await json(await call("POST", "/sales", a.ck, { amount: 11, payment_mode: "cash" }));
    expect((await json(await call("GET", `/sales/${s1.id}/history`, a.ck))).map((e: any) => e.entity_id)).toEqual([s1.id]);
    expect((await call("DELETE", `/sales/${s1.id}`, a.ck)).status).toBeLessThan(300);
    const h = await json(await call("GET", `/sales/${s1.id}/history`, a.ck));
    expect(h.map((e: any) => e.action)).toEqual(["create", "delete"]);
    expect((await json(await call("GET", `/sales/${s2.id}/history`, a.ck))).length).toBe(1);
    expect((await call("GET", "/sales/999999/history", a.ck)).status).toBe(404);
    expect((await call("GET", "/sales/abc/history", a.ck)).status).toBe(400);
    expect((await call("GET", `/sales/${s2.id}/history`, a.k1)).status).toBe(403);
  });
});
