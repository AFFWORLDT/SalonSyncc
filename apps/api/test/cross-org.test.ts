import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import app, { tenantGuard } from "../src/index";
import { HttpError } from "../src/core/errors";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { CASES, type CrossOrgCase } from "./cross-org-cases";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
type Fetcher = (req: Request) => Response | Promise<Response>;

let n = 0;
/** Runs one case against `fetcher`; returns a list of problems (empty = org isolation holds). */
async function runCase(fetcher: Fetcher, c: CrossOrgCase): Promise<string[]> {
  const k = ++n;
  const a = await makeOrg({ slug: `xo-a-${k}`, plan: "pro_max" });
  const b = await makeOrg({ slug: `xo-b-${k}`, plan: "pro_max" });
  await makeUser(a.id, { username: "own" });
  await makeUser(b.id, { username: "own" });
  const id = await c.seed(a.id);
  const before = JSON.stringify(await c.read(a.id, id));
  const cookie = await loginAs(b.slug, "own");
  const body = c.bodyFor ? await c.bodyFor(a.id, id) : c.body;
  const call = (ck: string) =>
    fetcher(
      new Request(`https://x.test${c.path(id)}`, {
        method: c.method,
        headers: { cookie: ck, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    );
  const res = await call(cookie);
  const problems: string[] = [];
  if (res.status !== 404) problems.push(`${c.name}: expected 404, got ${res.status}`);
  const after = JSON.stringify(await c.read(a.id, id));
  if (after !== before) problems.push(`${c.name}: org A's row changed`);
  // Positive control: the owning org must not get 404, so a mistyped path/method cannot pass vacuously.
  const own = await call(await loginAs(a.slug, "own"));
  if (own.status === 404) problems.push(`${c.name}: positive control got 404 for org A's own owner (bad path/method?)`);
  return problems;
}

const real: Fetcher = (req) => app.fetch(req, { ...env, ROOT_DOMAIN: "" }, ctx);

describe("cross-org isolation harness", () => {
  it("every registered case returns 404 for another org and leaves the row unchanged", async () => {
    for (const c of CASES) expect(await runCase(real, c), c.name).toEqual([]);
  });

  // Deliberately broken routes registered only here, to prove the harness can fail.
  const seedService = async (orgId: string) => {
    const uid = `u${Math.random()}`;
    const r = await env.DB.prepare("INSERT INTO services(org_id,uid,category,name,price,created_at,updated_at) VALUES(?,?,?,?,?,?,?) RETURNING id")
      .bind(orgId, uid, "Hair", "Cut", 10, 1, 1).first<{ id: number }>();
    return r!.id;
  };
  const readService = (_o: string, id: number) => env.DB.prepare("SELECT * FROM services WHERE org_id = ? AND id = ?").bind(_o, id).first();
  const mk = (leaky: boolean) => {
    const t = new Hono<any>();
    t.use("*", tenantGuard);
    t.put("/svc/:id", async (c) => {
      const id = Number(c.req.param("id"));
      const org = c.var.tenant.org.id;
      // The broken variant forgets org_id on the UPDATE (and the lookup).
      const row = leaky
        ? await env.DB.prepare("SELECT id FROM services WHERE id = ?").bind(id).first()
        : await env.DB.prepare("SELECT id FROM services WHERE org_id = ? AND id = ?").bind(org, id).first();
      if (!row) throw new HttpError(404, "Not found");
      if (leaky) await env.DB.prepare("UPDATE services SET name = 'pwned' WHERE id = ?").bind(id).run();
      else await env.DB.prepare("UPDATE services SET name = 'x' WHERE org_id = ? AND id = ?").bind(org, id).run();
      return c.json({ ok: true });
    });
    const a = new Hono<any>();
    a.route("/api", t);
    a.onError((err, c) => c.json({ error: err.message }, (err as any).status ?? 500));
    return (req: Request) => a.fetch(req, { ...env, ROOT_DOMAIN: "" }, ctx);
  };
  const selfCase: CrossOrgCase = {
    name: "self-test PUT /svc/:id",
    method: "PUT",
    path: (id) => `/api/svc/${id}`,
    body: {},
    seed: seedService,
    read: readService,
  };

  it("fails on purpose when an unscoped route answers 200 and mutates", async () => {
    const problems = await runCase(mk(true), selfCase);
    expect(problems.some((p) => /expected 404, got 200/.test(p))).toBe(true);
    expect(problems.some((p) => /row changed/.test(p))).toBe(true);
  });

  it("passes for a properly scoped route", async () => {
    expect(await runCase(mk(false), selfCase)).toEqual([]);
  });

  it("fails when the positive control 404s (mistyped path)", async () => {
    const problems = await runCase(mk(false), { ...selfCase, path: (id) => `/api/svcs/${id}` });
    expect(problems.some((p) => /positive control got 404/.test(p))).toBe(true);
  });
});
