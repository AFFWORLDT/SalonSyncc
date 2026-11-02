import { describe, it, expect } from "vitest";
import { tourSteps, visibleSteps, tourKey } from "@/lib/tour";

describe("product tour", () => {
  it("owners get the setup walkthrough: settings, services, staff, sale, sheet", () => {
    const s = tourSteps({ salonName: "Super Cuts", isAdmin: true });
    expect(s[0]!.popover!.title).toContain("Super Cuts");
    expect(s.map((x) => x.popover!.title)).toEqual(expect.arrayContaining(["1. Your salon details", "2. Services and prices", "3. Your team", "4. Ring up a sale"]));
  });
  it("skips steps whose element isn't on screen", () => {
    document.body.innerHTML = '<a data-tour="nav-settings" href="/settings">Settings</a>';
    const el = document.querySelector("a")!;
    Object.defineProperty(el, "getClientRects", { value: () => [{}] });
    const steps = visibleSteps(tourSteps({ salonName: "X", isAdmin: true }));
    expect(steps).toHaveLength(2); // welcome + settings
    expect(steps[1]!.element).toBe(el);
  });
  it("remembers per salon and person", () => expect(tourKey("super", 7)).toBe("ss_tour_done:super:7"));
});
