import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PLAN_DEFAULTS } from "@ss/features";
import { Pricing } from "@/components/pricing";
import { suggestSlug, SLUG_RE, normalizeSlug } from "@/lib/slug";

vi.mock("@paper-design/shaders-react", () => ({ MeshGradient: () => null, PulsingBorder: () => null }));

describe("pricing", () => {
  it("shows the three plans with catalogue prices", () => {
    render(<Pricing />);
    for (const id of ["free", "pro", "pro_max"] as const) expect(screen.getByTestId(`plan-${id}`)).toBeTruthy();
    expect(screen.getByText(`${PLAN_DEFAULTS.pro.currency} ${PLAN_DEFAULTS.pro.priceMonthly}`)).toBeTruthy();
    expect(screen.getByText(`${PLAN_DEFAULTS.pro_max.currency} ${PLAN_DEFAULTS.pro_max.priceMonthly}`)).toBeTruthy();
    expect(screen.getAllByText("Start free trial").length).toBe(3);
  });
});

describe("salon ID", () => {
  it("suggests an ID from the salon's name", () => {
    expect(suggestSlug("Beard & Co. Salon")).toBe("beard-co-salon");
    expect(suggestSlug("  Café Noir!! ")).toBe("cafe-noir");
    expect(suggestSlug("A".repeat(40))).toHaveLength(30);
  });
  it("validates like the API", () => {
    expect(SLUG_RE.test(normalizeSlug("Super Beard"))).toBe(true);
    expect(SLUG_RE.test("-ab")).toBe(false);
    expect(SLUG_RE.test("ab")).toBe(false);
  });
});
