/* eslint-disable @next/next/no-img-element -- static export: plain <img> with explicit sizes */
import Link from "next/link";
import { ArrowRight, CheckCircle2, Star } from "lucide-react";
import { DemoButton } from "./demo-video";
import { IconTile } from "./icons";
import type { HomeCopy } from "./copy";

/** A phone frame around a real SalonKit screenshot. */
export function Phone({ src, alt, className = "", eager }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <div className={`rounded-[2.4rem] bg-[#16110f] p-[7px] shadow-[0_40px_80px_-30px_rgb(33_26_23/0.6)] ring-1 ring-black/40 ${className}`}>
      <img src={src} alt={alt} width={600} height={1304} loading={eager ? "eager" : "lazy"} decoding="async" className="block h-auto w-full rounded-[2rem]" />
    </div>
  );
}

/** The top of the page: headline and buttons, beside a salon photo with the real app on a phone and two live-looking cards. */
export function Hero({ t }: { t: HomeCopy }) {
  const h = t.hero;
  const up = "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700";
  return (
    <section className="relative overflow-hidden pt-[104px] sm:pt-[120px]">
      {/* Warm light and a gold curve behind the photo */}
      <div aria-hidden className="pointer-events-none absolute -top-40 size-[640px] rounded-full bg-[#f3d9b6]/70 blur-3xl ltr:-right-40 rtl:-left-40" />
      <div aria-hidden className="pointer-events-none absolute top-[40%] size-[420px] rounded-full bg-[#a7b8a1]/25 blur-3xl ltr:-left-40 rtl:-right-40" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div className="max-w-xl">
          <p className={`${up} sk-eyebrow`}>
            <span aria-hidden className="text-[#c58a45]">✦</span>
            {h.badge}
          </p>
          <h1 className={`${up} mt-6 text-[2.75rem] leading-[1.04] font-extrabold tracking-[-0.045em] [animation-delay:80ms] sm:text-6xl lg:text-[2.9rem] xl:text-[3.6rem]`}>
            <span className="mb-4 block font-sans text-base font-semibold tracking-normal text-[#946226] sm:text-lg">{h.seoLine}</span>
            {h.line1}
            <br />
            <span className="xl:whitespace-nowrap">
              <span className="sk-gold">{h.grow}</span> {h.rest}
            </span>
          </h1>
          <p className={`${up} mt-6 text-lg leading-relaxed text-muted-foreground text-pretty [animation-delay:150ms]`}>{h.lead}</p>
          <div className={`${up} mt-9 flex flex-wrap items-center gap-x-5 gap-y-4 [animation-delay:220ms]`}>
            <Link href="/signup/" className="sk-btn sk-btn-dark h-13 px-7 text-base">
              {h.cta}
              <ArrowRight className="size-5 rtl:rotate-180" aria-hidden />
            </Link>
            <DemoButton label={h.demo} t={t.demo} className="group inline-flex items-center gap-3 rounded-full py-1 pe-3 font-semibold" />
          </div>
          <p className={`${up} mt-7 flex items-center gap-2 text-sm text-muted-foreground [animation-delay:300ms]`}>
            <CheckCircle2 className="size-4 text-[#946226]" aria-hidden />
            {h.note}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
          <svg aria-hidden viewBox="0 0 600 640" className="pointer-events-none absolute -inset-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] text-[#d9ad78]" fill="none">
            <path className="sk-draw" d="M40 560 C 120 640, 330 650, 470 520 S 640 160, 520 40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path className="sk-draw" d="M70 600 C 210 660, 420 600, 540 430" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          {/* Arched salon photo */}
          <div className="relative ms-auto w-[78%] overflow-hidden rounded-t-[999px] rounded-b-[2.5rem] border-[6px] border-white/80 shadow-[var(--shadow-lift)]">
            <img src="/img/hero-salon.webp" alt={h.imgAlt} width={880} height={1100} fetchPriority="high" decoding="async" className="aspect-[4/5] h-auto w-full object-cover" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#211a17]/25 via-transparent to-transparent" />
          </div>
          {/* Hair wash inset */}
          <div className="sk-float-slow absolute bottom-[14%] w-[44%] overflow-hidden rounded-[1.75rem] border-[5px] border-white shadow-[var(--shadow-lift)] ltr:left-0 rtl:right-0">
            <img src="/img/hair-wash.webp" alt={h.washAlt} width={405} height={285} decoding="async" className="aspect-[405/285] h-auto w-full object-cover" />
          </div>
          {/* The real app */}
          <Phone src="/img/screens/phone-dashboard.webp" alt={h.phoneAlt} className="sk-float absolute -bottom-6 w-[30%] ltr:right-[-2%] rtl:left-[-2%] sm:-bottom-8" />
          {/* Live cards */}
          <div className="sk-card sk-float absolute top-[12%] flex items-center gap-3 px-4 py-3 [animation-delay:-2s] ltr:left-[4%] rtl:right-[4%]">
            <span className="grid size-10 place-items-center rounded-full bg-[#25d366]/15 text-[#128c7e]">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <span className="text-sm leading-tight">
              <span className="block font-semibold">{h.billCard[0]}</span>
              <span className="text-muted-foreground">
                {h.billCard[1]} · <span className="font-semibold text-foreground">{h.billCard[2]}</span>
              </span>
            </span>
          </div>
          <div className="sk-card sk-float-slow absolute top-[46%] hidden px-4 py-3 [animation-delay:-4s] sm:block ltr:-left-6 rtl:-right-6">
            <span className="flex items-center gap-1 text-[#e0a42b]" aria-label="5 stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="size-4 fill-current" aria-hidden />
              ))}
              <span className="ms-1.5 text-xs font-semibold text-foreground">{h.ratingCard[0]}</span>
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">{h.ratingCard[1]}</span>
          </div>
        </div>
      </div>

      {/* Feature strip */}
      <div className="relative mx-auto mt-20 max-w-7xl px-5 sm:mt-24 sm:px-8">
        <ul className="sk-card grid grid-cols-1 gap-y-5 px-4 py-6 sm:grid-cols-3 sm:gap-y-6 xl:grid-cols-6 xl:divide-x xl:divide-[rgb(72_52_35/0.1)] xl:px-2 rtl:xl:divide-x-reverse">
          {t.strip.map((s) => (
            <li key={s.title} className="flex items-center gap-3 px-3">
              <IconTile icon={s.icon} />
              <span>
                <span className="block text-[15px] font-semibold leading-tight font-display">{s.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{s.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
