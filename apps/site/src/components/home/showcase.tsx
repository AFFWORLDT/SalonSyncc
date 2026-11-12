/* eslint-disable @next/next/no-img-element -- static export: plain <img> with explicit sizes */
import { ArrowRight, Check, MessageCircle, TrendingUp } from "lucide-react";
import { Reveal } from "./reveal";
import { Phone } from "./hero";
import type { HomeCopy } from "./copy";

/** "Everything you need in one place": the real dashboard on a laptop, a phone beside it, and two floating cards. */
export function Showcase({ t }: { t: HomeCopy }) {
  const s = t.showcase;
  return (
    <section id="showcase" className="relative scroll-mt-24 overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 h-[60%] bg-gradient-to-b from-transparent via-[#f0e5d8] to-transparent" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.35fr_1fr]">
        <Reveal className="relative">
          {/* Laptop */}
          <div className="relative mx-auto max-w-[760px]">
            <div className="rounded-[1.6rem] bg-[#1b1512] p-[10px] pb-[14px] shadow-[0_50px_100px_-40px_rgb(33_26_23/0.7)] ring-1 ring-black/50">
              <div className="mb-[7px] flex justify-center">
                <span className="size-1.5 rounded-full bg-white/20" />
              </div>
              <img
                src="/img/screens/web-dashboard.webp"
                srcSet="/img/screens/web-dashboard.webp 1600w, /img/screens/web-dashboard-2x.webp 2400w"
                sizes="(min-width: 1024px) 760px, 92vw"
                alt={s.laptopAlt}
                width={1600}
                height={1000}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full rounded-[0.9rem]"
              />
            </div>
            <div className="mx-auto h-4 w-[112%] -translate-x-[5.4%] rounded-b-[1.4rem] bg-gradient-to-b from-[#cbbba6] to-[#a8957f] shadow-[0_24px_40px_-20px_rgb(33_26_23/0.6)] rtl:translate-x-[5.4%]" />
          </div>
          <Phone src="/img/screens/phone-daily-sheet.webp" alt={s.phoneAlt} className="sk-float absolute -bottom-10 w-[24%] max-w-[180px] ltr:-right-2 rtl:-left-2 sm:ltr:-right-6 sm:rtl:-left-6" />
          <div className="sk-card sk-float-slow absolute -top-6 flex items-center gap-3 px-4 py-3 ltr:left-2 rtl:right-2 sm:ltr:-left-6 sm:rtl:-right-6">
            <span className="grid size-10 place-items-center rounded-full bg-[#a7b8a1]/30 text-[#4f6a49]">
              <TrendingUp className="size-5" aria-hidden />
            </span>
            <span className="text-sm leading-tight">
              <span className="block font-semibold">{s.liveCard[0]}</span>
              <span className="text-muted-foreground">{s.liveCard[1]}</span>
            </span>
          </div>
          <div className="sk-card sk-float absolute bottom-[18%] hidden items-center gap-3 px-4 py-3 [animation-delay:-3s] sm:flex ltr:-left-8 rtl:-right-8">
            <span className="grid size-10 place-items-center rounded-full bg-[#25d366]/15 text-[#128c7e]">
              <MessageCircle className="size-5" aria-hidden />
            </span>
            <span className="text-sm leading-tight">
              <span className="block font-semibold">{s.waCard[0]}</span>
              <span className="text-muted-foreground">{s.waCard[1]}</span>
            </span>
          </div>
        </Reveal>

        <Reveal delay={120} className="max-w-lg">
          <p className="sk-eyebrow">{s.eyebrow}</p>
          <h2 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">{s.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{s.lead}</p>
          <ul className="mt-7 grid gap-3">
            {s.points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[16px]">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#f5d5a9] to-[#d9ad78] text-[#211a17]">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <a href="#features" className="sk-btn sk-btn-gold mt-9">
            {s.cta}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
