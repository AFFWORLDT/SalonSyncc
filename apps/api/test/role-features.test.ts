import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import app from "../src/index";
import type { Env } from "../src/env";
import { hashPassword } from "../src/core/crypto";
import { makeOrg, makeUser, loginAs } from "./helpers";

// waitUntil work (sale hooks) is collected so a test can await it.
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "salonkit.online" } as Env;
const ADMIN = "https://admin.salonkit.online";
const call = (method: string, url: string, headers: Record<string, string> = {}, body?: unknown) =>
  app.fetch(new Request(url, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), E, ctx);

let admin = "";
beforeAll(async () => {
  await env.DB.prepare("INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(?,?,?,?)").bind("roles@salonkit.test", await hashPassword("superpass123"), "owner", Date.now()).run();
  const r = await call("POST", `${ADMIN}/api/platform/login`, { "CF-Connecting-IP": "10.55.0.1" }, { email: "roles@salonkit.test", password: "superpass123" });
  admin = r.headers.get("set-cookie")!.split(";")[0]!;
});

const setRole = (orgId: string, role: string, key: string, enabled: boolean, cookie = admin) =>
  call("PUT", `${ADMIN}/api/platform/orgs/${orgId}/role-features/${role}/${key}`, { cookie }, { enabled });

async function salon(slug: string) {
  const org = await makeOrg({ slug, plan: "pro_max", status: "active" });
  await makeUser(org.id, { username: "boss", role: "owner" });
  await makeUser(org.id, { username: "ali", role: "barber" });
  const host = `${slug}.salonkit.online`;
  return { org, host, owner: await loginAs(slug, "boss", "pass1234", host), barber: await loginAs(slug, "ali", "pass1234", host) };
}
const features = async (host: string, cookie: string) => ((await (await call("GET", `https://${host}/api/me`, { cookie })).json()) as { features: string[] }).features;

describe("per-role switches", () => {
  it("role off hides from barber /me but not owner /me", async () => {
    const s = await salon("role-me");
    expect((await setRole(s.org.id, "barber", "ledger", false)).status).toBe(200);
    expect(await features(s.host, s.barber)).not.toContain("ledger");
    expect(await features(s.host, s.owner)).toContain("ledger");
    const g = (await (await call("GET", `${ADMIN}/api/platform/orgs/${s.org.id}/role-features`, { cookie: admin })).json()) as { barber: Record<string, boolean>; admin: Record<string, boolean> };
    expect(g.barber.ledger).toBe(false);
    expect(g.admin.ledger).toBe(true);
    expect((await setRole(s.org.id, "barber", "ledger", true)).status).toBe(200);
    expect(await features(s.host, s.barber)).toContain("ledger");
  });

  it("barber push off: the owner still hears about the barber's sale", async () => {
    const s = await salon("role-side");
    expect((await setRole(s.org.id, "barber", "push", false)).status).toBe(200);
    const r = await call("POST", `https://${s.host}/api/sales`, { cookie: s.barber, origin: `https://${s.host}` }, { amount: "25", payment_mode: "cash" });
    expect(r.status).toBe(201);
    await Promise.all(pending.splice(0));
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.org_id = ? AND u.username = 'boss'").bind(s.org.id).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("role off blocks route", async () => {
    const s = await salon("role-route");
    await setRole(s.org.id, "barber", "expenses", false);
    const b = await call("GET", `https://${s.host}/api/expenses`, { cookie: s.barber });
    expect(b.status).toBe(403);
    expect(((await b.json()) as { code: string }).code).toBe("feature_disabled");
    expect((await call("GET", `https://${s.host}/api/expenses`, { cookie: s.owner })).status).toBe(200);
  });

  it("core_sales and unknown role/key rejected 400", async () => {
    const s = await salon("role-bad");
    expect((await setRole(s.org.id, "barber", "core_sales", false)).status).toBe(400);
    expect((await setRole(s.org.id, "owner", "ledger", false)).status).toBe(400);
    expect((await setRole(s.org.id, "barber", "nope", false)).status).toBe(400);
  });

  it("non-platform caller → 401", async () => {
    const s = await salon("role-anon");
    expect((await setRole(s.org.id, "barber", "ledger", false, s.owner)).status).toBe(401);
  });
});
