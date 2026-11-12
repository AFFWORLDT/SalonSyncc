/* eslint-disable @next/next/no-img-element -- static export: plain <img> with explicit sizes */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DemoButton } from "./demo-video";
import { Phone } from "./frames";
import type { HomeCopy } from "./copy";

/** The top of the page: an editorial split. Words on the left; one salon photograph on the right, with the real app on a phone at its edge. */
export function Hero({ t }: { t: HomeCopy }) {
  const h = t.hero;
  const up = "animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-700";
  return (
    <section className="relative pt-[88px]">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-10 pb-16 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:pt-14 lg:pb-20">
        <div className="lg:col-span-6">
          <p className={`${up} text-[13px] font-semibold tracking-[0.16em] text-[#946226] uppercase`}>{h.badge}</p>
          <h1 className={`${up} mt-5 text-[2.6rem] leading-[1.03] font-extrabold tracking-[-0.045em] [animation-delay:80ms] sm:text-6xl lg:text-[3.3rem] xl:text-[3.75rem]`}>
            <span className="mb-5 block font-sans text-base font-medium tracking-normal text-muted-foreground sm:text-[17px]">{h.seoLine}</span>
            {h.line1}
            <br />
            <span className="lg:whitespace-nowrap"><span className="text-[#b07a3b]">{h.grow}</span> {h.rest}</span>
          </h1>
          <p className={`${up} mt-6 max-w-[34rem] text-[17px] leading-relaxed text-muted-foreground [animation-delay:150ms]`}>{h.lead}</p>
          <div className={`${up} mt-9 flex flex-wrap items-center gap-x-6 gap-y-4 [animation-delay:220ms]`}>
            <Link href="/signup/" className="sk-btn sk-btn-dark h-12 px-7">
              {h.cta}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
            <DemoButton label={h.demo} t={t.demo} className="group inline-flex items-center gap-3 font-semibold" />
          </div>
          <p className={`${up} mt-8 border-t border-[rgb(72_52_35/0.12)] pt-5 text-[13px] tracking-wide text-muted-foreground [animation-delay:300ms]`}>{h.note}</p>
        </div>

        <div className="relative lg:col-span-6">
          <div className="sk-photo relative overflow-hidden rounded-[4px] ltr:lg:ml-10 rtl:lg:mr-10">
            <img src="/img/photo/salon-gold.webp" alt={h.imgAlt} width={880} height={1100} fetchPriority="high" decoding="async" className="aspect-[4/5] h-auto w-full object-cover sm:aspect-[5/5] lg:aspect-[4/4.4]" />
          </div>
          <Phone src="/img/screens/phone-dashboard.webp" alt={h.phoneAlt} className="absolute bottom-8 w-[34%] max-w-[210px] ltr:-left-1 rtl:-right-1 sm:w-[26%] lg:bottom-12 ltr:lg:left-0 rtl:lg:right-0" />
        </div>
      </div>
    </section>
  );
}
