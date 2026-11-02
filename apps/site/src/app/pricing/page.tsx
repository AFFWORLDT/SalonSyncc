import type { Metadata } from "next";
import { SiteNav } from "@/components/nav";
import { Pricing } from "@/components/pricing";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "Pricing" };

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
