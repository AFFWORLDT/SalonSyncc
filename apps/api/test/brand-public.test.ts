import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { makeOrg } from "./helpers";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const ROOT = "salonkit.online";
const brand = async (url: string) => (await app.fetch(new Request(url), { ...env, ROOT_DOMAIN: ROOT }, ctx)).json() as Promise<{ name: string | null; logo_url: string | null }>;

describe("GET /api/public/brand (salon sign-in page)", () => {
  it("gives the salon's display name and current logo", async () => {
    const o = await makeOrg({ slug: "brand-logo" });
    await env.DB.prepare("UPDATE org_settings SET display_name = 'Beard Bros' WHERE org_id = ?").bind(o.id).run();
    await env.DB.prepare("INSERT INTO org_assets(org_id,kind,bytes,type,v) VALUES(?,'logo',?,'image/png',3)").bind(o.id, new Uint8Array([1])).run();
    expect(await brand(`https://brand-logo.${ROOT}/api/public/brand`)).toEqual({ name: "Beard Bros", logo_url: "/api/public/logo/3?org=brand-logo" });
  });
  it("no logo: name only; unknown or deactivated salon: nothing", async () => {
    await makeOrg({ slug: "brand-plain" });
    await makeOrg({ slug: "brand-off", status: "deactivated" });
    expect(await brand(`https://brand-plain.${ROOT}/api/public/brand`)).toEqual({ name: "brand-plain", logo_url: null });
    expect(await brand(`https://brand-off.${ROOT}/api/public/brand`)).toEqual({ name: null, logo_url: null });
    expect(await brand(`https://nope-nope.${ROOT}/api/public/brand`)).toEqual({ name: null, logo_url: null });
  });
});
