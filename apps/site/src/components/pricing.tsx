import Link from "next/link";
import { CheckCircle2, Crown, Lock, Scissors, Users, type LucideIcon } from "lucide-react";
import { FEATURE_KEYS, FEATURE_LABELS, PLAN_DEFAULTS, type FeatureKey, type PlanId } from "@ss/features";
import * as PricingCard from "@/components/ui/pricing-card";
import { cn } from "@/lib/utils";

const ORDER: PlanId[] = ["free", "pro", "pro_max"];
const BLURB: Record<PlanId, string> = {
  free: "For a small shop getting started.",
  pro: "For a busy salon with a team.",
  pro_max: "Everything, including WhatsApp.",
};
const ICON: Record<PlanId, LucideIcon> = { free: Scissors, pro: Users, pro_max: Crown };
const BADGE: Record<PlanId, string> = { free: "To start", pro: "Most salons", pro_max: "Everything" };
/** How many of the next plan's extras a card teases under "Upgrade to get". */
const TEASE = 3;

const featuresOf = (id: PlanId): FeatureKey[] => FEATURE_KEYS.filter((f) => PLAN_DEFAULTS[id].features.includes(f));

/** The three standard plans, straight from the plan catalogue. Each card lists only what it adds to the plan before it. */
export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-24 sm:px-12">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Simple pricing</h2>
        <p className="mt-4 text-lg text-muted-foreground">Every salon starts with 7 days of Pro Max, free. Then pick the plan that fits.</p>
        <div className="mt-12 grid items-start gap-5 lg:grid-cols-3">
          {ORDER.map((id, i) => {
            const p = PLAN_DEFAULTS[id];
            const prev = ORDER[i - 1];
            const next = ORDER[i + 1];
            const featured = id === "pro";
            const own = featuresOf(id).filter((f) => !prev || !PLAN_DEFAULTS[prev].features.includes(f));
            const locked = next ? featuresOf(next).filter((f) => !p.features.includes(f)).slice(0, TEASE) : [];
            const Icon = ICON[id];
            return (
              <PricingCard.Card key={id} data-testid={`plan-${id}`} className={cn(featured && "border-2! border-primary/60! shadow-primary/15 lg:-translate-y-2")}>
                <PricingCard.Header>
                  <PricingCard.Plan>
                    <PricingCard.PlanName>
                      <span className={cn("grid size-8 place-items-center rounded-full", featured ? "bg-primary text-primary-foreground" : "bg-background/80 text-primary")}>
                        <Icon aria-hidden />
                      </span>
                      {p.name}
                    </PricingCard.PlanName>
                    <PricingCard.Badge className={cn(featured && "border-primary bg-primary text-primary-foreground")}>{BADGE[id]}</PricingCard.Badge>
                  </PricingCard.Plan>
                  <PricingCard.Price>
                    <PricingCard.MainPrice>{p.priceMonthly ? `${p.currency} ${p.priceMonthly}` : "Free"}</PricingCard.MainPrice>
                    {p.priceMonthly ? <PricingCard.Period>/ month</PricingCard.Period> : <PricingCard.Period>forever</PricingCard.Period>}
                  </PricingCard.Price>
                  <PricingCard.Description>{BLURB[id]}</PricingCard.Description>
                  <PricingCard.Description className="mt-1">
                    Staff: {p.limits.max_staff === null ? "unlimited" : `up to ${p.limits.max_staff}`}
                  </PricingCard.Description>
                  <Link
                    href="/signup/"
                    className={cn(
                      "mt-5 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold transition active:scale-[0.98]",
                      featured
                        ? "bg-gradient-to-b from-primary to-[#17604f] text-primary-foreground shadow-[0_10px_25px_rgba(31,122,106,0.3)] hover:brightness-110"
                        : "border border-foreground/15 bg-background/70 hover:bg-background"
                    )}
                  >
                    Start free trial
                  </Link>
                </PricingCard.Header>
                <PricingCard.Body>
                  {prev && <p className="text-sm font-medium">Everything in {PLAN_DEFAULTS[prev].name}, plus:</p>}
                  <PricingCard.List>
                    {own.map((f) => (
                      <PricingCard.ListItem key={f}>
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {FEATURE_LABELS[f]}
                      </PricingCard.ListItem>
                    ))}
                  </PricingCard.List>
                  {locked.length > 0 && (
                    <>
                      <PricingCard.Separator>{`Upgrade to ${PLAN_DEFAULTS[next!].name} for`}</PricingCard.Separator>
                      <PricingCard.List>
                        {locked.map((f) => (
                          <PricingCard.ListItem key={f} className="text-muted-foreground">
                            <Lock className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden />
                            {FEATURE_LABELS[f]}
                          </PricingCard.ListItem>
                        ))}
                      </PricingCard.List>
                    </>
                  )}
                </PricingCard.Body>
              </PricingCard.Card>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Need something else, or more than one branch? Talk to us and we&apos;ll set up a plan for you.</p>
      </div>
    </section>
  );
}
