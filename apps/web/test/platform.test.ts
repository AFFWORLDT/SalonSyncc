import { describe, expect, it } from "vitest";
import { actionLabel, periodEnd, relDays, signupSeries, statusClass } from "@/lib/platform";

describe("platform helpers", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  it("relDays", () => {
    expect(relDays(null, now)).toBe("—");
    expect(relDays(now, now)).toBe("today");
    expect(relDays(now + 86_400_000, now)).toBe("in 1 day");
    expect(relDays(now - 3 * 86_400_000, now)).toBe("3 days ago");
  });
  it("periodEnd picks the date that matters", () => {
    expect(periodEnd({ status: "trial", trial_ends_at: 5, grace_ends_at: 9 })).toBe(5);
    expect(periodEnd({ status: "grace", trial_ends_at: 5, grace_ends_at: 9 })).toBe(9);
    expect(periodEnd({ status: "active", trial_ends_at: 5, grace_ends_at: 9 })).toBeNull();
  });
  it("signupSeries is zero-filled, oldest first", () => {
    const s = signupSeries({ "2026-11-03": 2, "2026-11-01": 1 }, 3, now);
    expect(s).toEqual([
      { day: "2026-11-01", count: 1 },
      { day: "2026-11-02", count: 0 },
      { day: "2026-11-03", count: 2 },
    ]);
  });
  it("labels and colours", () => {
    expect(actionLabel("support_login")).toBe("signed in as the salon");
    expect(actionLabel("weird_thing")).toBe("weird thing");
    expect(statusClass("expired")).toContain("destructive");
  });
});
