import { describe, it, expect } from "vitest";
import { PLAN_DEFAULTS, FEATURE_KEYS, TRIAL_EXCLUDED } from "@ss/features";
import { navFor } from "@/components/admin/nav";
import { meFixture } from "./fixtures";

const hrefs = (m: ReturnType<typeof meFixture>) => navFor(m).flatMap((g) => g.items.map((i) => i.href));

describe("navigation", () => {
  it("the salon owner gets the admin menu", () => {
    const h = hrefs(meFixture({ role: "owner", features: [...FEATURE_KEYS] }));
    expect(h).toEqual(expect.arrayContaining(["/", "/sales", "/barbers", "/settings", "/ledger"]));
    expect(h).not.toContain("/history");
  });
  it("a barber gets the barber menu, never ratings or admin pages", () => {
    const h = hrefs(meFixture({ role: "barber", features: [...FEATURE_KEYS] }));
    expect(h).toEqual(["/", "/bookings", "/history", "/bills", "/account"]);
    // Without online bookings (the usual case) the barber menu has no Bookings entry.
    expect(hrefs(meFixture({ role: "barber", features: FEATURE_KEYS.filter((f) => f !== "online_bookings") }))).toEqual(["/", "/history", "/bills", "/account"]);
  });
  it("a free salon has no ledger, customers, ratings, audit or announcements", () => {
    const h = hrefs(meFixture({ role: "owner", features: PLAN_DEFAULTS.free.features }));
    for (const p of ["/ledger", "/customers", "/ratings", "/audit", "/announcements", "/monthly"]) expect(h).not.toContain(p);
    expect(h).toEqual(expect.arrayContaining(["/expenses", "/sheet"]));
  });
  it("a trial salon has everything in the menu", () => {
    const trial = FEATURE_KEYS.filter((f) => !TRIAL_EXCLUDED.includes(f));
    const h = hrefs(meFixture({ role: "admin", features: trial }));
    expect(h).toEqual(expect.arrayContaining(["/ledger", "/customers", "/ratings", "/audit", "/announcements", "/monthly"]));
  });
});
