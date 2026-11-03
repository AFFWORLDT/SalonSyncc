import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo";
import { SiteNav } from "@/components/nav";
import { Pricing } from "@/components/pricing";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Pricing: Free, Pro and Pro Max plans in AED",
  description: "Simple salon software pricing in AED. Start free, or choose Pro or Pro Max for reports, WhatsApp and the ledger. Every salon gets 7 days of Pro Max free.",
  alternates: { canonical: "/pricing/" },
  openGraph: pageOpenGraph("/pricing/", "Pricing: Free, Pro and Pro Max plans in AED", "Simple salon software pricing in AED. Start free, or choose Pro or Pro Max for reports, WhatsApp and the ledger. Every salon gets 7 days of Pro Max free."),
};

export default function PricingPage() {
  return (
    <main>
      <SiteNav dark={false} />
      <div className="pt-16">
        <Pricing />
      </div>
      <SiteFooter />
    </main>
  );
}
