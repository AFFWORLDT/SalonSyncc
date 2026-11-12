import { env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import app from "../src/index";
import { makeOrg, makeUser } from "./helpers";
import { fakeServices } from "./fakes";
import { setServicesForTest } from "../src/core/services";

const ROOT = "salonkit.online";
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const on = { ...env, ROOT_DOMAIN: ROOT, TURNSTILE_SECRET: "s" };
const post = (slug: string, path: string, body: Record<string, unknown>, opts: { origin?: boolean; ip?: string; e?: typeof on } = {}) =>
  app.fetch(
    new Request(`https://${slug}.${ROOT}/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": opts.ip ?? "10.77.0.1", ...(opts.origin ? { Origin: `https://${slug}.${ROOT}` } : {}) },
      body: JSON.stringify(body),
    }),
    opts.e ?? on,
    ctx,
  );

afterEach(() => setServicesForTest(null));

describe("Turnstile on web sign-in", () => {
  it("password sign-in needs a valid check when Turnstile is on", async () => {
    setServicesForTest(() => fakeServices({ turnstileOk: (t) => t === "good" }).services);
    await makeOrg({ slug: "bot-login" });
    await makeUser((await env.DB.prepare("SELECT id FROM orgs WHERE slug = 'bot-login'").first<{ id: string }>())!.id, { username: "own" });
    const creds = { org: "bot-login", username: "own", password: "pass1234" };
    const none = await post("bot-login", "/auth/login", creds, { origin: true });
    expect(none.status).toBe(400);
    expect(await none.json()).toMatchObject({ code: "turnstile" });
    expect((await post("bot-login", "/auth/login", { ...creds, turnstile: "bad" }, { origin: true })).status).toBe(400);
    expect((await post("bot-login", "/auth/login", { ...creds, turnstile: "good" }, { origin: true })).status).toBe(200);
    // Off: no check.
    expect((await post("bot-login", "/auth/login", creds, { origin: true, e: { ...on, TURNSTILE_SECRET: undefined as unknown as string } })).status).toBe(200);
  });

  it("email code: web pages must pass the check, the phone app (no Origin) is not asked", async () => {
    setServicesForTest(() => fakeServices({ turnstileOk: (t) => t === "good" }).services);
    await makeOrg({ slug: "bot-code" });
    expect((await post("bot-code", "/auth/code", { email: "a@b.com" }, { origin: true, ip: "10.77.1.1" })).status).toBe(400);
    expect((await post("bot-code", "/auth/code", { email: "a@b.com", turnstile: "good" }, { origin: true, ip: "10.77.1.2" })).status).toBe(200);
    expect((await post("bot-code", "/auth/code", { email: "a@b.com" }, { ip: "10.77.1.3" })).status).toBe(200);
  });
});
