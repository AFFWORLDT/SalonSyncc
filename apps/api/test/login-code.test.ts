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
  // One email = one person on SalonKit: the newest test salon's barber takes it over.
  await env.DB.prepare("UPDATE users SET email = NULL WHERE lower(email) = 'sam@mail.com'").run();
  await env.DB.prepare("UPDATE users SET email = 'sam@mail.com' WHERE id = ?").bind(b1.id).run();
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

  it("an unknown email answers the same and sends nothing", async () => {
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

const root = (path: string, body: unknown, ip = "10.8.0.1", method = "POST") =>
  app.fetch(
    new Request(`https://${ROOT}/api${path}`, {
      method,
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
      body: method === "GET" ? undefined : JSON.stringify(body),
    }),
    e,
    ctx,
  );

describe("one email = one salon: sign in with just the email", () => {
  it("on the bare domain the email finds the salon; the app gets a token and the salon's ID", async () => {
    await setup("lc-anywhere");
    const r = await root("/auth/code", { email: "sam@mail.com" });
    expect(r.status).toBe(200);
    await settle();
    const mail = f.mails.at(-1)!;
    const code = /\b(\d{6})\b/.exec(mail.subject)![1]!;
    expect(mail.text).toContain(`https://lc-anywhere.${ROOT}/l/?e=sam%40mail.com&c=${code}`);
    const s = await root("/mobile/session", { email: "sam@mail.com", code, device });
    expect(s.status).toBe(200);
    expect(await s.json()).toMatchObject({ slug: "lc-anywhere" });
  });

  it("a staff email already used in another salon is refused", async () => {
    const a = await setup("lc-dupe-a");
    await setup("lc-dupe-b"); // lc-dupe-b's barber now has sam@mail.com
    const ck = await loginAsOwner("lc-dupe-a");
    const r = await app.fetch(
      new Request(`https://lc-dupe-a.${ROOT}/api/users/${a.b1.id}`, { method: "PUT", headers: { cookie: ck, "content-type": "application/json" }, body: JSON.stringify({ name: "sam", username: "sam", email: "SAM@mail.com" }) }),
      e,
      ctx,
    );
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toContain("already used");
  });

  it("signup refuses a staff email from another salon; from the app it returns a token straight away", async () => {
    await setup("lc-su");
    const base = { salon_name: "New Cuts", owner_name: "Nina Owner", password: "longpass1", country: "AE" };
    expect((await root("/public/signup", { ...base, slug: "lc-su-new1", email: "sam@mail.com" }, "10.8.1.1")).status).toBe(409);
    const r = await root("/public/signup", { ...base, slug: "lc-su-new2", email: "nina@cuts.com", device }, "10.8.1.2");
    expect(r.status).toBe(201);
    const j = (await r.json()) as { slug: string; token: string };
    expect(j.slug).toBe("lc-su-new2");
    expect(j.token).toMatch(/^skm_/);
    // The owner is found by email alone afterwards.
    await root("/auth/code", { email: "nina@cuts.com" }, "10.8.1.3");
    await settle();
    expect(f.mails.at(-1)!.to).toBe("nina@cuts.com");
  });

  it("an admin invites a staff member: an invite email with a one-tap link that signs them in", async () => {
    const { b1 } = await setup("lc-invite");
    const ck = await loginAsOwner("lc-invite");
    const r = await app.fetch(new Request(`https://lc-invite.${ROOT}/api/users/${b1.id}/invite`, { method: "POST", headers: { cookie: ck } }), e, ctx);
    expect(r.status).toBe(200);
    await settle();
    const mail = f.mails.at(-1)!;
    expect(mail.to).toBe("sam@mail.com");
    expect(mail.subject).toContain("added you to");
    const code = /&c=(\d{6})/.exec(mail.text)![1]!;
    expect((await post("lc-invite", "/mobile/session", { email: "sam@mail.com", code, device }, "10.8.2.1")).status).toBe(200);
  });

  it("serves the app-link files for Android and iOS", async () => {
    const r = await app.fetch(new Request(`https://${ROOT}/.well-known/assetlinks.json`), { ...e, ANDROID_CERT_SHA256: "AA:BB, CC:DD" }, ctx);
    const j = (await r.json()) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(j[0]!.target).toEqual({ namespace: "android_app", package_name: "online.salonkit.app", sha256_cert_fingerprints: ["AA:BB", "CC:DD"] });
    const ios = (await (await app.fetch(new Request(`https://x.${ROOT}/.well-known/apple-app-site-association`), e, ctx)).json()) as { applinks: { details: { appIDs: string[] }[] } };
    expect(ios.applinks.details[0]!.appIDs).toEqual(["98843335NN.online.salonkit.app"]);
  });
});

async function loginAsOwner(slug: string): Promise<string> {
  const r = await post(slug, "/auth/login", { username: "boss@mail.com", password: "pass1234" }, `10.8.9.${Math.floor(Math.random() * 250)}`);
  expect(r.status).toBe(200);
  return r.headers.get("set-cookie")!.split(";")[0]!;
}

describe("forgot password: emailed code + a new password", () => {
  it("sets the new password, signs out other sessions, and the code works once", async () => {
    await setup("lc-reset");
    const code = await askCode("lc-reset", "sam@mail.com", "10.6.0.1");
    const short = await post("lc-reset", "/auth/password/reset", { email: "sam@mail.com", code, password: "12345" }, "10.6.0.2");
    expect(short.status).toBe(400);
    const r = await post("lc-reset", "/auth/password/reset", { email: "sam@mail.com", code, password: "newpass99" }, "10.6.0.3");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, slug: "lc-reset", username: "sam" });
    expect((await post("lc-reset", "/auth/login", { username: "sam", password: "newpass99" }, "10.6.0.4")).status).toBe(200);
    expect((await post("lc-reset", "/auth/login", { username: "sam", password: "pass1234" }, "10.6.0.5")).status).toBe(401);
    expect((await post("lc-reset", "/auth/password/reset", { email: "sam@mail.com", code, password: "another99" }, "10.6.0.6")).status).toBe(401);
  });

  it("a wrong code changes nothing", async () => {
    await setup("lc-reset2");
    const code = await askCode("lc-reset2", "sam@mail.com", "10.6.1.1");
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await post("lc-reset2", "/auth/password/reset", { email: "sam@mail.com", code: wrong, password: "newpass99" }, "10.6.1.2")).status).toBe(401);
    expect((await post("lc-reset2", "/auth/login", { username: "sam", password: "pass1234" }, "10.6.1.3")).status).toBe(200);
  });
});
