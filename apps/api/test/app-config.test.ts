import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import app from "../src/index";
import type { Env } from "../src/env";
import { hashPassword } from "../src/core/crypto";
import { compareVersions } from "../src/platform/app-config";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const E = { ...env, ROOT_DOMAIN: "salonkit.online" } as Env;
const ADMIN = "https://admin.salonkit.online";
const call = (method: string, url: string, headers: Record<string, string> = {}, body?: unknown) =>
  app.fetch(new Request(url, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), E, ctx);

let admin = "";
beforeAll(async () => {
  await env.DB.prepare("INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(?,?,?,?)").bind("ver@salonkit.test", await hashPassword("superpass123"), "owner", Date.now()).run();
  const r = await call("POST", `${ADMIN}/api/platform/login`, { "CF-Connecting-IP": "10.56.0.1" }, { email: "ver@salonkit.test", password: "superpass123" });
  admin = r.headers.get("set-cookie")!.split(";")[0]!;
});

describe("app config", () => {
  it("public read returns seeded android row", async () => {
    const r = await call("GET", `${ADMIN}/api/public/app-config?platform=android`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await r.json()).toEqual({ min_version: "1.0.0", latest_version: "1.0.0", store_url: "https://play.google.com/store/apps/details?id=online.salonkit.app" });
  });

  it("bad platform 400", async () => {
    expect((await call("GET", `${ADMIN}/api/public/app-config?platform=web`)).status).toBe(400);
  });

  it("compares numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
  });

  it("super admin updates; min > latest rejected", async () => {
    const put = (b: unknown) => call("PUT", `${ADMIN}/api/platform/app-config/ios`, { cookie: admin }, b);
    expect((await put({ min_version: "1.10.0", latest_version: "1.9.0", store_url: "https://apps.apple.com/app/x" })).status).toBe(400);
    expect((await put({ min_version: "1.0", latest_version: "1.2.0", store_url: "https://apps.apple.com/app/x" })).status).toBe(400);
    expect((await put({ min_version: "1.0.0", latest_version: "1.2.0", store_url: "http://apps.apple.com/app/x" })).status).toBe(400);
    expect((await put({ min_version: "1.1.0", latest_version: "1.2.0", store_url: "https://apps.apple.com/app/salonkit" })).status).toBe(200);
    expect(await (await call("GET", `${ADMIN}/api/public/app-config?platform=ios`)).json()).toMatchObject({ min_version: "1.1.0", latest_version: "1.2.0" });
    expect((await call("PUT", `${ADMIN}/api/platform/app-config/ios`, {}, { min_version: "1.0.0", latest_version: "1.0.0", store_url: "https://a.b" })).status).toBe(401);
  });

  it("device counts by version", async () => {
    await env.DB.prepare("INSERT INTO orgs(id,slug,name,status,plan_id,created_at) VALUES('org_ver','ver-salon','v','active','pro',1)").run();
    const u = await env.DB.prepare("INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES('org_ver','a','a','barber','x',1) RETURNING id").first<{ id: number }>();
    const add = (id: string, platform: string, v: string, exp: number) =>
      env.DB.prepare("INSERT INTO mobile_sessions(id,org_id,user_id,token_hash,device_id,device_name,platform,app_version,session_version,created_at,last_used_at,expires_at) VALUES(?,?,?,?,?,?,?,?,1,1,1,?)")
        .bind(id, "org_ver", u!.id, `h${id}`, `dev-${id}-xx`, "P", platform, v, exp).run();
    const future = Date.now() + 86_400_000;
    await add("m1", "android", "1.0.0", future);
    await add("m2", "android", "1.0.0", future);
    await add("m3", "ios", "1.1.0", future);
    await add("m4", "ios", "0.9.0", 1); // expired: not counted
    const g = (await (await call("GET", `${ADMIN}/api/platform/app-config`, { cookie: admin })).json()) as { devices: Record<string, Record<string, number>> };
    expect(g.devices.android).toEqual({ "1.0.0": 2 });
    expect(g.devices.ios).toEqual({ "1.1.0": 1 });
  });
});
