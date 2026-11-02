import Link from "next/link";
import { Check } from "lucide-react";
import { FEATURE_KEYS, FEATURE_LABELS, PLAN_DEFAULTS, type PlanId } from "@ss/features";

const ORDER: PlanId[] = ["free", "pro", "pro_max"];
const BLURB: Record<PlanId, string> = {
  free: "For a small shop getting started.",
  pro: "For a busy salon with a team.",
  pro_max: "Everything, including WhatsApp.",
};

/** The three standard plans, straight from the plan catalogue. */
export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-24 sm:px-12">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Simple pricing</h2>
        <p className="mt-4 text-lg text-muted-foreground">Every salon starts with 7 days of Pro Max, free. Then pick the plan that fits.</p>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {ORDER.map((id) => {
            const p = PLAN_DEFAULTS[id];
            const featured = id === "pro";
            return (
              <div key={id} data-testid={`plan-${id}`} className={`glass flex flex-col rounded-2xl p-7 ${featured ? "ring-2 ring-primary" : ""}`}>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-semibold">{p.name}</p>
                  {featured && <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Most salons</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{BLURB[id]}</p>
                <p className="mt-6 text-4xl font-semibold tracking-tight">
                  {p.priceMonthly ? `${p.currency} ${p.priceMonthly}` : "Free"}
                  {p.priceMonthly ? <span className="text-base font-normal text-muted-foreground"> / month</span> : null}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Staff: {p.limits.max_staff === null ? "unlimited" : `up to ${p.limits.max_staff}`}</p>
                <ul className="mt-6 flex-1 space-y-2">
                  {FEATURE_KEYS.filter((f) => p.features.includes(f)).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[15px]">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      {FEATURE_LABELS[f]}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup/"
                  className={`mt-8 inline-flex h-12 items-center justify-center rounded-full font-medium ${featured ? "bg-primary text-primary-foreground" : "border border-foreground/20"}`}
                >
                  Start free trial
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Need something else, or more than one branch? Talk to us and we&apos;ll set up a plan for you.</p>
      </div>
    </section>
  );
}
