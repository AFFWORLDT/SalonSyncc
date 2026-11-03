import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("salons moved to their own app", () => {
  it("fmsalon.salonkit.online sends every path to FM's own app", async () => {
    for (const p of ["/", "/account/?x=1", "/api/me"]) {
      const res = await SELF.fetch(`https://fmsalon.salonkit.online${p}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(`https://fm-salon.affworld0.workers.dev${p}`);
    }
  });
  it("other salons are not redirected", async () => {
    const res = await SELF.fetch("https://demo.salonkit.online/api/me", { redirect: "manual" });
    expect(res.status).not.toBe(302);
  });
});
