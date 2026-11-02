import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import app from "../src/index";
import type { Env } from "../src/env";
import { hashPassword } from "../src/core/crypto";
import { BULK_MAX, reactivatedStatus } from "../src/platform/admin";
import { makeOrg, makeUser, loginAs } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "salonkit.online" } as Env;
const ADMIN = "https://admin.salonkit.online";
let ipN = 0;

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request(url, {
      method,
      headers: { "content-type": "application/json", "CF-Connecting-IP": headers.ip ?? `10.77.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    E,
    ctx,
  );
}
const cookieOf = (r: Response) => r.headers.get("set-cookie")?.split(";")[0] ?? "";

async function makePlatformUser(email: string, role: "owner" | "support", password = "superpass123") {
  await env.DB.prepare("INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(?,?,?,?)").bind(email, await hashPassword(password), role, Date.now()).run();
}
async function platformLogin(email: string, password = "superpass123") {
  const r = await req("POST", `${ADMIN}/api/platform/login`, { email, password });
  expect(r.status).toBe(200);
  return cookieOf(r);
}

let owner = "";
let support = "";
beforeAll(async () => {
  await makePlatformUser("boss@salonkit.test", "owner");
  await makePlatformUser("helper@salonkit.test", "support");
  owner = await platformLogin("boss@salonkit.test");
  support = await platformLogin("helper@salonkit.test");
});

const P = (method: string, path: string, cookie: string, body?: unknown) => req(method, `${ADMIN}/api/platform${path}`, body, { cookie });

describe("platform sign-in", () => {
  it("logs in, answers /me, and logs out", async () => {
    const me = await P("GET", "/me", owner);
    expect(await me.json()).toMatchObject({ email: "boss@salonkit.test", role: "owner" });
    expect((await req("POST", `${ADMIN}/api/platform/login`, { email: "boss@salonkit.test", password: "nope-nope" })).status).toBe(401);
    expect((await req("POST", `${ADMIN}/api/platform/login`, { email: "nobody@x.test", password: "superpass123" })).status).toBe(401);
  });

  it("locks an IP after repeated wrong passwords", async () => {
    for (let i = 0; i < 10; i++) await req("POST", `${ADMIN}/api/platform/login`, { email: "boss@salonkit.test", password: "wrong" }, { ip: "10.99.0.1" });
    expect((await req("POST", `${ADMIN}/api/platform/login`, { email: "boss@salonkit.test", password: "superpass123" }, { ip: "10.99.0.1" })).status).toBe(429);
  });

  it("only works on the admin host", async () => {
    const r = await req("GET", "https://beard.salonkit.online/api/platform/me", undefined, { cookie: owner });
    expect(r.status).toBe(404);
  });

  it("a salon session is not a platform session, and the reverse", async () => {
    const org = await makeOrg({ slug: "cross-cookie" });
    await makeUser(org.id, { username: "own" });
    const salon = await loginAs("cross-cookie", "own", "pass1234", "cross-cookie.salonkit.online");
    // The salon cookie's token, sent as ss_platform:
    const forged = `ss_platform=${salon.split("=").slice(1).join("=")}`;
    expect((await P("GET", "/me", forged)).status).toBe(401);
    // The platform token sent as ss_session to the salon:
    const asSalon = `ss_session=${owner.split("=").slice(1).join("=")}`;
    expect((await req("GET", "https://cross-cookie.salonkit.online/api/me", undefined, { cookie: asSalon })).status).toBe(401);
  });

  it("a password change signs other devices out", async () => {
    await makePlatformUser("pw@salonkit.test", "support");
    const a = await platformLogin("pw@salonkit.test");
    const b = await platformLogin("pw@salonkit.test");
    const r = await P("PUT", "/me/password", a, { current: "superpass123", next: "brandnewpass1" });
    expect(r.status).toBe(200);
    expect((await P("GET", "/me", b)).status).toBe(401);
    expect((await P("GET", "/me", cookieOf(r))).status).toBe(200);
  });
});

describe("salons", () => {
  it("lists with filters and search, hides deleted", async () => {
    await makeOrg({ slug: "list-alpha", plan: "pro", status: "active" });
    await makeOrg({ slug: "list-beta", status: "expired" });
    const gone = await makeOrg({ slug: "list-gone", status: "deleted" });
    const all = (await (await P("GET", "/orgs?q=list-", owner)).json()) as { slug: string }[];
    expect(all.map((o) => o.slug).sort()).toEqual(["list-alpha", "list-beta"]);
    const expired = (await (await P("GET", "/orgs?status=expired&q=list", owner)).json()) as { slug: string }[];
    expect(expired.map((o) => o.slug)).toEqual(["list-beta"]);
    const pro = (await (await P("GET", "/orgs?plan=pro&q=list", owner)).json()) as { slug: string }[];
    expect(pro.map((o) => o.slug)).toEqual(["list-alpha"]);
    const deleted = (await (await P("GET", "/orgs?status=deleted&q=list", owner)).json()) as { id: string }[];
    expect(deleted.map((o) => o.id)).toEqual([gone.id]);
  });

  it("support can read but not change", async () => {
    const org = await makeOrg({ slug: "ro-check" });
    expect((await P("GET", `/orgs/${org.id}`, support)).status).toBe(200);
    expect((await P("POST", `/orgs/${org.id}/plan`, support, { plan_id: "pro" })).status).toBe(403);
    expect((await P("POST", `/orgs/${org.id}/deactivate`, support)).status).toBe(403);
    expect((await P("PUT", "/plans/free", support, { name: "x", price_monthly: 0, max_staff: 2, features: [] })).status).toBe(403);
  });

  it("plan change, feature override and limits show on the salon's next /api/me, with audit rows", async () => {
    const org = await makeOrg({ slug: "feat-flip", plan: "free" });
    await makeUser(org.id, { username: "own" });
    const salon = await loginAs("feat-flip", "own", "pass1234", "feat-flip.salonkit.online");
    const me = async () => (await (await req("GET", "https://feat-flip.salonkit.online/api/me", undefined, { cookie: salon })).json()) as { features: string[]; limits: { max_staff: number | null } };
    expect((await me()).features).not.toContain("ledger");

    expect((await P("PUT", `/orgs/${org.id}/features/ledger`, owner, { enabled: true })).status).toBe(400); // reason required
    expect((await P("PUT", `/orgs/${org.id}/features/ledger`, owner, { enabled: true, reason: "Pilot" })).status).toBe(200);
    expect((await me()).features).toContain("ledger");
    expect((await P("PUT", `/orgs/${org.id}/features/expenses`, owner, { enabled: false, reason: "Asked" })).status).toBe(200);
    expect((await me()).features).not.toContain("expenses");
    expect((await P("PUT", `/orgs/${org.id}/features/ledger`, owner, { enabled: null })).status).toBe(200);
    expect((await me()).features).not.toContain("ledger");

    expect((await P("POST", `/orgs/${org.id}/plan`, owner, { plan_id: "pro" })).status).toBe(200);
    expect((await me()).features).toContain("customers_crm");
    expect((await P("POST", `/orgs/${org.id}/plan`, owner, { plan_id: "gold" })).status).toBe(400);

    expect((await P("PUT", `/orgs/${org.id}/limits`, owner, { max_staff: 25 })).status).toBe(200);
    expect((await me()).limits.max_staff).toBe(25);
    expect((await P("PUT", `/orgs/${org.id}/limits`, owner, { reset: true })).status).toBe(200);
    expect((await me()).limits.max_staff).toBe(10);

    const detail = (await (await P("GET", `/orgs/${org.id}`, owner)).json()) as { overrides: { feature_key: string; reason: string }[]; audit: { action: string; who: string }[] };
    expect(detail.overrides).toEqual([expect.objectContaining({ feature_key: "expenses", reason: "Asked" })]);
    expect(detail.audit.map((a) => a.action)).toEqual(expect.arrayContaining(["feature_override", "plan_change", "limits_override"]));
    expect(detail.audit[0]!.who).toBe("boss@salonkit.test");
  });

  it("extend trial, activate, deactivate, reactivate, delete", async () => {
    const org = await makeOrg({ slug: "life-cycle", status: "expired" });
    await makeUser(org.id, { username: "own" });
    const before = Date.now();
    const ext = (await (await P("POST", `/orgs/${org.id}/extend`, owner, { kind: "trial", days: 7 })).json()) as { status: string; trial_ends_at: number };
    expect(ext.status).toBe("trial");
    expect(ext.trial_ends_at).toBeGreaterThanOrEqual(before + 7 * 86_400_000);
    expect((await P("POST", `/orgs/${org.id}/extend`, owner, { kind: "trial", days: 0 })).status).toBe(400);

    expect((await P("POST", `/orgs/${org.id}/activate`, owner, { plan_id: "pro", until: Date.now() + 30 * 86_400_000 })).status).toBe(200);
    let row = await env.DB.prepare("SELECT o.status, o.plan_id, s.provider FROM orgs o JOIN subscriptions s ON s.org_id = o.id WHERE o.id = ?").bind(org.id).first<any>();
    expect(row).toMatchObject({ status: "active", plan_id: "pro", provider: "manual" });

    expect((await P("POST", `/orgs/${org.id}/deactivate`, owner)).status).toBe(200);
    // A deactivated salon cannot sign in.
    await expect(loginAs("life-cycle", "own", "pass1234", "life-cycle.salonkit.online")).rejects.toThrow();
    const re = (await (await P("POST", `/orgs/${org.id}/reactivate`, owner)).json()) as { status: string };
    expect(re.status).toBe("active"); // paid by hand until next month

    expect((await P("POST", `/orgs/${org.id}/delete`, owner, { confirm: "wrong" })).status).toBe(400);
    expect((await P("POST", `/orgs/${org.id}/delete`, owner, { confirm: "life-cycle" })).status).toBe(200);
    row = await env.DB.prepare("SELECT status, deleted_at FROM orgs WHERE id = ?").bind(org.id).first<any>();
    expect(row.status).toBe("deleted");
    expect(row.deleted_at).toBeGreaterThan(0);
    await expect(loginAs("life-cycle", "own", "pass1234", "life-cycle.salonkit.online")).rejects.toThrow();
  });

  it("reactivated status follows the dates", () => {
    const now = 1_000_000;
    expect(reactivatedStatus({ trial_ends_at: now + 1, grace_ends_at: now + 2 }, null, now)).toBe("trial");
    expect(reactivatedStatus({ trial_ends_at: now - 1, grace_ends_at: now + 2 }, null, now)).toBe("grace");
    expect(reactivatedStatus({ trial_ends_at: null, grace_ends_at: null }, null, now)).toBe("expired");
    expect(reactivatedStatus({ trial_ends_at: null, grace_ends_at: null }, { provider: "manual", current_period_end: null }, now)).toBe("active");
    expect(reactivatedStatus({ trial_ends_at: null, grace_ends_at: null }, { provider: "manual", current_period_end: now - 1 }, now)).toBe("expired");
  });

  it("bulk extends and deactivates the expired queue", async () => {
    const a = await makeOrg({ slug: "bulk-a", status: "expired" });
    const b = await makeOrg({ slug: "bulk-b", status: "expired" });
    const r = (await (await P("POST", "/orgs/bulk", owner, { ids: [a.id, b.id], action: "extend_trial", days: 3 })).json()) as { changed: number };
    expect(r.changed).toBe(2);
    expect((await P("POST", "/orgs/bulk", owner, { ids: [a.id], action: "deactivate" })).status).toBe(200);
    const st = await env.DB.prepare("SELECT slug, status FROM orgs WHERE id IN (?, ?) ORDER BY slug").bind(a.id, b.id).all<any>();
    expect(st.results).toEqual([{ slug: "bulk-a", status: "deactivated" }, { slug: "bulk-b", status: "trial" }]);
    const many = Array.from({ length: BULK_MAX + 1 }, (_, i) => `x${i}`);
    expect((await P("POST", "/orgs/bulk", owner, { ids: many, action: "deactivate" })).status).toBe(400);
  });
});

describe("support mode", () => {
  it("a 60-second code signs in once as the owner, on that salon's host only, audited", async () => {
    const org = await makeOrg({ slug: "help-me" });
    await makeUser(org.id, { username: "own" });
    const ownerId = (await env.DB.prepare("SELECT id FROM users WHERE org_id = ? AND username = 'own'").bind(org.id).first<{ id: number }>())!.id;
    await env.DB.prepare("UPDATE orgs SET owner_user_id = ? WHERE id = ?").bind(ownerId, org.id).run();
    const other = await makeOrg({ slug: "not-me" });

    const r = (await (await P("POST", `/orgs/${org.id}/support`, support)).json()) as { url: string };
    expect(r.url).toMatch(/^https:\/\/help-me\.salonkit\.online\/login\/\?support=[\w-]+$/);
    const code = decodeURIComponent(r.url.split("support=")[1]!);

    // Another salon's host refuses it (and that uses it up).
    expect((await req("POST", "https://not-me.salonkit.online/api/auth/support", { code })).status).toBe(401);
    const r2 = (await (await P("POST", `/orgs/${org.id}/support`, support)).json()) as { url: string };
    const code2 = decodeURIComponent(r2.url.split("support=")[1]!);
    const ok = await req("POST", "https://help-me.salonkit.online/api/auth/support", { code: code2 });
    expect(ok.status).toBe(200);
    const set = ok.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/Max-Age=7200/);
    const me = (await (await req("GET", "https://help-me.salonkit.online/api/me", undefined, { cookie: cookieOf(ok) })).json()) as { support: boolean; user: { username: string } };
    expect(me).toMatchObject({ support: true, user: { username: "own" } });
    // Used once.
    expect((await req("POST", "https://help-me.salonkit.online/api/auth/support", { code: code2 })).status).toBe(401);
    // Expired codes fail.
    const r3 = (await (await P("POST", `/orgs/${org.id}/support`, support)).json()) as { url: string };
    await env.DB.prepare("UPDATE support_sessions SET expires_at = 1 WHERE org_id = ? AND used_at IS NULL").bind(org.id).run();
    expect((await req("POST", "https://help-me.salonkit.online/api/auth/support", { code: decodeURIComponent(r3.url.split("support=")[1]!) })).status).toBe(401);

    const trail = await env.DB.prepare("SELECT action, who FROM platform_audit WHERE org_id = ? ORDER BY id").bind(org.id).all<any>();
    expect(trail.results.map((t: any) => t.action)).toEqual(["support_code", "support_code", "support_login", "support_code"]);
    expect(other.id).toBeTruthy();
  });

  it("a normal session is not support mode", async () => {
    const org = await makeOrg({ slug: "plain-me" });
    await makeUser(org.id, { username: "own" });
    const c = await loginAs("plain-me", "own", "pass1234", "plain-me.salonkit.online");
    expect(((await (await req("GET", "https://plain-me.salonkit.online/api/me", undefined, { cookie: c })).json()) as { support: boolean }).support).toBe(false);
  });
});

describe("plans, users, audit, overview", () => {
  it("plan matrix edits change what salons on it get", async () => {
    const org = await makeOrg({ slug: "matrix-org", plan: "free" });
    await makeUser(org.id, { username: "own" });
    const salon = await loginAs("matrix-org", "own", "pass1234", "matrix-org.salonkit.online");
    const plans = (await (await P("GET", "/plans", owner)).json()) as { plans: { id: string; features: string[]; limits: { max_staff: number | null } }[] };
    const free = plans.plans.find((p) => p.id === "free")!;
    const put = await P("PUT", "/plans/free", owner, { name: "Free", price_monthly: 0, max_staff: free.limits.max_staff, active: true, features: [...free.features, "ratings"] });
    expect(put.status).toBe(200);
    const me = (await (await req("GET", "https://matrix-org.salonkit.online/api/me", undefined, { cookie: salon })).json()) as { features: string[] };
    expect(me.features).toContain("ratings");
    // Put it back for other tests.
    await P("PUT", "/plans/free", owner, { name: "Free", price_monthly: 0, max_staff: free.limits.max_staff, active: true, features: free.features });
    expect((await P("PUT", "/plans/nope", owner, { name: "X", price_monthly: 0, max_staff: 1, features: [] })).status).toBe(404);
    expect((await P("PUT", "/plans/free", owner, { name: "", price_monthly: 0, max_staff: 1, features: [] })).status).toBe(400);
  });

  it("owners add and remove platform users, not themselves", async () => {
    expect((await P("POST", "/users", owner, { email: "new@salonkit.test", password: "short", role: "support" })).status).toBe(400);
    expect((await P("POST", "/users", owner, { email: "new@salonkit.test", password: "longenough1", role: "support" })).status).toBe(201);
    expect((await P("POST", "/users", owner, { email: "NEW@salonkit.test", password: "longenough1" })).status).toBe(409);
    expect((await P("POST", "/users", support, { email: "x@salonkit.test", password: "longenough1" })).status).toBe(403);
    const users = (await (await P("GET", "/users", owner)).json()) as { id: number; email: string; password_hash?: string }[];
    expect(users[0]).not.toHaveProperty("password_hash");
    const me = users.find((u) => u.email === "boss@salonkit.test")!;
    expect((await P("DELETE", `/users/${me.id}`, owner)).status).toBe(400);
    const added = users.find((u) => u.email === "new@salonkit.test")!;
    expect((await P("DELETE", `/users/${added.id}`, owner)).status).toBe(200);
  });

  it("audit and overview answer", async () => {
    const audit = (await (await P("GET", "/audit", owner)).json()) as { action: string }[];
    expect(audit.length).toBeGreaterThan(0);
    const ov = (await (await P("GET", "/overview", owner)).json()) as { byStatus: Record<string, number>; mrr: number; signups: Record<string, number> };
    expect(typeof ov.mrr).toBe("number");
    expect(Object.keys(ov.byStatus).length).toBeGreaterThan(0);
    expect(Object.values(ov.signups).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("needs a session", async () => {
    expect((await req("GET", `${ADMIN}/api/platform/orgs`)).status).toBe(401);
  });
});
