import type { Metadata } from "next";
import { HomePage } from "@/components/home/home-page";
import { HOME_EN } from "@/components/home/copy";
import { videoJsonLd } from "@/lib/seo";

/** hreflang: this page and its Arabic version (/ar/). */
export const metadata: Metadata = { alternates: { canonical: "/", languages: { "en-AE": "/", "ar-AE": "/ar/", "x-default": "/" } } };

export default function Home() {
  return (
    <>
      <HomePage t={HOME_EN} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd()).replace(/</g, "\\u003c") }} />
    </>
  );
}
