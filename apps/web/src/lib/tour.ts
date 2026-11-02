import type { DriveStep } from "driver.js";

/** Who the tour is for and where it can point. Steps whose element isn't on screen (phone layout, hidden feature) are skipped. */
export interface TourContext {
  salonName: string;
  isAdmin: boolean;
}

export const tourKey = (slug: string, userId: number) => `ss_tour_done:${slug}:${userId}`;

/** The first-login walkthrough: set up the salon (logo, address, VAT), services, staff, then ring up a bill. */
export function tourSteps(ctx: TourContext): DriveStep[] {
  const welcome: DriveStep = {
    popover: {
      title: `Welcome to ${ctx.salonName || "your salon"} 👋`,
      description: "Here's a 1-minute tour of where everything lives. You can replay it any time from My account.",
    },
  };
  if (!ctx.isAdmin)
    return [
      welcome,
      { element: '[data-tour="tab-"], [data-tour="new-sale"]', popover: { title: "Ring up a sale", description: "Tap here after each customer: pick the services and how they paid. The bill is ready to print or share." } },
      { element: '[data-tour="nav-history"], [data-tour="tab-history"]', popover: { title: "Your history", description: "Your sales and commission for the month." } },
    ];
  return [
    welcome,
    {
      element: '[data-tour="nav-settings"]',
      popover: {
        title: "1. Your salon details",
        description: "Upload your logo and add your salon name, address, phone and TRN. Switch on 5% VAT here so bills become tax invoices.",
      },
    },
    { element: '[data-tour="nav-services"]', popover: { title: "2. Services and prices", description: "Your price list is ready to edit. Change prices, add your own services, or hide what you don't offer." } },
    { element: '[data-tour="nav-barbers"]', popover: { title: "3. Your team", description: "Add your barbers with their commission %. Each gets their own login to ring up sales." } },
    { element: '[data-tour="new-sale"], [data-tour="tab-new-sale"]', popover: { title: "4. Ring up a sale", description: "Pick the barber and services, and the bill is ready. Commission and the daily sheet update by themselves." } },
    { element: '[data-tour="nav-sheet"], [data-tour="tab-sheet"]', popover: { title: "5. Daily sheet", description: "Every day's sales, expenses, commission and profit per barber, with Excel export." } },
    { element: '[data-tour="setup"]', popover: { title: "Your checklist", description: "Tick these off to get fully set up. It disappears when you're done." } },
  ];
}

/** Keeps only steps that can be shown now: popovers without an element, and elements that exist and are visible. */
export function visibleSteps(steps: DriveStep[], doc: Document = document): DriveStep[] {
  return steps.flatMap((s) => {
    if (!s.element) return [s];
    const el = typeof s.element === "string" ? [...doc.querySelectorAll<HTMLElement>(s.element)].find((e) => e.offsetParent !== null || e.getClientRects().length > 0) : null;
    return el ? [{ ...s, element: el }] : [];
  });
}
