import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser } from "./helpers";
import { fakeServices } from "./fakes";
import { setServicesForTest } from "../src/core/services";
import { CODE_ASKS } from "../src/platform/login-code";

let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
const settle = async () => {
  while (pending.length) await Promise.all(pending.splice(0));
};
const ROOT = "salonkit.online";
const e = { ...env, ROOT_DOMAIN: ROOT };
const post = (slug: string, path: string, body: unknown, ip = "10.9.0.1") =>
  app.fetch(
    new Request(`https://${slug}.${ROOT}/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify(body),
    }),
    e,
    ctx,
  );
const device = { id: "device-code-01", name: "Sam's phone", platform: "android", app_version: "1.0.0" };

let f = fakeServices();
afterEach(() => setServicesForTest(null));

async function setup(slug: string) {
  f = fakeServices();
  f.install();
  const org = await makeOrg({ slug });
  const owner = await makeUser(org.id, { username: "boss@mail.com", role: "owner" });
  const b1 = await makeUser(org.id, { username: "sam", role: "barber" });
  await env.DB.prepare("UPDATE users SET email = 'Sam@Mail.com' WHERE id = ?").bind(b1.id).run();
  return { org, owner, b1 };
}

async function askCode(slug: string, email: string, ip?: string): Promise<string | null> {
  const before = f.mails.length;
  const r = await post(slug, "/auth/code", { email }, ip);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
  await settle();
  const m = f.mails[before];
  return m ? /\b(\d{6})\b/.exec(m.subject)![1]! : null;
}

describe("sign in with an emailed code", () => {
  it("emails a code to the staff email (any case); the web exchanges it once for a session", async () => {
    await setup("lc-web");
    const code = await askCode("lc-web", " sam@MAIL.com ");
    expect(code).toMatch(/^\d{6}$/);
    expect(f.mails[0]!.to).toBe("sam@mail.com");
    expect(f.mails[0]!.text).toContain(code!);
    const r = await post("lc-web", "/auth/code/verify", { email: "sam@mail.com", code });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("ss_session=");
    expect((await post("lc-web", "/auth/code/verify", { email: "sam@mail.com", code })).status).toBe(401); // once only
  });

  it("owners sign in with their signup email (their username)", async () => {
    await setup("lc-owner");
    const code = await askCode("lc-owner", "boss@mail.com");
    expect(code).not.toBeNull();
    expect((await post("lc-owner", "/auth/code/verify", { email: "boss@mail.com", code })).status).toBe(200);
  });

  it("the phone app gets a token with {email, code} instead of a password", async () => {
    await setup("lc-app");
    const code = await askCode("lc-app", "sam@mail.com");
    const r = await post("lc-app", "/mobile/session", { email: "sam@mail.com", code, device });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { token: string }).token).toMatch(/^skm_/);
  });

  it("an unknown email or another salon's email answers the same and sends nothing", async () => {
    await setup("lc-unknown");
    await setup("lc-other");
    expect(await askCode("lc-unknown", "nobody@mail.com")).toBeNull();
    const before = f.mails.length;
    await askCode("lc-other", "sam@mail.com"); // sam exists in lc-other too (its own user)
    expect(f.mails.length).toBe(before + 1);
    expect((await post("lc-unknown", "/auth/code", { email: "not-an-email" })).status).toBe(400);
  });

  it("a wrong code fails; five wrong tries kill the code; an inactive user can't ask", async () => {
    const { b1 } = await setup("lc-wrong");
    const code = await askCode("lc-wrong", "sam@mail.com", "10.9.1.1");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const ip = `10.9.2.${i}`; // a new device each time, so the per-device lock isn't what stops it
      expect((await post("lc-wrong", "/auth/code/verify", { email: "sam@mail.com", code: wrong }, ip)).status).toBe(401);
    }
    expect((await post("lc-wrong", "/auth/code/verify", { email: "sam@mail.com", code }, "10.9.3.1")).status).toBe(401);
    await env.DB.prepare("UPDATE users SET active = 0 WHERE id = ?").bind(b1.id).run();
    expect(await askCode("lc-wrong", "sam@mail.com", "10.9.4.1")).toBeNull();
  });

  it("an expired code fails", async () => {
    const { org } = await setup("lc-expired");
    const code = await askCode("lc-expired", "sam@mail.com");
    await env.DB.prepare("UPDATE login_codes SET expires_at = 1 WHERE org_id = ?").bind(org.id).run();
    expect((await post("lc-expired", "/auth/code/verify", { email: "sam@mail.com", code })).status).toBe(401);
  });

  it("asking too often is refused", async () => {
    await setup("lc-limit");
    for (let i = 0; i < CODE_ASKS.email; i++) await askCode("lc-limit", "sam@mail.com", `10.9.5.${i}`);
    expect((await post("lc-limit", "/auth/code", { email: "sam@mail.com" }, "10.9.6.1")).status).toBe(429);
  });
});

describe("password sign-in with an email instead of the username", () => {
  it("the staff email works with the password; a wrong password still fails", async () => {
    await setup("lc-pw");
    const r = await post("lc-pw", "/auth/login", { username: "SAM@mail.com", password: "pass1234" }, "10.9.7.1");
    expect(r.status).toBe(200);
    expect((await post("lc-pw", "/auth/login", { username: "sam@mail.com", password: "nope" }, "10.9.7.2")).status).toBe(401);
    const app = await post("lc-pw", "/mobile/session", { username: "sam@mail.com", password: "pass1234", device }, "10.9.7.3");
    expect(app.status).toBe(200);
  });
});
