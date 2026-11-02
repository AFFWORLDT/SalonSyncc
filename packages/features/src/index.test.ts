import { describe, it, expect } from "vitest";
import {
  FEATURE_KEYS,
  PLAN_DEFAULTS,
  effectiveFeatures,
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
    expect(PLAN_DEFAULTS.pro_max.features).toEqual([...FEATURE_KEYS]);
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
