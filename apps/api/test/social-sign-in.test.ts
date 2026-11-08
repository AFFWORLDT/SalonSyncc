import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser } from "./helpers";
import { setFirebaseKeysForTest, verifyFirebaseIdToken } from "../src/lib/firebase-token";

const ROOT = "salonkit.online";
const e = { ...env, ROOT_DOMAIN: ROOT, FIREBASE_PROJECT_ID: "salonkit1" };
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const device = { id: "device-social-1", name: "Pixel", platform: "android", app_version: "1.0.0" };
let n = 0;
const post = (path: string, body: unknown, host = ROOT) =>
  app.fetch(
    new Request(`https://${host}/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": `10.7.${Math.floor(n / 250)}.${n++ % 250}` },
      body: JSON.stringify(body),
    }),
    e,
    ctx,
  );

let key: CryptoKeyPair;
let other: CryptoKeyPair;
const b64 = (b: ArrayBuffer | Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const now = () => Math.floor(Date.now() / 1000);

async function token(claims: Record<string, unknown> = {}, opts: { kid?: string; alg?: string; signer?: CryptoKey } = {}): Promise<string> {
  const header = b64(JSON.stringify({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1", typ: "JWT" }));
  const t = now();
  const body = b64(
    JSON.stringify({
      iss: "https://securetoken.google.com/salonkit1",
      aud: "salonkit1",
      sub: "uid-1",
      iat: t - 10,
      auth_time: t - 10,
      exp: t + 3600,
      email: "Sam@Gmail.com",
      email_verified: true,
      name: "Sam Barber",
      firebase: { sign_in_provider: "google.com" },
      ...claims,
    }),
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", opts.signer ?? key.privateKey, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64(sig)}`;
}

beforeAll(async () => {
  const alg = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
  key = (await crypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;
  other = (await crypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("jwk", key.publicKey)) as JsonWebKey;
  setFirebaseKeysForTest(async () => [{ ...pub, kid: "k1" }]);
});
afterAll(() => setFirebaseKeysForTest(null));

async function team(slug: string, email: string, active = true) {
  const org = await makeOrg({ slug });
  await makeUser(org.id, { username: "boss", role: "owner" });
  const b = await makeUser(org.id, { username: "sam", role: "barber" });
  await env.DB.prepare("UPDATE users SET email = NULL WHERE lower(email) = lower(?)").bind(email).run();
  await env.DB.prepare("UPDATE users SET email = ?, active = ? WHERE id = ?").bind(email.toLowerCase(), active ? 1 : 0, b.id).run();
  return { org, b };
}

describe("token checks", () => {
  const verify = async (t: string) => verifyFirebaseIdToken(t, "salonkit1", Date.now(), async () => [{ ...((await crypto.subtle.exportKey("jwk", key.publicKey)) as JsonWebKey), kid: "k1" }]);
  it("a good Google token gives the verified email (lower case), name and provider", async () => {
    expect(await verify(await token())).toEqual({ uid: "uid-1", email: "sam@gmail.com", name: "Sam Barber", provider: "google.com" });
  });
  it("Apple, with a relay email and no name", async () => {
    const t = await token({ email: "x1y2@privaterelay.appleid.com", name: undefined, firebase: { sign_in_provider: "apple.com" } });
    expect(await verify(t)).toMatchObject({ email: "x1y2@privaterelay.appleid.com", name: null, provider: "apple.com" });
  });
  it.each([
    ["unverified email", { email_verified: false }],
    ["no email", { email: undefined }],
    ["another project (aud)", { aud: "someone-else" }],
    ["another issuer", { iss: "https://securetoken.google.com/someone-else" }],
    ["expired", { exp: now() - 5 }],
    ["issued in the future", { iat: now() + 600 }],
    ["signed in long in the future", { auth_time: now() + 600 }],
    ["a password sign-in, not Google/Apple", { firebase: { sign_in_provider: "password" } }],
    ["no subject", { sub: "" }],
  ])("refuses: %s", async (_name, claims) => {
    await expect(verify(await token(claims))).rejects.toMatchObject({ status: 401 });
  });
  it("refuses a token signed by another key, an unknown kid, alg none, and junk", async () => {
    await expect(verify(await token({}, { signer: other.privateKey }))).rejects.toMatchObject({ status: 401 });
    await expect(verify(await token({}, { kid: "nope" }))).rejects.toMatchObject({ status: 401 });
    const t = await token();
    const [, body] = t.split(".");
    await expect(verify(`${b64(JSON.stringify({ alg: "none", kid: "k1" }))}.${body}.`)).rejects.toMatchObject({ status: 401 });
    await expect(verify("not-a-token")).rejects.toMatchObject({ status: 401 });
    await expect(verify(`${t}x`)).rejects.toMatchObject({ status: 401 });
  });
});

describe("POST /api/auth/social", () => {
  it("a person on a team is signed in to their salon (email any case)", async () => {
    await team("so-known", "sam@gmail.com");
    const r = await post("/auth/social", { id_token: await token(), device });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { token: string; slug: string };
    expect(j.slug).toBe("so-known");
    expect(j.token).toMatch(/^skm_/);
  });

  it("an unknown email is offered sign-up; signing up with the token makes a salon, once", async () => {
    const t = await token({ email: "new.owner@gmail.com", name: "Nina New" });
    const r = await post("/auth/social", { id_token: t, device });
    expect(await r.json()).toEqual({ new: true, email: "new.owner@gmail.com", name: "Nina New" });
    const su = await post("/public/signup", { id_token: t, salon_name: "Nina Cuts", slug: "so-nina", country: "AE", device, email: "typed@else.com", password: "ignored1" });
    expect(su.status).toBe(201);
    expect(await su.json()).toMatchObject({ slug: "so-nina", token: expect.stringMatching(/^skm_/) });
    const owner = await env.DB.prepare("SELECT u.email, u.name, u.role FROM users u JOIN orgs o ON o.id = u.org_id WHERE o.slug = 'so-nina'").first();
    expect(owner).toEqual({ email: "new.owner@gmail.com", name: "Nina New", role: "owner" });
    // The typed password was ignored: it doesn't sign in.
    expect((await post("/auth/login", { username: "new.owner@gmail.com", password: "ignored1" }, `so-nina.${ROOT}`)).status).toBe(401);
    // Now known: Google signs straight in; a second signup is refused.
    expect(await (await post("/auth/social", { id_token: t, device })).json()).toMatchObject({ slug: "so-nina" });
    expect((await post("/public/signup", { id_token: t, salon_name: "Again", slug: "so-nina-2", country: "AE", device })).status).toBe(409);
  });

  it("an inactive person is told their account is off, with the salon's name", async () => {
    await team("so-off", "off@gmail.com", false);
    const r = await post("/auth/social", { id_token: await token({ email: "off@gmail.com" }), device });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toContain("is turned off");
  });

  it("an unverified email, a bad token or no device is refused", async () => {
    expect((await post("/auth/social", { id_token: await token({ email_verified: false }), device })).status).toBe(401);
    expect((await post("/auth/social", { id_token: "junk", device })).status).toBe(401);
    expect((await post("/auth/social", { id_token: await token() })).status).toBe(400);
    expect((await post("/public/signup", { id_token: "junk", salon_name: "X Cuts", slug: "so-junk", country: "AE", device })).status).toBe(401);
  });
});

describe("website: POST /api/auth/social {web: true}", () => {
  const handoff = (slug: string, url: string) =>
    app.fetch(
      new Request(`https://${slug}.${ROOT}/api/auth/handoff`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: new URL(url).searchParams.get("handoff") }) }),
      e,
      ctx,
    );

  it("a known person gets a single-use sign-in link to their salon", async () => {
    await team("so-web", "web.sam@gmail.com");
    const r = await post("/auth/social", { id_token: await token({ email: "web.sam@gmail.com" }), web: true });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { slug: string; handoff_url: string };
    expect(j.slug).toBe("so-web");
    expect(j.handoff_url).toMatch(/^https:\/\/so-web\.salonkit\.online\/login\/\?handoff=[\w-]+$/);
    const h = await handoff("so-web", j.handoff_url);
    expect(h.status).toBe(200);
    expect(h.headers.get("set-cookie")).toBeTruthy();
    expect((await handoff("so-web", j.handoff_url)).status).toBe(401);
  });

  it("the link only works on that salon's own address", async () => {
    await team("so-web2", "web.two@gmail.com");
    await makeOrg({ slug: "so-web-other" });
    const j = (await (await post("/auth/social", { id_token: await token({ email: "web.two@gmail.com" }), web: true })).json()) as { handoff_url: string };
    expect((await handoff("so-web-other", j.handoff_url)).status).toBe(401);
  });

  it("an unknown email is offered sign-up; then signup gives a link, not a phone session", async () => {
    const t = await token({ email: "web.new@gmail.com", name: "Wen New" });
    expect(await (await post("/auth/social", { id_token: t, web: true })).json()).toEqual({ new: true, email: "web.new@gmail.com", name: "Wen New" });
    const su = await post("/public/signup", { id_token: t, salon_name: "Wen Cuts", slug: "so-wen", country: "AE" });
    expect(su.status).toBe(201);
    expect(await su.json()).toMatchObject({ slug: "so-wen", handoff_url: expect.stringContaining("so-wen.salonkit.online/login/?handoff=") });
  });

  it("refuses another site's page", async () => {
    const r = await app.fetch(
      new Request(`https://${ROOT}/api/auth/social`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ id_token: await token(), web: true }) }),
      e,
      ctx,
    );
    expect(r.status).toBe(403);
  });
});

describe("GET /api/public/auth-config", () => {
  const get = (env2: Record<string, unknown>) => app.fetch(new Request(`https://${ROOT}/api/public/auth-config`), { ...e, ...env2 }, ctx);
  it("hides Google until the web key is set", async () => {
    expect(await (await get({ FIREBASE_WEB_API_KEY: undefined })).json()).toEqual({ google: false });
  });
  it("gives the browser its Firebase settings", async () => {
    expect(await (await get({ FIREBASE_WEB_API_KEY: "AIza-test" })).json()).toEqual({
      google: true,
      firebase: { apiKey: "AIza-test", projectId: "salonkit1", authDomain: "salonkit1.firebaseapp.com" },
    });
  });
});
