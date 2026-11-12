import Link from "next/link";
import { Check, Crown, Lock, Scissors, Users, type LucideIcon } from "lucide-react";
import { FEATURE_KEYS, FEATURE_LABELS, PLAN_DEFAULTS, type FeatureKey, type PlanId } from "@ss/features";
import { AR_FEATURE_LABELS } from "@/lib/content-ar";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { HOME_EN, type HomeCopy } from "./copy";

const ORDER: PlanId[] = ["free", "pro", "pro_max"];
const ICON: Record<PlanId, LucideIcon> = { free: Scissors, pro: Users, pro_max: Crown };
/** How many of the next plan's extras a card teases. */
const TEASE = 3;
const featuresOf = (id: PlanId): FeatureKey[] => FEATURE_KEYS.filter((f) => PLAN_DEFAULTS[id].features.includes(f));

/** The three plans, straight from the plan catalogue (prices in AED). Each card lists what it adds to the plan before it. */
export function PricingPlans({ t = HOME_EN, headingLevel = 2 }: { t?: HomeCopy; headingLevel?: 1 | 2 }) {
  const c = t.pricing;
  const label = (f: FeatureKey) => (t.lang === "ar" ? AR_FEATURE_LABELS[f] : FEATURE_LABELS[f]);
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <section id="pricing" className="relative scroll-mt-24 overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute top-20 left-1/2 size-[700px] -translate-x-1/2 rounded-full bg-[#f3d9b6]/45 blur-3xl" />
      <div className="relative mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="sk-eyebrow">✦ {c.eyebrow}</p>
          <H className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">{c.title}</H>
          <p className="mt-5 text-lg text-muted-foreground">{c.lead}</p>
        </Reveal>
        <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
          {ORDER.map((id, i) => {
            const p = PLAN_DEFAULTS[id];
            const prev = ORDER[i - 1];
            const next = ORDER[i + 1];
            const featured = id === "pro";
            const own = featuresOf(id).filter((f) => (!prev || !PLAN_DEFAULTS[prev].features.includes(f)) && label(f));
            const locked = next ? featuresOf(next).filter((f) => !p.features.includes(f) && label(f)).slice(0, TEASE) : [];
            const Icon = ICON[id];
            const price = p.priceMonthly ? (c.currencyFirst ? `${p.currency} ${p.priceMonthly}` : String(p.priceMonthly)) : c.free;
            return (
              <Reveal key={id} delay={i * 90} className="h-full">
                <div
                  data-testid={`plan-${id}`}
                  className={cn(
                    "group relative flex h-full flex-col rounded-[2rem] p-7 transition duration-300 hover:-translate-y-1.5",
                    featured
                      ? "bg-[#211a17] text-[#f7f1e8] shadow-[0_40px_80px_-30px_rgb(33_26_23/0.7)] ring-1 ring-[#d9ad78]/50 lg:-translate-y-3 lg:hover:-translate-y-4"
                      : "sk-card hover:shadow-[var(--shadow-lift)]"
                  )}
                >
                  {featured && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#f5d5a9] to-[#c58a45] px-4 py-1 text-xs font-bold text-[#211a17] shadow-md">{c.badge[id]}</span>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <h3 lang="en" className="flex items-center gap-2.5 text-xl font-bold">
                      <span className={cn("grid size-10 place-items-center rounded-2xl", featured ? "bg-[#d9ad78] text-[#211a17]" : "bg-[#f5e5d2] text-[#8a5a22]")}>
                        <Icon className="size-5" aria-hidden />
                      </span>
                      {p.name}
                    </h3>
                    {!featured && <span className="rounded-full border border-foreground/12 px-2.5 py-0.5 text-xs text-foreground/70">{c.badge[id]}</span>}
                  </div>
                  <p className={cn("mt-4 text-sm", featured ? "text-[#f7f1e8]/70" : "text-muted-foreground")}>{c.blurb[id]}</p>
                  <p className="mt-6 flex items-end gap-1.5">
                    <span className="text-[2.6rem] leading-none font-extrabold tracking-[-0.04em] font-display">{price}</span>
                    <span className={cn("pb-1 text-sm", featured ? "text-[#f7f1e8]/65" : "text-muted-foreground")}>{p.priceMonthly ? c.perMonth : c.forever}</span>
                  </p>
                  <p className={cn("mt-2 text-sm font-medium", featured ? "text-[#d9ad78]" : "text-[#946226]")}>{c.staff(p.limits.max_staff)}</p>
                  <Link href="/signup/" className={cn("sk-btn mt-7 w-full", featured ? "sk-btn-gold" : "sk-btn-ghost")}>
                    {c.start}
                  </Link>
                  <div className={cn("my-7 h-px", featured ? "bg-white/12" : "bg-foreground/10")} />
                  {prev && <p className="mb-3 text-sm font-semibold">{c.everythingIn(PLAN_DEFAULTS[prev].name)}</p>}
                  <ul className="grid gap-2.5">
                    {own.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[15px]">
                        <Check className={cn("mt-0.5 size-4 shrink-0", featured ? "text-[#d9ad78]" : "text-[#946226]")} strokeWidth={2.6} aria-hidden />
                        {label(f)}
                      </li>
                    ))}
                  </ul>
                  {locked.length > 0 && (
                    <>
                      <p className={cn("mt-6 mb-3 text-xs font-medium tracking-wide uppercase", featured ? "text-[#f7f1e8]/50" : "text-muted-foreground")}>{c.upgradeFor(PLAN_DEFAULTS[next!].name)}</p>
                      <ul className="grid gap-2.5">
                        {locked.map((f) => (
                          <li key={f} className={cn("flex items-start gap-2.5 text-[15px]", featured ? "text-[#f7f1e8]/55" : "text-muted-foreground")}>
                            <Lock className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden />
                            {label(f)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-10 text-center text-sm text-muted-foreground">{c.note}</p>
      </div>
    </section>
  );
}
