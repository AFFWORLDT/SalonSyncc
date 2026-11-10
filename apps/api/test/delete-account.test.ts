import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser } from "./helpers";

const ROOT = "salonkit.online";
const e = { ...env, ROOT_DOMAIN: ROOT };
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const call = (url: string, init?: RequestInit) => app.fetch(new Request(url, init), e, ctx);
const signIn = (slug: string, username: string, password: string, device: unknown) =>
  call(`https://${slug}.${ROOT}/api/mobile/session`, { method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": "10.1.0.9" }, body: JSON.stringify({ username, password, device }) });
// One phone per person (a second sign-in on the same device replaces the first).
const token = async (slug: string, username: string) =>
  ((await (await signIn(slug, username, "pass1234", { id: `device-${username}-01`, name: "Phone", platform: "ios", app_version: "1.0.0" })).json()) as { token: string }).token;
const del = (slug: string, tok: string, confirm: string) =>
  call(`https://${slug}.${ROOT}/api/me`, { method: "DELETE", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ confirm }) });
const me = (slug: string, tok: string) => call(`https://${slug}.${ROOT}/api/me`, { headers: { authorization: `Bearer ${tok}` } });

describe("DELETE /api/me", () => {
  it("staff: needs DELETE, then the account is gone and signed out", async () => {
    const org = await makeOrg({ slug: "del-staff" });
    await makeUser(org.id, { username: "own" });
    await makeUser(org.id, { username: "bob", role: "barber" });
    const t = await token("del-staff", "bob");
    expect((await del("del-staff", t, "nope")).status).toBe(400);
    expect((await del("del-staff", t, "delete")).status).toBe(200);
    expect((await me("del-staff", t)).status).toBe(401);
    const row = await env.DB.prepare("SELECT 1 FROM users WHERE org_id = ? AND username = 'bob'").bind(org.id).first();
    expect(row).toBeNull();
    // The salon and its owner are untouched.
    expect((await me("del-staff", await token("del-staff", "own"))).status).toBe(200);
  });

  it("owner: needs the salon ID, then the salon is deleted, details erased and everyone signed out", async () => {
    const org = await makeOrg({ slug: "del-owner" });
    await makeUser(org.id, { username: "own" });
    await makeUser(org.id, { username: "bob", role: "barber" });
    await env.DB.prepare("UPDATE users SET email = 'own@x.test', phone = '+971500000000' WHERE org_id = ? AND username = 'own'").bind(org.id).run();
    await env.DB.prepare("UPDATE orgs SET owner_email = 'own@x.test' WHERE id = ?").bind(org.id).run();
    const t = await token("del-owner", "own");
    const tb = await token("del-owner", "bob");
    expect((await del("del-owner", t, "DELETE")).status).toBe(400);
    expect((await del("del-owner", t, "del-owner")).status).toBe(200);
    expect((await me("del-owner", t)).status).toBe(401);
    expect((await me("del-owner", tb)).status).toBe(401);
    const o = await env.DB.prepare("SELECT status, deleted_at, owner_email FROM orgs WHERE id = ?").bind(org.id).first<{ status: string; deleted_at: number; owner_email: string | null }>();
    expect(o).toMatchObject({ status: "deleted", owner_email: null });
    const u = await env.DB.prepare("SELECT email, phone, active FROM users WHERE org_id = ? AND username = 'own'").bind(org.id).first();
    expect(u).toEqual({ email: null, phone: null, active: 0 });
    expect((await signIn("del-owner", "own", "pass1234", { id: "device-own-02", name: "Phone", platform: "ios", app_version: "1.0.0" })).status).not.toBe(200);
  });

  it("works on a lapsed salon too", async () => {
    const org = await makeOrg({ slug: "del-lapsed", status: "expired" });
    await makeUser(org.id, { username: "own" });
    expect((await del("del-lapsed", await token("del-lapsed", "own"), "del-lapsed")).status).toBe(200);
  });
});
