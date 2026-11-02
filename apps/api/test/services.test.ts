import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { PUBLIC_LIMITS } from "../src/lib/limits";
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
const pub = async (path: string, init: RequestInit = {}): Promise<Response> => app.fetch(new Request(`https://x.test/api/public${path}`, init), E, ctx);

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro_max") {
  const org = await makeOrg({ slug, plan });
  await makeUser(org.id, { username: "own", role: "owner" });
  return { org, ck: await loginAs(slug, "own") };
}
const svc = (over: Record<string, unknown> = {}) => ({ category: "Haircuts", name: "Haircut", description: "Neat", price: 25, ...over });

describe("services CRUD", () => {
  it("creates, lists, updates, deletes with audit; prices in minor units", async () => {
    const { org, ck } = await setup("sv-crud");
    const r = await call("POST", "/services", ck, svc({ price: "25.5" }));
    expect(r.status).toBe(201);
    const s: any = await r.json();
    expect(s).toMatchObject({ category: "Haircuts", name: "Haircut", price: 2550, sort_order: 10, active: true });
    const s2: any = await (await call("POST", "/services", ck, svc({ name: "Beard", price: 0 }))).json();
    expect(s2).toMatchObject({ price: 0, sort_order: 20 });
    const up = await call("PUT", `/services/${s.id}`, ck, svc({ name: "Cut", price: 30, active: false }));
    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({ id: s.id, name: "Cut", price: 3000, active: false });
    expect(((await (await call("GET", "/services", ck)).json()) as any[]).map((x) => x.name)).toEqual(["Beard"]);
    expect(((await (await call("GET", "/services?all=1", ck)).json()) as any[]).map((x) => x.name)).toEqual(["Cut", "Beard"]);
    expect((await call("DELETE", `/services/${s.id}`, ck)).status).toBe(200);
    expect((await call("PUT", `/services/${s.id}`, ck, svc())).status).toBe(404);
    const logs = await env.DB.prepare("SELECT action, entity_id FROM audit_log WHERE org_id = ? AND entity = 'service' ORDER BY id").bind(org.id).all<any>();
    expect(logs.results.map((l) => l.action)).toEqual(["create", "create", "update", "delete"]);
    expect(logs.results[0].entity_id).toBe(s.id);
    expect(logs.results[3].entity_id).toBe(s.id);
  });

  it("uses the org's minor unit and validates input", async () => {
    const { org, ck } = await setup("sv-val");
    await env.DB.prepare("UPDATE org_settings SET currency_minor = 1000 WHERE org_id = ?").bind(org.id).run();
    expect(((await (await call("POST", "/services", ck, svc({ price: 1.234 }))).json()) as any).price).toBe(1234);
    expect((await call("POST", "/services", ck, svc({ category: "" }))).status).toBe(400);
    expect((await call("POST", "/services", ck, svc({ name: " " }))).status).toBe(400);
    expect((await call("POST", "/services", ck, svc({ price: -1 }))).status).toBe(400);
    expect((await call("POST", "/services", ck, svc({ price: "abc" }))).status).toBe(400);
    expect((await call("POST", "/services", ck, svc({ price: 1.2345 }))).status).toBe(400);
    expect((await call("PUT", "/services/abc", ck, svc())).status).toBe(400);
  });

  it("barbers see only active services and cannot write", async () => {
    const { org, ck } = await setup("sv-barber");
    await makeUser(org.id, { username: "bar", role: "barber" });
    const bk = await loginAs("sv-barber", "bar");
    const a: any = await (await call("POST", "/services", ck, svc({ name: "Shown" }))).json();
    await call("POST", "/services", ck, svc({ name: "Hidden", active: false }));
    expect(((await (await call("GET", "/services", bk)).json()) as any[]).map((x) => x.name)).toEqual(["Shown"]);
    expect(((await (await call("GET", "/services?all=1", bk)).json()) as any[]).map((x) => x.name)).toEqual(["Shown"]);
    expect((await call("POST", "/services", bk, svc())).status).toBe(403);
    expect((await call("PUT", `/services/${a.id}`, bk, svc())).status).toBe(403);
    expect((await call("DELETE", `/services/${a.id}`, bk)).status).toBe(403);
    expect((await call("POST", "/services/starter", bk)).status).toBe(403);
  });

  it("concurrent creates across two orgs get their own ids and audit rows (RF4)", async () => {
    const a = await setup("sv-race-a");
    const b = await setup("sv-race-b");
    const jobs = Array.from({ length: 10 }, (_, i) => {
      const t = i % 2 ? b : a;
      return call("POST", "/services", t.ck, svc({ name: `S${i}` })).then(async (r) => ({ org: t.org.id, s: (await r.json()) as any, status: r.status }));
    });
    const res = await Promise.all(jobs);
    for (const r of res) {
      expect(r.status).toBe(201);
      const row = await env.DB.prepare("SELECT org_id FROM services WHERE id = ?").bind(r.s.id).first<any>();
      expect(row.org_id).toBe(r.org);
      const log = await env.DB.prepare("SELECT org_id, entity_id, ref FROM audit_log WHERE entity='service' AND action='create' AND entity_id = ?").bind(r.s.id).all<any>();
      expect(log.results).toHaveLength(1);
      expect(log.results[0]).toMatchObject({ org_id: r.org, ref: r.s.name });
    }
    expect(new Set(res.map((r) => r.s.id)).size).toBe(10);
  });

  it("requires the core_sales feature gate to resolve (unknown paths stay 404)", async () => {
    const { ck } = await setup("sv-404");
    expect((await call("GET", "/servicesx", ck)).status).toBe(404);
    expect((await call("GET", "/services", "")).status).toBe(401);
  });
});

describe("starter catalogue", () => {
  it("inserts FM's 16 services once, then 409", async () => {
    const { org, ck } = await setup("sv-starter");
    const r = await call("POST", "/services/starter", ck);
    expect(r.status).toBe(201);
    const list: any[] = await r.json();
    expect(list).toHaveLength(16);
    expect(list[0]).toMatchObject({ category: "Haircuts", name: "Haircut", price: 1500, sort_order: 10 });
    expect(list[15]).toMatchObject({ name: "Black mask", price: 2000, sort_order: 160 });
    const again = await call("POST", "/services/starter", ck);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "Your service list isn't empty" });
    expect(((await (await call("GET", "/services?all=1", ck)).json()) as any[]).length).toBe(16);
    const logs = await env.DB.prepare("SELECT action, entity_id FROM audit_log WHERE org_id = ? AND entity='service'").bind(org.id).all<any>();
    expect(logs.results).toHaveLength(1);
    expect(logs.results[0].action).toBe("starter");
  });

  it("is refused when the org already has a service, and converts to the org's minor unit", async () => {
    const { ck } = await setup("sv-starter2");
    await call("POST", "/services", ck, svc());
    expect((await call("POST", "/services/starter", ck)).status).toBe(409);
    const o = await setup("sv-starter3");
    await env.DB.prepare("UPDATE org_settings SET currency_minor = 10 WHERE org_id = ?").bind(o.org.id).run();
    const list: any[] = await (await call("POST", "/services/starter", o.ck)).json();
    expect(list[0].price).toBe(150); // AED 15 Haircut in a 10-per-unit currency
  });

  it("concurrent starters insert only once", async () => {
    const { ck } = await setup("sv-starter4");
    const rs = await Promise.all([call("POST", "/services/starter", ck), call("POST", "/services/starter", ck)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(((await (await call("GET", "/services", ck)).json()) as any[]).length).toBe(16);
  });
});

describe("GET /api/public/services", () => {
  it("returns active services with CORS and cache headers for a pro_max org", async () => {
    const { ck } = await setup("sv-pub");
    await call("POST", "/services", ck, svc({ name: "B", sort_order: 20, price: 10 }));
    await call("POST", "/services", ck, svc({ name: "A", sort_order: 10 }));
    await call("POST", "/services", ck, svc({ name: "Hidden", active: false }));
    const r = await pub("/services?org=sv-pub");
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await r.json()).toEqual([
      { category: "Haircuts", name: "A", description: "Neat", price: 2500 },
      { category: "Haircuts", name: "B", description: "Neat", price: 1000 },
    ]);
  });
  it("works from the tenant host", async () => {
    await setup("sv-pubhost");
    const r = await app.fetch(new Request("https://sv-pubhost.salonkit.online/api/public/services"), { ...env, ROOT_DOMAIN: "salonkit.online" }, ctx);
    expect(r.status).toBe(200);
  });
  it("404 for a free org, an unknown org and no org", async () => {
    await setup("sv-pubfree", "free");
    for (const q of ["?org=sv-pubfree", "?org=sv-nope", ""]) {
      const r = await pub(`/services${q}`);
      expect(r.status, q).toBe(404);
      expect(await r.json()).toEqual({ error: "Not found" });
    }
  });
  it("answers the CORS preflight", async () => {
    const r = await pub("/services", { method: "OPTIONS", headers: { origin: "https://site.test", "access-control-request-method": "GET" } });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-methods")).toContain("GET");
  });
  it("429 on the 61st request in a minute", async () => {
    await setup("sv-pubrl");
    const h = { "CF-Connecting-IP": "7.7.7.7" };
    for (let i = 0; i < PUBLIC_LIMITS.pub; i++) expect((await pub("/services?org=sv-pubrl", { headers: h })).status, `hit ${i}`).toBe(200);
    expect((await pub("/services?org=sv-pubrl", { headers: h })).status).toBe(429);
  });
});
