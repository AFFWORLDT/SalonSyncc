import { describe, it, expect } from "vitest";
import {
  SLUG_RE,
  normalizeSlug,
  isValidSlug,
  slugFromHost,
} from "../src/core/tenant";

describe("tenant resolver", () => {
  const R = "salonkit.online";

  describe("slugFromHost", () => {
    it.each([
      ["beardsalon.salonkit.online", { kind: "tenant", slug: "beardsalon" }],
      ["BeardSalon.SalonKit.Online", { kind: "tenant", slug: "beardsalon" }],
      ["beardsalon.salonkit.online:443", { kind: "tenant", slug: "beardsalon" }],
      ["beardsalon.salonkit.online.", { kind: "tenant", slug: "beardsalon" }],
      ["admin.salonkit.online", { kind: "admin" }],
      ["salonkit.online", { kind: "none" }],
      ["www.salonkit.online", { kind: "none" }],
      ["www.beardsalon.salonkit.online", { kind: "none" }],
      ["evil-salonkit.online", { kind: "none" }],
      ["salonkit-app.affworld0.workers.dev", { kind: "none" }],
    ])("slugFromHost(%s, R, 'admin')", (h, want) => {
      expect(slugFromHost(h, R, "admin")).toEqual(want);
    });

    it("empty ROOT_DOMAIN means workers.dev mode", () => {
      expect(slugFromHost("a.b.c", "", "admin")).toEqual({ kind: "none" });
    });

    it("empty label with empty adminHost returns none (I1 fix)", () => {
      expect(slugFromHost(".salonkit.online", R, "")).toEqual({
        kind: "none",
      });
    });

    it("empty label with non-empty adminHost returns none (I1 fix)", () => {
      expect(slugFromHost(".salonkit.online", R, "admin")).toEqual({
        kind: "none",
      });
    });

    it("config normalization: uppercase rootDomain and adminHost (M1)", () => {
      expect(
        slugFromHost(
          "admin.salonkit.online",
          "SalonKit.Online.",
          "Admin"
        )
      ).toEqual({ kind: "admin" });
    });

    it("config normalization: uppercase rootDomain (M1)", () => {
      expect(
        slugFromHost("beardsalon.salonkit.online", "SalonKit.Online", "admin")
      ).toEqual({ kind: "tenant", slug: "beardsalon" });
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
