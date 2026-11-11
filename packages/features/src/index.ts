export const FEATURE_KEYS = [
  "core_sales",
  "expenses",
  "daily_sheet",
  "customers_crm",
  "ratings",
  "reports_advanced",
  "excel_export",
  "push",
  "announcements",
  "ledger",
  "audit_log",
  "whatsapp",
  "whatsapp_campaigns",
  "public_services_api",
  "mcp_api",
  "online_bookings",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Features no plan can grant: only a super-admin per-salon override (org_feature_overrides, enabled = 1) turns them on.
 * effectiveFeatures drops them from plan features, so a plan row (or the trial plan) that lists one changes nothing.
 */
export const OVERRIDE_ONLY: readonly FeatureKey[] = Object.freeze(["mcp_api", "online_bookings"] as FeatureKey[]);

export type PlanId = "free" | "pro" | "pro_max";

export const PLAN_DEFAULTS: Record<
  PlanId,
  {
    name: string;
    priceMonthly: number;
    currency: "AED";
    features: FeatureKey[];
    limits: { max_staff: number | null };
  }
> = {
  free: {
    name: "Free",
    priceMonthly: 0,
    currency: "AED",
    features: ["core_sales", "expenses", "daily_sheet"],
    limits: { max_staff: 2 },
  },
  pro: {
    name: "Pro",
    priceMonthly: 200,
    currency: "AED",
    features: [
      "core_sales",
      "expenses",
      "daily_sheet",
      "customers_crm",
      "ratings",
      "reports_advanced",
      "excel_export",
      "push",
      "announcements",
    ],
    limits: { max_staff: 10 },
  },
  pro_max: {
    name: "Pro Max",
    priceMonthly: 499,
    currency: "AED",
    features: FEATURE_KEYS.filter((k) => !OVERRIDE_ONLY.includes(k)),
    limits: { max_staff: null },
  },
};

export const ALWAYS_ON: readonly FeatureKey[] = Object.freeze(["core_sales"] as FeatureKey[]);

export const TRIAL_PLAN: PlanId = "pro_max";

export const TRIAL_EXCLUDED: readonly FeatureKey[] = Object.freeze(["whatsapp", "whatsapp_campaigns"] as FeatureKey[]);

export function effectiveFeatures(
  planFeatures: string[],
  overrides: { feature_key: string; enabled: 0 | 1 }[]
): FeatureKey[] {
  // Start with ALWAYS_ON features
  const enabledFeatures = new Set<FeatureKey>(ALWAYS_ON);

  // Add plan features that are valid FeatureKeys
  for (const feature of planFeatures) {
    if (isFeatureKey(feature) && !OVERRIDE_ONLY.includes(feature)) {
      enabledFeatures.add(feature);
    }
  }

  // Apply overrides
  for (const override of overrides) {
    if (isFeatureKey(override.feature_key)) {
      if (override.enabled === 1) {
        enabledFeatures.add(override.feature_key);
      } else if (override.enabled === 0) {
        enabledFeatures.delete(override.feature_key);
      }
    }
  }

  // Always keep core_sales even if it's explicitly disabled in overrides
  enabledFeatures.add("core_sales");

  // Return result in FEATURE_KEYS order
  return FEATURE_KEYS.filter((key) => enabledFeatures.has(key));
}

/**
 * A user's features: the salon's features minus any the super admin switched off for the user's role (owner and admin
 * are "admin"). A role row never adds a feature the salon doesn't have, and core_sales is never removed.
 */
export function roleFeatures(
  features: readonly FeatureKey[],
  role: "barber" | "admin",
  rows: { role: string; feature_key: string; enabled: 0 | 1 }[]
): FeatureKey[] {
  const off = new Set(rows.filter((r) => r.role === role && r.enabled === 0).map((r) => r.feature_key));
  return features.filter((k) => k === "core_sales" || !off.has(k));
}

export function isFeatureKey(s: string): s is FeatureKey {
  return FEATURE_KEYS.includes(s as FeatureKey);
}

/** What each feature is called on screen (pricing, Upgrade card, plan page). */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  core_sales: "Sales and bills",
  expenses: "Expenses",
  daily_sheet: "Daily sheet",
  customers_crm: "Customers",
  ratings: "Ratings and reviews",
  reports_advanced: "Monthly and yearly reports",
  excel_export: "Excel export",
  push: "Push notifications",
  announcements: "Team announcements",
  ledger: "Ledger and payouts",
  audit_log: "Audit log",
  whatsapp: "WhatsApp bills and reminders",
  whatsapp_campaigns: "WhatsApp campaigns",
  public_services_api: "Price list for your website",
  mcp_api: "AI connect (Claude and MCP)",
  online_bookings: "Online bookings from your website",
};
