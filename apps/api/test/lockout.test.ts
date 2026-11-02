import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const e = { ...env, ROOT_DOMAIN: "" };
const login = (org: string, username: string, password: string, ip: string) =>
  app.fetch(
    new Request("https://x.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ org, username, password }),
    }),
    e,
    ctx,
  );
const MSG = "Too many attempts. Try again in a few minutes.";

describe("login lockout", () => {
  it("8 wrong from one device lock that device only; another device still gets in", async () => {
    const org = await makeOrg({ slug: "lk-dev" });
    await makeUser(org.id, { username: "sam", password: "rightpass" });
    for (let i = 0; i < 8; i++) expect((await login("lk-dev", "sam", "nope", "10.0.9.1")).status).toBe(401);
    expect((await login("lk-dev", "sam", "rightpass", "10.0.9.1")).status).toBe(429);
    expect((await login("lk-dev", "sam", "rightpass", "10.0.9.2")).status).toBe(200);
  });

  it("50 wrong spread over many devices lock the username from anywhere", async () => {
    const org = await makeOrg({ slug: "lk-spread" });
    await makeUser(org.id, { username: "sam", password: "rightpass" });
    for (let i = 0; i < 50; i++) expect((await login("lk-spread", "sam", "nope", `10.0.8.${i % 10}`)).status).toBe(401);
    const r = await login("lk-spread", "sam", "rightpass", "10.0.8.200");
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: MSG });
  });

  it("a username over 60 chars is a plain 401 with no failure row", async () => {
    const org = await makeOrg({ slug: "lk-long" });
    expect((await login("lk-long", "x".repeat(61), "nope", "10.0.7.1")).status).toBe(401);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE org_id = ?").bind(org.id).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("locks a device+username after 8 wrong passwords, even for the right password", async () => {
    const org = await makeOrg({ slug: "lk-a" });
    await makeUser(org.id, { username: "sam", password: "rightpass" });
    for (let i = 0; i < 8; i++) expect((await login("lk-a", "sam", "nope", "10.0.0.1")).status).toBe(401);
    const locked = await login("lk-a", "sam", "rightpass", "10.0.0.1");
    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual({ error: MSG });
    // same response for a wrong password once locked
    const wrong = await login("lk-a", "sam", "nope", "10.0.0.1");
    expect(wrong.status).toBe(429);
    expect(await wrong.json()).toEqual({ error: MSG });
  });

  it("the same username in another org is not locked (RF3)", async () => {
    const a = await makeOrg({ slug: "lk-b1" });
    const b = await makeOrg({ slug: "lk-b2" });
    await makeUser(a.id, { username: "sam", password: "rightpass" });
    await makeUser(b.id, { username: "sam", password: "rightpass" });
    for (let i = 0; i < 8; i++) await login("lk-b1", "sam", "nope", "10.0.1.1");
    expect((await login("lk-b1", "sam", "rightpass", "10.0.1.1")).status).toBe(429);
    expect((await login("lk-b2", "sam", "rightpass", "10.0.1.1")).status).toBe(200);
  });

  it("a success clears the counter", async () => {
    const org = await makeOrg({ slug: "lk-c" });
    await makeUser(org.id, { username: "sam", password: "rightpass" });
    for (let i = 0; i < 7; i++) await login("lk-c", "sam", "nope", "10.0.2.1");
    expect((await login("lk-c", "sam", "rightpass", "10.0.2.1")).status).toBe(200);
    for (let i = 0; i < 7; i++) expect((await login("lk-c", "sam", "nope", "10.0.2.1")).status).toBe(401);
    expect((await login("lk-c", "sam", "rightpass", "10.0.2.1")).status).toBe(200);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE org_id = ?").bind(org.id).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("the IP limiter stops one device after 20 failures across usernames and orgs, incl. unknown orgs", async () => {
    const org = await makeOrg({ slug: "lk-d" });
    await makeUser(org.id, { username: "sam", password: "rightpass" });
    for (let i = 0; i < 20; i++) expect((await login(i % 2 ? "no-such-org" : "lk-d", `u${i}`, "x", "10.0.3.1")).status).toBe(401);
    expect((await login("lk-d", "sam", "rightpass", "10.0.3.1")).status).toBe(429);
    expect((await login("no-such-org", "sam", "x", "10.0.3.1")).status).toBe(429);
    // another device is unaffected
    expect((await login("lk-d", "sam", "rightpass", "10.0.3.2")).status).toBe(200);
  });

  it("an unknown org only touches the IP limiter (no login_failures rows)", async () => {
    await login("ghost-org", "sam", "x", "10.0.4.1");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE key LIKE ?").bind("%ghost%").first<{ n: number }>();
    expect(n!.n).toBe(0);
    const hit = await env.DB.prepare("SELECT n FROM rate_hits WHERE key = ?").bind("login-ip:10.0.4.1").first<{ n: number }>();
    expect(hit!.n).toBe(1);
  });
});
