import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { PUBLIC_LIMITS, minuteWindow } from "../src/lib/limits";
import { makeOrg } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const ROOT = "salonstation.online";
const get = (url: string, root = "", headers: Record<string, string> = {}) =>
  app.fetch(new Request(url, { headers }), { ...env, ROOT_DOMAIN: root }, ctx);
const org = async (url: string, root = "") => ((await (await get(url, root)).json()) as any).org;

describe("resolvePublicOrg", () => {
  it("resolves the host tenant slug", async () => {
    await makeOrg({ slug: "pub-host" });
    expect(await org(`https://pub-host.${ROOT}/api/public/_probe`, ROOT)).toBe("pub-host");
  });
  it("uses ?org= only when ROOT_DOMAIN is empty", async () => {
    await makeOrg({ slug: "pub-qs" });
    expect(await org("https://x.test/api/public/_probe?org=pub-qs")).toBe("pub-qs");
    expect(await org(`https://www.${ROOT}/api/public/_probe?org=pub-qs`, ROOT)).toBeNull();
    // host tenant wins over ?org=
    await makeOrg({ slug: "pub-other" });
    expect(await org(`https://pub-other.${ROOT}/api/public/_probe?org=pub-qs`, ROOT)).toBe("pub-other");
  });
  it("null for unknown, deactivated and deleted orgs", async () => {
    await makeOrg({ slug: "pub-off", status: "deactivated" });
    await makeOrg({ slug: "pub-del", status: "deleted" });
    expect(await org("https://x.test/api/public/_probe?org=nope-nope")).toBeNull();
    expect(await org("https://x.test/api/public/_probe?org=pub-off")).toBeNull();
    expect(await org("https://x.test/api/public/_probe?org=pub-del")).toBeNull();
    expect(await org("https://x.test/api/public/_probe")).toBeNull();
  });
});

describe("publicRateLimit", () => {
  it("429 with Retry-After after PUBLIC_LIMITS.pub hits per minute per IP", async () => {
    const h = { "CF-Connecting-IP": "9.9.9.9" };
    for (let i = 0; i < PUBLIC_LIMITS.pub; i++) {
      expect((await get("https://x.test/api/public/_probe", "", h)).status, `hit ${i}`).toBe(200);
    }
    const r = await get("https://x.test/api/public/_probe", "", h);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "Too many requests" });
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    // another IP is unaffected
    expect((await get("https://x.test/api/public/_probe", "", { "CF-Connecting-IP": "9.9.9.10" })).status).toBe(200);
  });
  it("pdf bucket has its own lower limit", async () => {
    const h = { "CF-Connecting-IP": "8.8.8.8" };
    for (let i = 0; i < PUBLIC_LIMITS.pdf; i++) expect((await get("https://x.test/api/public/_probe/pdf", "", h)).status).toBe(200);
    expect((await get("https://x.test/api/public/_probe/pdf", "", h)).status).toBe(429);
    expect((await get("https://x.test/api/public/_probe", "", h)).status).toBe(200);
  });
  it("limits.ts semantics", () => {
    expect(PUBLIC_LIMITS).toEqual({ pub: 60, pdf: 10 });
    expect(minuteWindow(59_999)).toBe(0);
    expect(minuteWindow(60_000)).toBe(1);
  });
});
