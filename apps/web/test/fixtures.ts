import type { MeResponse } from "@ss/contract";

/** A /api/me answer for tests. Settings beyond the formatting ones are filled loosely (cast). */
export function meFixture(o: {
  role?: "owner" | "admin" | "barber";
  features?: string[];
  status?: string;
  currency?: string;
  minor?: number;
  timezone?: string;
  dayStart?: number;
  maxStaff?: number | null;
  waReady?: boolean;
  trialEndsAt?: number | null;
  graceEndsAt?: number | null;
  today?: string;
  slug?: string;
} = {}): MeResponse {
  const status = o.status ?? "active";
  return {
    user: { id: 1, name: "Sam", username: "sam", role: o.role ?? "owner", commission_pct: null, avatar_url: null,
    banner_url: null, can_add_expense: false },
    org: { id: "org_1", slug: o.slug ?? "alpha", name: "Alpha Cuts", status, planId: "pro" },
    settings: {
      display_name: "Alpha Cuts",
      currency: o.currency ?? "AED",
      currency_minor: o.minor ?? 100,
      locale: "en-GB",
      timezone: o.timezone ?? "Asia/Dubai",
      day_start_hour: o.dayStart ?? 4,
      phone_country: "971",
      vat_rate: 5,
      vat_enabled: true,
      thank_you_text: "Thanks {name}! Your bill: {link}",
      quick_amounts: [],
      logo_url: null,
      brand_color: null,
      wa_ready: o.waReady ?? false,
    } as unknown as MeResponse["settings"],
    features: o.features ?? ["core_sales"],
    limits: { max_staff: o.maxStaff === undefined ? null : o.maxStaff },
    subscription: { status, planId: "pro", trialEndsAt: o.trialEndsAt ?? null, graceEndsAt: o.graceEndsAt ?? null },
    brand: { name: "SalonKit" },
    today: o.today ?? "2026-11-02",
  };
}
