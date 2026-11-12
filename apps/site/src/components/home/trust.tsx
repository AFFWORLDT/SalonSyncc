/* eslint-disable @next/next/no-img-element -- static export */
import { BadgeCheck, Building2, Globe2, MonitorSmartphone } from "lucide-react";
import { Reveal } from "./reveal";
import type { HomeCopy } from "./copy";

const ICONS = [BadgeCheck, Building2, Globe2, MonitorSmartphone];

/** Why salons choose SalonKit: plain facts about the product (no invented reviews or numbers). */
export function Trust({ t }: { t: HomeCopy }) {
  const c = t.trust;
  return (
    <section className="relative overflow-hidden bg-[#f0e5d8] px-5 py-24 sm:px-8 sm:py-28">
      <img src="/img/decor/interior.webp" alt="" width={375} height={290} loading="lazy" decoding="async" className="pointer-events-none absolute top-16 hidden w-64 rotate-[3deg] rounded-[2rem] border-4 border-white/70 shadow-[var(--shadow-lift)] xl:block ltr:right-10 rtl:left-10" />
      <div className="relative mx-auto max-w-7xl">
        <Reveal className="max-w-2xl">
          <p className="sk-eyebrow">{c.eyebrow}</p>
          <h2 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">{c.title}</h2>
          <p className="mt-5 text-lg text-muted-foreground">{c.lead}</p>
        </Reveal>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {c.items.map((it, i) => {
            const I = ICONS[i] ?? BadgeCheck;
            return (
              <Reveal as="li" key={it.title} delay={i * 80} className="sk-card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                <span className="grid size-12 place-items-center rounded-2xl bg-[#211a17] text-[#d9ad78]">
                  <I className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg leading-snug font-bold">{it.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{it.body}</p>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
