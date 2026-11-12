import { SiteHeader } from "./site-header";
import { Hero } from "./hero";
import { Strip } from "./strip";
import { ProductSplits, Counter, Retention } from "./sections";
import { Testimonials } from "./testimonials";
import { PricingPlans } from "./pricing";
import { Cta } from "./cta";
import { FaqSection } from "@/components/faq";
import { SiteFooter } from "@/components/site-footer";
import type { HomeCopy } from "./copy";

/** The whole home page in one language: the English (/) and Arabic (/ar/) pages both render this. */
export function HomePage({ t }: { t: HomeCopy }) {
  return (
    <>
      <SiteHeader t={{ lang: t.lang, home: t.home, nav: t.nav }} />
      <main>
        <Hero t={t} />
        <Strip t={t} />
        <ProductSplits t={t} />
        <Counter t={t} />
        <Retention t={t} />
        <PricingPlans t={t} />
        <Testimonials t={t} />
        <FaqSection faqs={t.faq.items} title={t.faq.title} lead={t.faq.lead} eyebrow={t.faq.eyebrow} lang={t.lang} />
        <Cta t={t} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
