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
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

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
    features: [...FEATURE_KEYS],
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
    if (isFeatureKey(feature)) {
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

export function isFeatureKey(s: string): s is FeatureKey {
  return FEATURE_KEYS.includes(s as FeatureKey);
}
