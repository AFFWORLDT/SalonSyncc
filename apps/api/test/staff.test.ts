import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser, loginAs } from "./helpers";
import { tenantRepo } from "../src/data/tenant";

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

  it("rejects over 200 KB, empty and wrong types", async () => {
    const { ck } = await setup("st-av2");
    expect((await put("/me/avatar", ck, png(200 * 1024 + 1))).status).toBe(400);
    expect((await put("/me/avatar", ck, png(200 * 1024))).status).toBe(200);
    expect((await put("/me/avatar", ck, png(0))).status).toBe(400);
    expect((await put("/me/avatar", ck, png(10), "image/gif")).status).toBe(400);
    expect((await put("/me/avatar", ck, png(10), "text/html")).status).toBe(400);
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
    const big = await call("PUT", "/me/avatar", ck, png(10), { "content-type": "image/png", "content-length": String(300 * 1024) });
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
