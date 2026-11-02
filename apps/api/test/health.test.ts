import { SELF } from "cloudflare:test";
import { it, expect } from "vitest";

it("health answers with brand", async () => {
  const r = await SELF.fetch("https://x.test/api/health");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, brand: "SalonStation" });
});

it("unknown api route is JSON 404", async () => {
  const r = await SELF.fetch("https://x.test/api/nope");
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ error: "Not found" });
});

it("api answers carry security headers", async () => {
  for (const p of ["/api/health", "/api/nope"]) {
    const r = await SELF.fetch(`https://x.test${p}`);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("referrer-policy")).toBe("same-origin");
  }
});
