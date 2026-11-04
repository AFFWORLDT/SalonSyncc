import { describe, it, expect } from "vitest";
import {
  FEATURE_KEYS,
  PLAN_DEFAULTS,
  effectiveFeatures,
  roleFeatures,
  type FeatureKey,
} from "./index";

describe("features", () => {
  it("plan matrix matches spec", () => {
    expect(PLAN_DEFAULTS.free.features).toEqual([
      "core_sales",
      "expenses",
      "daily_sheet",
    ]);
    expect(PLAN_DEFAULTS.pro.features).toEqual([
      "core_sales",
      "expenses",
      "daily_sheet",
      "customers_crm",
      "ratings",
      "reports_advanced",
      "excel_export",
      "push",
      "announcements",
    ]);
    // Every feature except the override-only ones (mcp_api), which no plan can grant.
    expect(PLAN_DEFAULTS.pro_max.features).toEqual(FEATURE_KEYS.filter((k) => k !== "mcp_api"));
    expect([
      PLAN_DEFAULTS.free.priceMonthly,
      PLAN_DEFAULTS.pro.priceMonthly,
      PLAN_DEFAULTS.pro_max.priceMonthly,
    ]).toEqual([0, 200, 499]);
    expect([
      PLAN_DEFAULTS.free.limits.max_staff,
      PLAN_DEFAULTS.pro.limits.max_staff,
      PLAN_DEFAULTS.pro_max.limits.max_staff,
    ]).toEqual([2, 10, null]);
  });

  it("override on adds, override off removes", () => {
    expect(
      effectiveFeatures(["core_sales", "expenses"], [
        { feature_key: "ledger", enabled: 1 },
        { feature_key: "expenses", enabled: 0 },
      ])
    ).toEqual(["core_sales", "ledger"]);
  });

  it("RF5: unknown keys dropped, core_sales always on", () => {
    expect(
      effectiveFeatures([], [
        { feature_key: "old_thing", enabled: 1 },
        { feature_key: "core_sales", enabled: 0 },
      ])
    ).toEqual(["core_sales"]);
  });
});

describe("roleFeatures", () => {
  const all = ["core_sales", "expenses", "ledger"] as FeatureKey[];
  it("roleFeatures drops only for that role", () => {
    const rows = [{ role: "barber", feature_key: "expenses", enabled: 0 as const }];
    expect(roleFeatures(all, "barber", rows)).toEqual(["core_sales", "ledger"]);
    expect(roleFeatures(all, "admin", rows)).toEqual(all);
  });
  it("never adds", () => {
    expect(roleFeatures(["core_sales"], "barber", [{ role: "barber", feature_key: "ledger", enabled: 1 }])).toEqual(["core_sales"]);
  });
  it("keeps core_sales", () => {
    expect(roleFeatures(all, "barber", [{ role: "barber", feature_key: "core_sales", enabled: 0 }])).toContain("core_sales");
  });
});
