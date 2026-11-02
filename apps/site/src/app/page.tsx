import { SiteNav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Pricing } from "@/components/pricing";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <main>
      <SiteNav />
      <Hero />
      <Features />
      <Pricing />
      <SiteFooter />
    </main>
  );
}
