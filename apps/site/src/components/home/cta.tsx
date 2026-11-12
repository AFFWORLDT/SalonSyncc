/* eslint-disable @next/next/no-img-element -- static export */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";
import type { HomeCopy } from "./copy";

/** The dark espresso call to action with gold light and salon products. */
export function Cta({ t }: { t: HomeCopy }) {
  const c = t.cta;
  return (
    <section className="px-5 pb-24 sm:px-8 sm:pb-32">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#211a17] px-7 py-14 text-[#f7f1e8] shadow-[0_50px_100px_-40px_rgb(33_26_23/0.8)] sm:px-14 sm:py-20">
        <div aria-hidden className="absolute -top-32 size-[520px] rounded-full bg-[#c58a45]/30 blur-3xl ltr:-left-24 rtl:-right-24" />
        <div aria-hidden className="absolute -bottom-40 size-[420px] rounded-full bg-[#d9ad78]/20 blur-3xl ltr:right-10 rtl:left-10" />
        <svg aria-hidden viewBox="0 0 800 300" className="absolute inset-0 h-full w-full text-[#d9ad78]/35" fill="none" preserveAspectRatio="none">
          <path d="M-20 260 C 180 120, 420 330, 820 60" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">{c.title}</h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#f7f1e8]/75">{c.lead}</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/signup/" className="sk-btn sk-btn-gold h-13 px-8 text-base">
                {c.button}
                <ArrowRight className="size-5 rtl:rotate-180" aria-hidden />
              </Link>
              <span className="text-sm text-[#f7f1e8]/60">{c.note}</span>
            </div>
          </div>
          <img src="/img/decor/bottles.webp" alt={c.imgAlt} width={545} height={230} loading="lazy" decoding="async" className="sk-float-slow w-full max-w-md justify-self-center rounded-[1.75rem] border border-white/10 shadow-2xl" />
        </div>
      </Reveal>
    </section>
  );
}
