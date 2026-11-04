import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import app from "../src/index";
import type { Env } from "../src/env";
import { hashPassword } from "../src/core/crypto";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "salonkit.online" } as Env;
const ADMIN = "https://admin.salonkit.online";
let ipN = 0;
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.fetch(
    new Request(url, {
      method,
      headers: { "content-type": "application/json", "CF-Connecting-IP": `10.88.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    E,
    ctx,
  );

let owner = "";
let support = "";
beforeAll(async () => {
  for (const [email, role] of [["bundles-boss@salonkit.test", "owner"], ["bundles-help@salonkit.test", "support"]] as const) {
    await env.DB.prepare("INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(?,?,?,?)").bind(email, await hashPassword("superpass123"), role, Date.now()).run();
  }
  const login = async (email: string) => (await req("POST", `${ADMIN}/api/platform/login`, { email, password: "superpass123" })).headers.get("set-cookie")!.split(";")[0]!;
  owner = await login("bundles-boss@salonkit.test");
  support = await login("bundles-help@salonkit.test");
});

const P = (method: string, path: string, cookie: string, body?: unknown) => req(method, `${ADMIN}/api/platform${path}`, body, { cookie });
type Bundle = { id: number; name: string; description: string | null; features: Record<string, boolean> };

async function features(slug: string) {
  const host = `${slug}.salonkit.online`;
  const cookie = await loginAs(slug, "boss", "pass1234", host);
  return ((await (await req("GET", `https://${host}/api/me`, undefined, { cookie })).json()) as { features: string[] }).features;
}

describe("feature bundles", () => {
  it("create, list, edit, delete — with validation", async () => {
    const r = await P("POST", "/bundles", owner, { name: "Barber shop extras", description: "Ledger + audit", features: { ledger: true, audit_log: true } });
    expect(r.status).toBe(201);
    const b = (await r.json()) as Bundle;
    expect(b.features).toEqual({ ledger: true, audit_log: true });
    expect(((await (await P("GET", "/bundles", owner)).json()) as Bundle[]).map((x) => x.name)).toContain("Barber shop extras");
    expect((await P("POST", "/bundles", owner, { name: "Barber shop extras", features: { ledger: true } })).status).toBe(409);
    expect(((await (await P("POST", "/bundles", owner, { name: " ", features: { ledger: true } })).json()) as { error: string }).error).toBe("Give the bundle a name");
    expect(((await (await P("POST", "/bundles", owner, { name: "x", features: { core_sales: false } })).json()) as { error: string }).error).toBe("Sales are always on");
    expect(((await (await P("POST", "/bundles", owner, { name: "x", features: { nope: true } })).json()) as { error: string }).error).toBe("Unknown feature");
    expect(((await (await P("POST", "/bundles", owner, { name: "x", features: {} })).json()) as { error: string }).error).toBe("Pick at least one feature");
    const put = await P("PUT", `/bundles/${b.id}`, owner, { name: "Barber extras", description: null, features: { ledger: true, whatsapp: false } });
    expect(put.status).toBe(200);
    expect(((await put.json()) as Bundle).features).toEqual({ ledger: true, whatsapp: false });
    expect((await P("DELETE", `/bundles/${b.id}`, owner)).status).toBe(200);
    expect((await P("PUT", `/bundles/${b.id}`, owner, { name: "z", features: { ledger: true } })).status).toBe(404);
  });

  it("preview lists only what changes; apply changes exactly that; twice changes nothing", async () => {
    const org = await makeOrg({ slug: "bundle-salon", plan: "pro", status: "active" });
    await makeUser(org.id, { username: "boss", role: "owner" });
    const b = (await (await P("POST", "/bundles", owner, { name: "Pro plus ledger", features: { ledger: true, ratings: true, push: false } })).json()) as Bundle;
    const before = await features("bundle-salon");
    expect(before).toContain("ratings");
    expect(before).not.toContain("ledger");
    const pv = (await (await P("GET", `/orgs/${org.id}/bundles/${b.id}/preview`, support)).json()) as { changes: { key: string; from: boolean; to: boolean }[] };
    expect(pv.changes).toEqual([
      { key: "push", from: true, to: false },
      { key: "ledger", from: false, to: true },
    ]);
    expect((await P("POST", `/orgs/${org.id}/bundles/${b.id}/apply`, support, { expect: pv.changes })).status).toBe(403);
    // Apply carries what the preview showed; a different picture (the salon changed meanwhile) is refused.
    const stale = await P("POST", `/orgs/${org.id}/bundles/${b.id}/apply`, owner, { expect: [{ key: "ledger", from: false, to: true }] });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: string }).error).toBe("This salon changed since the preview. Check the changes again.");
    const ap = (await (await P("POST", `/orgs/${org.id}/bundles/${b.id}/apply`, owner, { expect: pv.changes })).json()) as { ok: boolean; changed: number };
    expect(ap).toEqual({ ok: true, changed: 2 });
    const after = await features("bundle-salon");
    expect(after).toContain("ledger");
    expect(after).not.toContain("push");
    expect(after.filter((k) => !["ledger", "push"].includes(k)).sort()).toEqual(before.filter((k) => !["ledger", "push"].includes(k)).sort());
    const ov = await env.DB.prepare("SELECT feature_key, enabled, reason FROM org_feature_overrides WHERE org_id = ? ORDER BY feature_key").bind(org.id).all();
    // Every switch in the bundle is pinned on the salon — ratings too, which the plan already gave — so a later plan
    // or trial change can't take away what the bundle promised.
    expect(ov.results).toEqual([
      { feature_key: "ledger", enabled: 1, reason: "Bundle: Pro plus ledger" },
      { feature_key: "push", enabled: 0, reason: "Bundle: Pro plus ledger" },
      { feature_key: "ratings", enabled: 1, reason: "Bundle: Pro plus ledger" },
    ]);
    expect(((await (await P("POST", `/orgs/${org.id}/bundles/${b.id}/apply`, owner, { expect: [] })).json()) as { changed: number }).changed).toBe(0);
    const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM platform_audit WHERE action = 'bundle_apply' AND org_id = ?").bind(org.id).first<{ n: number }>();
    expect(audit!.n).toBe(2);
    // Deleting the bundle leaves the salon as it is.
    await P("DELETE", `/bundles/${b.id}`, owner);
    expect(await features("bundle-salon")).toEqual(after);
  });

  it("support can read bundles but not change them", async () => {
    expect((await P("GET", "/bundles", support)).status).toBe(200);
    expect((await P("POST", "/bundles", support, { name: "s", features: { ledger: true } })).status).toBe(403);
  });
});
