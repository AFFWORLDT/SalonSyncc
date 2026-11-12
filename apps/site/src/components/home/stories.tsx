/* eslint-disable @next/next/no-img-element -- static export: plain <img> with explicit sizes */
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "./reveal";
import { Phone } from "./hero";
import type { HomeCopy, Story } from "./copy";

/** What each story shows: a real app screen and a salon object beside it. */
const LOOK: Record<Story["key"], { screen: string; decor: string; decorW: number; decorH: number; tint: string }> = {
  billing: { screen: "/img/screens/phone-new-sale.webp", decor: "/img/decor/gold-tools.webp", decorW: 410, decorH: 255, tint: "from-[#f6e2c6] to-[#efd5b3]" },
  commission: { screen: "/img/screens/phone-staff.webp", decor: "/img/decor/tools.webp", decorW: 300, decorH: 300, tint: "from-[#e8eee4] to-[#d6e0d0]" },
  reports: { screen: "/img/screens/phone-daily-sheet.webp", decor: "/img/decor/flatlay.webp", decorW: 305, decorH: 290, tint: "from-[#f3e6d6] to-[#e9d6bf]" },
  whatsapp: { screen: "/img/screens/wa-rating.webp", decor: "/img/decor/bottles.webp", decorW: 545, decorH: 230, tint: "from-[#e4efe6] to-[#d2e3d6]" },
  reviews: { screen: "/img/screens/phone-ratings.webp", decor: "/img/decor/chair.webp", decorW: 235, decorH: 225, tint: "from-[#f8e7c9] to-[#f0d7ab]" },
  uae: { screen: "/img/screens/phone-bill.webp", decor: "/img/decor/interior.webp", decorW: 375, decorH: 290, tint: "from-[#efe5da] to-[#e3d3c1]" },
};

/** A WhatsApp chat as the customer sees it: the salon's thank-you with the picture and the rating button. */
function WhatsAppCard({ img, alt }: { img: string; alt: string }) {
  return (
    <div className="absolute top-[6%] w-[54%] overflow-hidden rounded-[1.4rem] bg-[#0b141a] text-[#e9edef] shadow-[var(--shadow-lift)] ring-4 ring-white/80 ltr:right-[6%] rtl:left-[6%]" dir="ltr" lang="en">
      <div className="flex items-center gap-2 bg-[#1f2c34] px-3 py-2">
        <img src="/brand/mark.png" alt="" width={24} height={24} loading="lazy" className="size-6 rounded-full bg-black" />
        <span className="text-[11px] leading-tight">
          <span className="block font-semibold">Luxe Barbers</span>
          <span className="text-[#8696a0]">WhatsApp Business</span>
        </span>
      </div>
      <div className="p-2">
        <div className="overflow-hidden rounded-xl bg-[#1f2c34]">
          <img src={img} alt={alt} width={700} height={700} loading="lazy" decoding="async" className="block aspect-[4/3] h-auto w-full object-cover object-top" />
          <p className="px-3 pt-2 text-[11px] leading-snug">Thank you for visiting Luxe Barbers 💈 How was your skin fade with Omar?</p>
          <p className="px-3 pb-1.5 text-end text-[9px] text-[#8696a0]">8:06 PM ✓✓</p>
          <p className="border-t border-white/10 py-1.5 text-center text-[11px] font-medium text-[#53bdeb]">↗ Rate your visit</p>
        </div>
      </div>
    </div>
  );
}

function Visual({ story, alt }: { story: Story; alt: string }) {
  const l = LOOK[story.key];
  const wa = story.key === "whatsapp";
  return (
    <div className={`relative mx-auto aspect-[5/4] w-full max-w-[560px] overflow-hidden rounded-[2.5rem] bg-gradient-to-br ${l.tint} shadow-[var(--shadow-soft)]`}>
      <div aria-hidden className="absolute -top-20 size-72 rounded-full bg-white/50 blur-3xl ltr:-right-16 rtl:-left-16" />
      <img
        src={l.decor}
        alt=""
        width={l.decorW}
        height={l.decorH}
        loading="lazy"
        decoding="async"
        className="sk-float-slow absolute bottom-[8%] w-[46%] rounded-[1.5rem] border-4 border-white/80 object-cover shadow-[var(--shadow-lift)] ltr:left-[6%] rtl:right-[6%]"
      />
      {wa ? (
        <WhatsAppCard img={l.screen} alt={alt} />
      ) : (
        <Phone src={l.screen} alt={alt} className="absolute top-[7%] w-[38%] ltr:right-[9%] rtl:left-[9%]" />
      )}
    </div>
  );
}

/** Six features, each with a real screen, alternating sides. */
export function Stories({ t }: { t: HomeCopy }) {
  return (
    <section id="features" className="relative scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="sk-eyebrow">{t.storiesTitle.eyebrow}</p>
          <h2 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">{t.storiesTitle.title}</h2>
          <p className="mt-5 text-lg text-muted-foreground">{t.storiesTitle.lead}</p>
        </Reveal>
        <div className="mt-20 grid gap-24 sm:gap-32">
          {t.stories.map((s, i) => (
            <article key={s.key} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
              <Reveal className={i % 2 ? "lg:order-2" : ""}>
                <Visual story={s} alt={t.storyAlts[s.key]} />
              </Reveal>
              <Reveal delay={100} className="max-w-xl">
                <p className="text-sm font-semibold tracking-[0.12em] text-[#946226] uppercase">
                  <span className="me-2 font-mono text-[#c58a45]">0{i + 1}</span>
                  {s.eyebrow}
                </p>
                <h3 className="mt-4 text-3xl leading-tight font-extrabold tracking-[-0.035em] sm:text-[2.6rem]">{s.title}</h3>
                <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{s.lead}</p>
                {s.points.length > 0 && (
                  <ul className="mt-6 grid gap-3">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-start gap-3">
                        <Check className="mt-1 size-4 shrink-0 text-[#946226]" strokeWidth={2.6} aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <span className="rounded-full border border-[#a7b8a1]/60 bg-[#a7b8a1]/15 px-3 py-1 text-[13px] font-medium text-[#3f5a3a]">{s.plan}</span>
                  <Link href={s.href} className="group inline-flex items-center gap-1.5 font-semibold text-[#211a17] underline-offset-4 hover:underline">
                    {s.more}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                  </Link>
                </div>
              </Reveal>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
