import { PLAN_DEFAULTS, type FeatureKey, type PlanId } from "@ss/features";

/** What each feature is called on screen (Upgrade card, plan page). */
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
};

const ORDER: PlanId[] = ["free", "pro", "pro_max"];

/** The cheapest standard plan that includes the feature (catalog defaults; sales can agree other deals). */
export function cheapestPlanWith(f: FeatureKey): { id: PlanId; name: string } | null {
  const id = ORDER.find((p) => PLAN_DEFAULTS[p].features.includes(f));
  return id ? { id, name: PLAN_DEFAULTS[id].name } : null;
}

export function planName(id: string): string {
  return (PLAN_DEFAULTS as Record<string, { name: string }>)[id]?.name ?? id;
}
