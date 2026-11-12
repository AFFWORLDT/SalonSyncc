/* eslint-disable @next/next/no-img-element -- static export */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";
import type { HomeCopy } from "./copy";

/** The closing call to action: a dark salon photograph under espresso, one clear button. */
export function Cta({ t }: { t: HomeCopy }) {
  const c = t.cta;
  return (
    <section className="relative isolate overflow-hidden bg-[#211a17] text-[#f7f1e8]">
      <img src="/img/photo/salon-dark.webp" alt={c.imgAlt} width={878} height={1100} loading="lazy" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-45" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#211a17] via-[#211a17]/85 to-[#211a17]/30 rtl:bg-gradient-to-l" />
      <Reveal className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="max-w-2xl">
          <h2 className="text-[2.15rem] leading-[1.08] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl lg:text-6xl">{c.title}</h2>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[#f7f1e8]/75">{c.lead}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/signup/" className="sk-btn sk-btn-gold h-12 px-8">
              {c.button}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
            <span className="text-sm text-[#f7f1e8]/60">{c.note}</span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
