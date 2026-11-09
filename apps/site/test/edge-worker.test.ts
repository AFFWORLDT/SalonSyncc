import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS Worker module
import worker, { canonicalRedirect } from "../edge/worker.js";

describe("site edge worker", () => {
  it("sends www and http to https://salonkit.online, keeping the path and query", () => {
    expect(canonicalRedirect(new URL("https://www.salonkit.online/pricing/?a=1"))).toBe("https://salonkit.online/pricing/?a=1");
    expect(canonicalRedirect(new URL("http://salonkit.online/blog/"))).toBe("https://salonkit.online/blog/");
    expect(canonicalRedirect(new URL("http://www.salonkit.online/"))).toBe("https://salonkit.online/");
  });
  it("leaves the canonical address and other hosts alone", () => {
    expect(canonicalRedirect(new URL("https://salonkit.online/"))).toBeNull();
    expect(canonicalRedirect(new URL("https://super.salonkit.online/"))).toBeNull();
  });
  it("redirects with 301 and turns the assets' temporary redirects permanent", async () => {
    const assets = { fetch: async () => new Response(null, { status: 307, headers: { location: "/pricing/" } }) };
    const www = await worker.fetch(new Request("https://www.salonkit.online/x/"), { ASSETS: assets });
    expect(www.status).toBe(301);
    expect(www.headers.get("location")).toBe("https://salonkit.online/x/");
    const slash = await worker.fetch(new Request("https://salonkit.online/pricing"), { ASSETS: assets });
    expect(slash.status).toBe(308);
    expect(slash.headers.get("location")).toBe("https://salonkit.online/pricing/");
  });
  it("passes pages through untouched", async () => {
    const assets = { fetch: async () => new Response("ok", { status: 200 }) };
    const r = await worker.fetch(new Request("https://salonkit.online/"), { ASSETS: assets });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });
});
