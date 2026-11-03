import type { Metadata } from "next";
import { SiteNav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Pricing } from "@/components/pricing";
import { SiteFooter } from "@/components/site-footer";
import { FaqSection } from "@/components/faq";
import { HOME_FAQS } from "@/lib/content";

/** hreflang: this page and its Arabic version (/ar/). */
export const metadata: Metadata = { alternates: { canonical: "/", languages: { "en-AE": "/", "ar-AE": "/ar/", "x-default": "/" } } };

export default function Home() {
  return (
    <main>
      <SiteNav />
      <Hero />
      <Features />
      <Pricing />
      <FaqSection faqs={HOME_FAQS} />
      <SiteFooter />
    </main>
  );
}
