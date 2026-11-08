import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RangePicker, RankList, dayLabel, total, PlatformBadge } from "@/components/platform/insights-ui";
import { NAV_GROUPS } from "@/components/platform/shell";

describe("portal insights UI", () => {
  it("day labels are UTC month + day", () => {
    expect(dayLabel("2026-11-09")).toBe("Nov 9");
    expect(total([{ n: 2 }, { n: 3 }])).toBe(5);
  });

  it("range picker marks the chosen period and reports a change", () => {
    let picked = 0;
    render(<RangePicker value={30} onChange={(r) => (picked = r)} />);
    expect(screen.getByRole("radio", { name: "30 days" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "90 days" }));
    expect(picked).toBe(90);
  });

  it("ranked list prints every value (the bar is never the only reading) and says when empty", () => {
    const { rerender } = render(<RankList title="Platforms" rows={[{ key: "web", label: "Web", value: 1234 }, { key: "ios", label: "iOS", value: 5, sub: "2 failed" }]} />);
    expect(screen.getByText("1,234")).toBeTruthy();
    expect(screen.getByText("2 failed")).toBeTruthy();
    rerender(<RankList title="Platforms" rows={[]} empty="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("platform badge names the platform and the app version (not for web)", () => {
    render(<PlatformBadge platform="ios" version="1.0.4" />);
    expect(screen.getByText("iOS")).toBeTruthy();
    expect(screen.getByText("1.0.4")).toBeTruthy();
  });

  it("the sidebar has the deHertz-style groups and every page once", () => {
    expect(NAV_GROUPS.map((g) => g.title)).toEqual(["Overview", "Salons", "Activity", "Commerce", "Engagement", "Settings"]);
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(expect.arrayContaining(["/platform/usage/", "/platform/people/", "/platform/notifications/", "/platform/settings/"]));
  });
});
