import { PricingPlans } from "@/components/home/pricing";

/** The pricing section (home and /pricing/). */
export function Pricing({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  return <PricingPlans headingLevel={headingLevel} />;
}
