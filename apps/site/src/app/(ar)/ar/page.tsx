/* eslint-disable @next/next/no-img-element -- static brand images; next/image is off in static export */
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { FEATURE_KEYS, PLAN_DEFAULTS, type PlanId } from "@ss/features";
import { ShaderBackdrop, PulsingRing } from "@/components/ui/shader-backdrop";
import { FeatureShaderCards, type ShaderFeature } from "@/components/ui/feature-shader-cards";
import { BillIcon, GoogleSheetsIcon, WalletIcon } from "@/components/ui/brand-icons";
import { FaqList } from "@/components/faq";
import * as PricingCard from "@/components/ui/pricing-card";
import { BRAND_NAME, COMPANY } from "@/lib/brand";
import { AR, AR_FAQS, AR_FEATURES, AR_FEATURE_LABELS, AR_PLAN_BLURB, arStaff } from "@/lib/content-ar";
import { cn } from "@/lib/utils";

const img = (src: string, alt: string, className?: string) => <img src={src} alt={alt} width={160} height={160} loading="lazy" className={className} />;
const LOOK: Omit<ShaderFeature, "title" | "description">[] = [
  { icon: <BillIcon />, colors: ["#0f2e29", "#1f7a6a", "#2a9d88", "#cfe9e2"] },
  { icon: <WalletIcon />, colors: ["#2b2114", "#8c6a3a", "#b8935a", "#f2dcae"] },
  { icon: <GoogleSheetsIcon />, colors: ["#0b2e1a", "#0f9d58", "#34a853", "#c8f0d4"] },
  { icon: img("/icons/whatsapp.png", "WhatsApp"), iconTile: false, colors: ["#06302a", "#128c7e", "#25d366", "#dcf8c6"] },
  { icon: img("/icons/google-review.png", "Google", "size-12! max-w-none"), colors: ["#2e2105", "#b8860b", "#fbbc04", "#fff1c2"] },
  { icon: img("/icons/google-maps.png", "Google Maps"), colors: ["#0c1f33", "#1a73e8", "#1f7a6a", "#a8c7fa"] },
];
const FEATURES: ShaderFeature[] = AR_FEATURES.map((f, i) => ({ ...LOOK[i], ...f }));
const ORDER: PlanId[] = ["free", "pro", "pro_max"];

/** الصفحة الرئيسية بالعربية: نفس الأقسام بالإنجليزية (البطل، المزايا، الأسعار، الأسئلة)، من اليمين إلى اليسار. */
export default function ArabicHome() {
  return (
    <main>
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/ar/" className="flex items-center gap-2 font-semibold text-white">
            <img src="/brand/mark.png" alt="" width={32} height={32} className="size-8 rounded-full bg-black" />
            {BRAND_NAME}
          </Link>
          <nav className="flex items-center gap-1 text-sm text-white/85 sm:gap-3">
            <Link href="/" hrefLang="en" lang="en" className="rounded-full px-3 py-2 hover:text-white">{AR.english}</Link>
            <a href="#pricing" className="hidden rounded-full px-3 py-2 hover:text-white sm:inline">{AR.pricing}</a>
            <Link href="/login/" className="rounded-full px-3 py-2 hover:text-white">{AR.signIn}</Link>
            <Link href="/signup/" className="rounded-full bg-white px-4 py-2 font-medium text-[#1c1b18]">{AR.startShort}</Link>
          </nav>
        </div>
      </header>

      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-28 text-[#fffdf8] sm:px-12">
        <ShaderBackdrop />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <PulsingRing size={170}>
            <img src="/icon-192.png" alt="SalonKit" width={76} height={76} className="rounded-[20px] shadow-xl shadow-black/40" />
          </PulsingRing>
          <h1 className="mt-8 text-balance text-5xl leading-tight font-bold sm:text-7xl sm:leading-tight">{AR.heroTitle}</h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-loose text-[#fffdf8]/85">{AR.heroLead}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup/" className="inline-flex h-13 items-center gap-2 rounded-full bg-[#fffdf8] px-8 font-semibold text-[#1c1b18] active:scale-[0.97]">
              {AR.start}
              <ArrowLeft className="size-5" aria-hidden />
            </Link>
            <Link href="/login/" className="inline-flex h-13 items-center rounded-full border border-[#fffdf8]/40 px-8 font-medium hover:bg-[#fffdf8]/10">
              {AR.signIn}
            </Link>
          </div>
          <p className="mt-5 text-sm text-[#fffdf8]/70">{AR.trialNote}</p>
        </div>
      </section>

      <section id="features" className="relative overflow-hidden px-6 py-24 sm:px-12">
        <div aria-hidden className="pointer-events-none absolute -right-40 top-10 size-[520px] rounded-full bg-[#2a9d88]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-40 bottom-0 size-[520px] rounded-full bg-[#b8935a]/25 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <h2 className="max-w-2xl text-balance text-4xl leading-snug font-bold sm:text-5xl sm:leading-snug">{AR.featuresTitle}</h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">{AR.featuresLead}</p>
          <FeatureShaderCards features={FEATURES} className="mt-12" />
        </div>
      </section>

      <section id="pricing" className="px-6 py-24 sm:px-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold sm:text-5xl">{AR.pricingTitle}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{AR.pricingLead}</p>
          <div className="mt-12 grid items-start gap-5 lg:grid-cols-3">
            {ORDER.map((id, i) => {
              const p = PLAN_DEFAULTS[id];
              const prev = ORDER[i - 1];
              const featured = id === "pro";
              const own = FEATURE_KEYS.filter((f) => p.features.includes(f) && (!prev || !PLAN_DEFAULTS[prev].features.includes(f)) && AR_FEATURE_LABELS[f]);
              return (
                <PricingCard.Card key={id} data-testid={`ar-plan-${id}`} className={cn(featured && "border-2! border-primary/60! lg:-translate-y-2")}>
                  <PricingCard.Header>
                    <PricingCard.Plan>
                      <PricingCard.PlanName>
                        <span lang="en">{p.name}</span>
                      </PricingCard.PlanName>
                    </PricingCard.Plan>
                    <PricingCard.Price>
                      <PricingCard.MainPrice>{p.priceMonthly ? p.priceMonthly : AR.free}</PricingCard.MainPrice>
                      {p.priceMonthly ? <PricingCard.Period>{AR.perMonth}</PricingCard.Period> : null}
                    </PricingCard.Price>
                    <PricingCard.Description>{AR_PLAN_BLURB[id]}</PricingCard.Description>
                    <PricingCard.Description className="mt-1">{arStaff(p.limits.max_staff)}</PricingCard.Description>
                    <Link
                      href="/signup/"
                      className={cn(
                        "mt-5 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold",
                        featured ? "bg-primary text-primary-foreground shadow-[0_10px_25px_rgba(31,122,106,0.3)]" : "border border-foreground/15 bg-background/70"
                      )}
                    >
                      {AR.start}
                    </Link>
                  </PricingCard.Header>
                  <PricingCard.Body>
                    {prev && <p className="text-sm font-medium">{AR.everythingIn(PLAN_DEFAULTS[prev].name)}</p>}
                    <PricingCard.List>
                      {own.map((f) => (
                        <PricingCard.ListItem key={f}>
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          {AR_FEATURE_LABELS[f]}
                        </PricingCard.ListItem>
                      ))}
                    </PricingCard.List>
                  </PricingCard.Body>
                </PricingCard.Card>
              );
            })}
          </div>
        </div>
      </section>

      <section id="faq" className="px-6 py-24 sm:px-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-4xl font-bold sm:text-5xl">{AR.faqTitle}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{AR.faqLead}</p>
          <FaqList faqs={AR_FAQS} lang="ar" className="mt-10" />
        </div>
      </section>

      <section className="px-6 pb-24 sm:px-12">
        <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-[#0f2e29] to-[#1f7a6a] p-10 text-center text-white shadow-[0_30px_60px_-20px_rgba(15,46,41,0.6)]">
          <h2 className="text-3xl font-bold">{AR.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-md leading-relaxed text-white/80">{AR.ctaLead}</p>
          <Link href="/signup/" className="mt-7 inline-flex h-12 items-center rounded-full bg-white px-7 font-semibold text-[#0f2e29] hover:bg-white/90">
            {AR.start}
          </Link>
          <p className="mt-4 text-xs text-white/60">{AR.appInEnglish}</p>
        </div>
      </section>

      <footer className="border-t border-[#e0d9cb] px-6 py-10 text-sm text-muted-foreground sm:px-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <p>
            © {new Date().getFullYear()} <span lang="en">{COMPANY}</span>. {AR.rights}
          </p>
          <nav className="flex gap-4">
            <a href="#pricing" className="hover:text-foreground">{AR.pricing}</a>
            <Link href="/" hrefLang="en" lang="en" className="hover:text-foreground">{AR.english}</Link>
            <Link href="/signup/" className="hover:text-foreground">{AR.startShort}</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
