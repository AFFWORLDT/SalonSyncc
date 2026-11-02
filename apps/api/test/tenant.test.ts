import { describe, it, expect } from "vitest";
import {
  SLUG_RE,
  normalizeSlug,
  isValidSlug,
  slugFromHost,
} from "../src/core/tenant";

describe("tenant resolver", () => {
  const R = "salonstation.online";

  describe("slugFromHost", () => {
    it.each([
      ["beardsalon.salonstation.online", { kind: "tenant", slug: "beardsalon" }],
      ["BeardSalon.SalonStation.Online", { kind: "tenant", slug: "beardsalon" }],
      ["beardsalon.salonstation.online:443", { kind: "tenant", slug: "beardsalon" }],
      ["beardsalon.salonstation.online.", { kind: "tenant", slug: "beardsalon" }],
      ["admin.salonstation.online", { kind: "admin" }],
      ["salonstation.online", { kind: "none" }],
      ["www.salonstation.online", { kind: "none" }],
      ["www.beardsalon.salonstation.online", { kind: "none" }],
      ["evil-salonstation.online", { kind: "none" }],
      ["salonstation-app.affworld0.workers.dev", { kind: "none" }],
    ])("slugFromHost(%s, R, 'admin')", (h, want) => {
      expect(slugFromHost(h, R, "admin")).toEqual(want);
    });

    it("empty ROOT_DOMAIN means workers.dev mode", () => {
      expect(slugFromHost("a.b.c", "", "admin")).toEqual({ kind: "none" });
    });
  });

  describe("normalizeSlug", () => {
    it.each([
      ["Beard Salon", "beard-salon"],
      ["beard_salon", "beard-salon"],
      ["  FM ", "fm"],
    ])("normalize %s", (a, b) => {
      expect(normalizeSlug(a)).toBe(b);
    });
  });

  describe("isValidSlug", () => {
    it.each([
      ["ab", false],
      ["-ab", false],
      ["ab-", false],
      ["a".repeat(31), false],
      ["बार्बर", false],
      ["a.b", false],
    ])("invalid %s", (s, expected) => {
      expect(isValidSlug(s)).toBe(expected);
    });
  });
});
