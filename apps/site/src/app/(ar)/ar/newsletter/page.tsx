import type { Metadata } from "next";
import { SiteHeader } from "@/components/home/site-header";
import { SiteFooter } from "@/components/site-footer";
import { NewsletterStatus } from "@/components/home/newsletter-status";
import { HOME_AR } from "@/components/home/copy";

export const metadata: Metadata = { title: "النشرة البريدية", robots: { index: false, follow: true }, alternates: { canonical: "/ar/newsletter/" } };

export default function ArabicNewsletterPage() {
  return (
    <>
      <SiteHeader t={{ lang: HOME_AR.lang, home: HOME_AR.home, nav: HOME_AR.nav }} />
      <main className="px-5 pt-36 pb-24">
        <NewsletterStatus t={HOME_AR.newsletter} home="/ar/" />
      </main>
      <SiteFooter t={HOME_AR} />
    </>
  );
}
