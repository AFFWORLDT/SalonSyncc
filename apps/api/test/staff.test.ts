import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { tenantRepo } from "../src/data/tenant";
import { PUBLIC_LIMITS } from "../src/lib/limits";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "" };
const call = (method: string, path: string, cookie: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.fetch(
    new Request(`https://x.test/api${path}`, {
      method,
      headers: { cookie, ...(body !== undefined && !(body instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
    }),
    E,
    ctx,
  );
const pub = (path: string) => app.fetch(new Request(`https://x.test/api/public${path}`), E, ctx);

async function setup(slug: string, plan: "free" | "pro" | "pro_max" = "pro_max") {
  const org = await makeOrg({ slug, plan });
  const owner = await makeUser(org.id, { username: "own", role: "owner" });
  return { org, owner, ck: await loginAs(slug, "own") };
}
const input = (over: Record<string, unknown> = {}) => ({ name: "Sonu", username: "sonu", password: "secret1", role: "barber", ...over });

describe("staff CRUD", () => {
  it("creates, lists, updates", async () => {
    const { ck } = await setup("st-crud");
    const r = await call("POST", "/users", ck, input({ phone: "050 123 4567", commission_pct: 25, can_add_expense: true }));
    expect(r.status).toBe(201);
    const u: any = await r.json();
    expect(u).toMatchObject({ name: "Sonu", username: "sonu", role: "barber", commission_pct: 25, active: true, can_add_expense: true, avatar_url: null });
    expect(u.password_hash).toBeUndefined();
    const list: any[] = await (await call("GET", "/users", ck)).json();
    expect(list.map((x) => x.username).sort()).toEqual(["own", "sonu"]);
    const up = await call("PUT", `/users/${u.id}`, ck, input({ name: "Sonu K", username: "sonu", role: "admin", commission_pct: null }));
    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({ name: "Sonu K", role: "admin", commission_pct: null });
    const logs = await env.DB.prepare("SELECT action, entity_id FROM audit_log WHERE org_id = (SELECT id FROM orgs WHERE slug='st-crud') AND entity='user' ORDER BY id").all<any>();
    expect(logs.results.map((l) => l.action)).toEqual(["create", "update"]);
    expect(logs.results[0].entity_id).toBe(u.id);
  });

  it("barbers are forbidden", async () => {
    const { org } = await setup("st-forbid");
    await makeUser(org.id, { username: "bar", role: "barber" });
    const bk = await loginAs("st-forbid", "bar");
    expect((await call("GET", "/users", bk)).status).toBe(403);
    expect((await call("POST", "/users", bk, input())).status).toBe(403);
  });

  it("validates input", async () => {
    const { ck } = await setup("st-val");
    expect((await call("POST", "/users", ck, input({ name: "" }))).status).toBe(400);
    expect((await call("POST", "/users", ck, input({ username: "a b" }))).status).toBe(400);
    expect((await call("POST", "/users", ck, input({ password: "abc" }))).status).toBe(400);
    expect((await call("POST", "/users", ck, input({ role: "owner" }))).status).toBe(400);
    expect((await call("POST", "/users", ck, input({ phone: "12" }))).status).toBe(400);
  });

  it("duplicate username in the same org is 409, case-insensitively", async () => {
    const { ck } = await setup("st-dup");
    expect((await call("POST", "/users", ck, input())).status).toBe(201);
    for (const username of ["sonu", "SONU", "Own"]) {
      const r = await call("POST", "/users", ck, input({ username }));
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "Username is taken" });
    }
  });

  it("same username in two orgs is fine (RF3)", async () => {
    const a = await setup("st-two-a");
    const b = await setup("st-two-b");
    expect((await call("POST", "/users", a.ck, input())).status).toBe(201);
    expect((await call("POST", "/users", b.ck, input())).status).toBe(201);
  });

  it("login is case-insensitive on username", async () => {
    const { ck, org } = await setup("st-case");
    await call("POST", "/users", ck, input({ username: "SonuK" }));
    expect(await loginAs("st-case", "sonuk", "secret1")).toContain("ss_session");
    expect((await tenantRepo(env.DB, org.id).userByUsername("SONUK"))?.username).toBe("SonuK");
  });
});

describe("staff limit (RF5)", () => {
  it("free org: 2 barbers fine, third is 409; reactivation over the limit is 409", async () => {
    const { ck } = await setup("st-lim", "free");
    const a: any = await (await call("POST", "/users", ck, input({ username: "b1" }))).json();
    const b: any = await (await call("POST", "/users", ck, input({ username: "b2" }))).json();
    const r = await call("POST", "/users", ck, input({ username: "b3" }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "Staff limit reached for your plan", code: "staff_limit" });
    // deactivate one, add another, then reactivating the first goes over
    expect((await call("PUT", `/users/${a.id}`, ck, input({ username: "b1", active: false }))).status).toBe(200);
    expect((await call("POST", "/users", ck, input({ username: "b3" }))).status).toBe(201);
    const re = await call("PUT", `/users/${a.id}`, ck, input({ username: "b1", active: true }));
    expect(re.status).toBe(409);
    expect((await re.json() as any).code).toBe("staff_limit");
    // editing an already-active user is not blocked
    expect((await call("PUT", `/users/${b.id}`, ck, input({ username: "b2", name: "B Two" }))).status).toBe(200);
  });

  it("owner does not count; unlimited plan has no cap", async () => {
    const { ck } = await setup("st-unl", "pro_max");
    for (let i = 0; i < 4; i++) expect((await call("POST", "/users", ck, input({ username: `u${i}` }))).status).toBe(201);
  });
});

describe("owner protection and sessions", () => {
  it("nobody can demote, deactivate or delete the owner", async () => {
    const { org, owner, ck } = await setup("st-owner");
    await makeUser(org.id, { username: "adm", role: "admin" });
    const ak = await loginAs("st-owner", "adm");
    const msg = { error: "The owner can't be changed here" };
    for (const who of [ck, ak]) {
      let r = await call("DELETE", `/users/${owner.id}`, who);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual(msg);
    }
    let r = await call("PUT", `/users/${owner.id}`, ak, input({ username: "own" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual(msg);
    r = await call("PUT", `/users/${owner.id}`, ck, input({ username: "own", role: "admin" }));
    expect(r.status).toBe(400);
    r = await call("PUT", `/users/${owner.id}`, ck, { name: "Own", username: "own", active: false });
    expect(r.status).toBe(400);
    r = await call("POST", `/users/${owner.id}/reset-password`, ak, { password: "newpass" });
    expect(r.status).toBe(400);
    // the owner may edit their own profile, role stays
    r = await call("PUT", `/users/${owner.id}`, ck, { name: "Boss", username: "own" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ name: "Boss", role: "owner", active: true });
  });

  it("an admin can't drop their own admin access", async () => {
    const { org } = await setup("st-self");
    const adm = await makeUser(org.id, { username: "adm", role: "admin" });
    const ak = await loginAs("st-self", "adm");
    expect((await call("PUT", `/users/${adm.id}`, ak, input({ username: "adm", role: "barber" }))).status).toBe(400);
    expect((await call("DELETE", `/users/${adm.id}`, ak)).status).toBe(400);
  });

  it("deactivation logs the user out", async () => {
    const { org, ck } = await setup("st-out");
    const bar = await makeUser(org.id, { username: "bar", role: "barber" });
    const bk = await loginAs("st-out", "bar");
    expect((await call("GET", "/me", bk)).status).toBe(200);
    expect((await call("PUT", `/users/${bar.id}`, ck, input({ username: "bar", active: false }))).status).toBe(200);
    expect((await call("GET", "/me", bk)).status).toBe(401);
  });

  it("reset-password signs out, sets the new password and clears lockout rows", async () => {
    const { org, ck } = await setup("st-reset");
    const bar = await makeUser(org.id, { username: "Bar", role: "barber", password: "oldpass1" });
    const bk = await loginAs("st-reset", "Bar", "oldpass1");
    const repo = tenantRepo(env.DB, org.id);
    await repo.recordLoginFailure([`a:${org.id}:bar`, `d:${org.id}:bar:1.2.3.4`, `a:${org.id}:other`], Date.now(), 0);
    await repo.recordLoginFailure([`d:${org.id}:bar:5.6.7.8`], Date.now(), 0);
    expect((await call("POST", `/users/${bar.id}/reset-password`, ck, { password: "abc" })).status).toBe(400);
    const r = await call("POST", `/users/${bar.id}/reset-password`, ck, { password: "newpass1" });
    expect(r.status).toBe(200);
    expect((await call("GET", "/me", bk)).status).toBe(401);
    expect(await loginAs("st-reset", "bar", "newpass1")).toContain("ss_session");
    const left = await env.DB.prepare("SELECT key FROM login_failures WHERE org_id = ?").bind(org.id).all<{ key: string }>();
    expect(left.results.map((x) => x.key)).toEqual([`a:${org.id}:other`]);
    const log = await env.DB.prepare("SELECT action FROM audit_log WHERE org_id = ? AND action = 'password_reset'").bind(org.id).all();
    expect(log.results.length).toBe(1);
  });

  it("delete removes an unused user, a 404 for unknown", async () => {
    const { org, ck } = await setup("st-del");
    const bar = await makeUser(org.id, { username: "bar", role: "barber" });
    const r = await call("DELETE", `/users/${bar.id}`, ck);
    expect(await r.json()).toEqual({ ok: true, deleted: true });
    expect(await env.DB.prepare("SELECT id FROM users WHERE org_id = ? AND id = ?").bind(org.id, bar.id).first()).toBeNull();
    expect((await call("DELETE", `/users/${bar.id}`, ck)).status).toBe(404);
    expect((await call("DELETE", `/users/abc`, ck)).status).toBe(400);
  });
});

describe("avatars", () => {
  const png = (n: number) => new Uint8Array(n).fill(7);
  const put = (path: string, ck: string, bytes: Uint8Array, type = "image/png") => call("PUT", path, ck, bytes, { "content-type": type });

  it("uploads, serves publicly, replaces and clears", async () => {
    const { org, owner, ck } = await setup("st-av");
    const r = await put("/me/avatar", ck, png(100));
    expect(r.status).toBe(200);
    const { avatar_url } = (await r.json()) as any;
    expect(avatar_url).toBe(`/api/public/avatar/${owner.id}/1?org=st-av`);
    const img = await pub(avatar_url.replace("/api/public", "") );
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(png(100));
    expect(((await (await put("/me/avatar", ck, png(50), "image/webp")).json()) as any).avatar_url).toContain("/2?org=");
    const list: any[] = await (await call("GET", "/users", ck)).json();
    expect(list[0].avatar_url).toContain(`/api/public/avatar/${owner.id}/2`);
    const me: any = await (await call("DELETE", "/me/avatar", ck)).json();
    expect(me.avatar_url).toBeNull();
    expect((await pub(`/avatar/${owner.id}/2?org=st-av`)).status).toBe(404);
  });

  it("rejects over 300 KB, empty and wrong types", async () => {
    const { ck } = await setup("st-av2");
    expect((await put("/me/avatar", ck, png(300 * 1024 + 1))).status).toBe(400);
    expect((await put("/me/avatar", ck, png(300 * 1024))).status).toBe(200);
    expect((await put("/me/avatar", ck, png(0))).status).toBe(400);
    expect((await put("/me/avatar", ck, png(10), "image/gif")).status).toBe(400);
    expect((await put("/me/avatar", ck, png(10), "text/html")).status).toBe(400);
  });

  it("my banner: uploads, shows in /me, serves publicly, clears", async () => {
    const { owner, ck } = await setup("st-bn");
    const r = await put("/me/banner", ck, png(120));
    expect(r.status).toBe(200);
    const { banner_url } = (await r.json()) as any;
    expect(banner_url).toBe(`/api/public/banner/${owner.id}/1?org=st-bn`);
    const me: any = await (await call("GET", "/me", ck)).json();
    expect(me.user.banner_url).toBe(banner_url);
    const img = await pub(banner_url.replace("/api/public", ""));
    expect(img.status).toBe(200);
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(png(120));
    expect((await put("/me/banner", ck, png(300 * 1024 + 1))).status).toBe(400);
    expect((await put("/me/banner", ck, png(10), "image/gif")).status).toBe(400);
    expect(((await (await call("DELETE", "/me/banner", ck)).json()) as any).banner_url).toBeNull();
    expect((await pub(`/banner/${owner.id}/1?org=st-bn`)).status).toBe(404);
    expect(((await (await call("GET", "/me", ck)).json()) as any).user.banner_url).toBeNull();
  });

  it("admin sets another user's avatar; barbers can't", async () => {
    const { org, ck } = await setup("st-av3");
    const bar = await makeUser(org.id, { username: "bar", role: "barber" });
    const bk = await loginAs("st-av3", "bar");
    expect((await put(`/users/${bar.id}/avatar`, bk, png(10))).status).toBe(403);
    expect((await put(`/users/${bar.id}/avatar`, ck, png(10))).status).toBe(200);
    expect((await put("/me/avatar", bk, png(10))).status).toBe(200);
    expect((await call("DELETE", `/users/${bar.id}/avatar`, ck)).status).toBe(200);
  });

  it("admins can't replace or clear the owner's avatar; the owner can", async () => {
    const { org, owner, ck } = await setup("st-av4");
    await makeUser(org.id, { username: "adm", role: "admin" });
    const ak = await loginAs("st-av4", "adm");
    expect((await put(`/users/${owner.id}/avatar`, ak, png(10))).status).toBe(400);
    expect((await call("DELETE", `/users/${owner.id}/avatar`, ak)).status).toBe(400);
    expect((await put("/me/avatar", ck, png(10))).status).toBe(200);
  });

  it("rejects an oversized content-length before reading the body", async () => {
    const { ck } = await setup("st-av5");
    const r = await put("/me/avatar", ck, png(10), "image/png");
    expect(r.status).toBe(200);
    const big = await call("PUT", "/me/avatar", ck, png(10), { "content-type": "image/png", "content-length": String(300 * 1024 + 1) });
    expect(big.status).toBe(400);
  });

  it("public avatar is 404 across orgs and for unknown ids", async () => {
    const a = await setup("st-pa-a");
    await setup("st-pa-b");
    await put("/me/avatar", a.ck, png(10));
    expect((await pub(`/avatar/${a.owner.id}/1?org=st-pa-a`)).status).toBe(200);
    expect((await pub(`/avatar/${a.owner.id}/1?org=st-pa-b`)).status).toBe(404);
    expect((await pub(`/avatar/${a.owner.id}/1`)).status).toBe(404);
    expect((await pub(`/avatar/999999/1?org=st-pa-a`)).status).toBe(404);
    expect((await pub(`/avatar/x/1?org=st-pa-a`)).status).toBe(404);
  });
});

describe("final-review hardening", () => {
  const png = (n: number) => new Uint8Array(n).fill(7);
  const put = (path: string, ck: string, bytes: Uint8Array, type = "image/png") => call("PUT", path, ck, bytes, { "content-type": type });

  it("I2: PUT keeps phone and commission_pct when omitted; explicit null or empty clears them", async () => {
    const { ck } = await setup("st-keep");
    const u: any = await (await call("POST", "/users", ck, input({ phone: "050 123 4567", commission_pct: 25 }))).json();
    const phone = u.phone;
    expect(phone).toBeTruthy();
    const r = await call("PUT", `/users/${u.id}`, ck, { name: "Sonu", username: "sonu", can_add_expense: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ phone, commission_pct: 25, can_add_expense: true });
    const c1 = await call("PUT", `/users/${u.id}`, ck, { name: "Sonu", username: "sonu", commission_pct: null });
    expect(await c1.json()).toMatchObject({ phone, commission_pct: null });
    const c2 = await call("PUT", `/users/${u.id}`, ck, { name: "Sonu", username: "sonu", phone: "" });
    expect(await c2.json()).toMatchObject({ phone: null, commission_pct: null });
    const c3 = await call("PUT", `/users/${u.id}`, ck, { name: "Sonu", username: "sonu", phone: "050 123 4567", commission_pct: 30 });
    expect(await c3.json()).toMatchObject({ phone, commission_pct: 30 });
    const c4 = await call("PUT", `/users/${u.id}`, ck, { name: "Sonu", username: "sonu", phone: null, commission_pct: "" });
    expect(await c4.json()).toMatchObject({ phone: null, commission_pct: null });
  });

  it("M1: the public avatar needs the current version and an active user", async () => {
    const { org, ck } = await setup("st-avv");
    const bar = await makeUser(org.id, { username: "bar", role: "barber" });
    await put(`/users/${bar.id}/avatar`, ck, png(10));
    await put(`/users/${bar.id}/avatar`, ck, png(11));
    expect((await pub(`/avatar/${bar.id}/2?org=st-avv`)).status).toBe(200);
    expect((await pub(`/avatar/${bar.id}/1?org=st-avv`)).status).toBe(404);
    expect((await pub(`/avatar/${bar.id}/3?org=st-avv`)).status).toBe(404);
    expect((await pub(`/avatar/${bar.id}/x?org=st-avv`)).status).toBe(404);
    await env.DB.prepare("UPDATE users SET active = 0 WHERE org_id = ? AND id = ?").bind(org.id, bar.id).run();
    expect((await pub(`/avatar/${bar.id}/2?org=st-avv`)).status).toBe(404);
  });

  it("M2: public avatars have their own per-IP bucket (300/min); other public routes stay on pub", async () => {
    const { owner, ck } = await setup("st-avrl");
    await put("/me/avatar", ck, png(10));
    const h = { "CF-Connecting-IP": "7.7.7.77" };
    const av = () => app.fetch(new Request(`https://x.test/api/public/avatar/${owner.id}/1?org=st-avrl`, { headers: h }), E, ctx);
    for (let i = 0; i < PUBLIC_LIMITS.avatar; i++) expect((await av()).status, `hit ${i}`).toBe(200);
    const r = await av();
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    // The pub bucket for the same IP is untouched.
    expect((await app.fetch(new Request("https://x.test/api/public/_probe", { headers: h }), E, ctx)).status).toBe(200);
  });

  it("M8: a user who only created records (a company expense) is deactivated, not deleted", async () => {
    const { org, ck } = await setup("st-act");
    const adm = await makeUser(org.id, { username: "adm", role: "admin" });
    const ak = await loginAs("st-act", "adm");
    expect((await call("POST", "/company-expenses", ak, { amount: 100, note: "Rent", paid_from: "bank" })).status).toBe(200);
    expect(await (await call("DELETE", `/users/${adm.id}`, ck)).json()).toEqual({ ok: true, deactivated: true });
    expect(await env.DB.prepare("SELECT active FROM users WHERE org_id = ? AND id = ?").bind(org.id, adm.id).first()).toEqual({ active: 0 });
  });

  it("M8: transfers, payouts and audit rows authored by a user also count", async () => {
    const { org, owner, ck } = await setup("st-act2");
    const ids: number[] = [];
    for (const n of ["t1", "p1", "a1", "none"]) ids.push((await makeUser(org.id, { username: n, role: "admin" })).id);
    const [t1, p1, a1, none] = ids as [number, number, number, number];
    await env.DB.prepare(
      "INSERT INTO money_transfers (org_id, uid, day, amount, from_account, to_account, created_by, created_at, updated_at) VALUES (?, 'u-t1', '2026-11-01', 100, 'cash', 'bank', ?, 1, 1)",
    ).bind(org.id, t1).run();
    await env.DB.prepare(
      "INSERT INTO barber_payouts (org_id, uid, barber_id, day, amount, paid_from, created_by, created_at, updated_at) VALUES (?, 'u-p1', ?, '2026-11-01', 100, 'cash', ?, 1, 1)",
    ).bind(org.id, owner.id, p1).run();
    await env.DB.prepare(
      "INSERT INTO audit_log (org_id, at, actor_id, actor_name, entity, entity_id, ref, action) VALUES (?, 1, ?, 'a1', 'service', 1, 'x', 'create')",
    ).bind(org.id, a1).run();
    for (const id of [t1, p1, a1]) expect(await (await call("DELETE", `/users/${id}`, ck)).json(), String(id)).toMatchObject({ deactivated: true });
    expect(await (await call("DELETE", `/users/${none}`, ck)).json()).toMatchObject({ deleted: true });
  });
});

describe("case-insensitive username index", () => {
  it("the database refuses Sam and sam in one org, but allows them in two", async () => {
    const a = await makeOrg({ slug: "st-ci-a" });
    const b = await makeOrg({ slug: "st-ci-b" });
    const ins = (org: string, u: string) =>
      env.DB.prepare("INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?)").bind(org, u, u, "barber", "x", 1).run();
    await ins(a.id, "Sam");
    await expect(ins(a.id, "sam")).rejects.toThrow(/UNIQUE/);
    await ins(b.id, "sam");
  });
});

describe("avatar versions (Plan 3 start follow-ups)", () => {
  const png = (n: number) => new Uint8Array(n).fill(7);
  const put = (ck: string) => call("PUT", "/me/avatar", ck, png(20), { "content-type": "image/png" });

  it("a re-upload after a clear gets a new, never-reused URL", async () => {
    const { owner, ck } = await setup("st-avver");
    const u1 = ((await (await put(ck)).json()) as any).avatar_url;
    await call("DELETE", "/me/avatar", ck);
    const list0: any[] = await (await call("GET", "/users", ck)).json();
    expect(list0.find((u) => u.id === owner.id).avatar_url).toBeNull();
    const u2 = ((await (await put(ck)).json()) as any).avatar_url;
    expect(u2).not.toBe(u1);
    expect(u2).toBe(`/api/public/avatar/${owner.id}/3?org=st-avver`);
    expect((await pub(u1.replace("/api/public", ""))).status).toBe(404);
    expect((await pub(u2.replace("/api/public", ""))).status).toBe(200);
  });

  it("an inactive user's avatar_url is null", async () => {
    const { org, ck } = await setup("st-avi");
    const b = await makeUser(org.id, { username: "bb", role: "barber" });
    await env.DB.prepare("UPDATE users SET avatar = x'00', avatar_type = 'image/png', avatar_v = 1, active = 0 WHERE id = ?").bind(b.id).run();
    const list: any[] = await (await call("GET", "/users", ck)).json();
    expect(list.find((u) => u.id === b.id).avatar_url).toBeNull();
  });
});
