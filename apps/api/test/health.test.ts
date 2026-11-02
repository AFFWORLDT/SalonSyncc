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
