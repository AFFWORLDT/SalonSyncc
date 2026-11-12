import type { Metadata } from "next";
import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { NewsletterStatus } from "@/components/home/newsletter-status";
import { HOME_EN } from "@/components/home/copy";

export const metadata: Metadata = { title: "Newsletter", robots: { index: false, follow: true }, alternates: { canonical: "/newsletter/" } };

export default function NewsletterPage() {
  return (
    <>
      <SiteNav />
      <main className="px-5 pt-36 pb-24">
        <NewsletterStatus t={HOME_EN.newsletter} home="/" />
      </main>
      <SiteFooter />
    </>
  );
}
