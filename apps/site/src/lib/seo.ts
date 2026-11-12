import { PLAN_DEFAULTS } from "@ss/features";
import { BRAND_NAME, COMPANY, OFFICE, ROOT_DOMAIN, SUPPORT_EMAIL } from "@/lib/brand";

/** The one public address of the site: every page's canonical URL, the sitemap and social previews use it. */
export const SITE_URL = `https://${ROOT_DOMAIN || "salonkit.online"}`;
/** Google Analytics 4 measurement ID (G-XXXX), public; empty = no analytics script. */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";
/** Google Search Console HTML-tag verification code (the content="…" value); empty = no tag. */
export const GSC_VERIFICATION = process.env.NEXT_PUBLIC_GSC_VERIFICATION || "";

export const SEO_TITLE = `${BRAND_NAME}: salon and barber shop software for Dubai and the UAE`;
export const SEO_DESCRIPTION =
  "Bills, staff commission, daily sheet, WhatsApp reminders, Google reviews and VAT invoices for salons and barber shops in Dubai and the UAE. Try it free for 7 days.";
export const SEO_KEYWORDS = [
  "salon software Dubai",
  "salon management software UAE",
  "barber shop software",
  "salon POS",
  "salon billing app",
  "salon commission tracking",
  "WhatsApp salon reminders",
  "salon VAT invoice UAE",
];

/** schema.org structured data for the home page: who we are, the site, and the app with its prices in AED. */
export function structuredData() {
  const plans = (["free", "pro", "pro_max"] as const).map((id) => PLAN_DEFAULTS[id]);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BRAND_NAME,
      legalName: COMPANY,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      ...(SUPPORT_EMAIL ? { email: SUPPORT_EMAIL } : {}),
      areaServed: "AE",
      address: { "@type": "PostalAddress", streetAddress: `${OFFICE.street}, ${OFFICE.area}`, addressLocality: OFFICE.locality, addressRegion: OFFICE.locality, addressCountry: OFFICE.country },
    },
    { "@context": "https://schema.org", "@type": "WebSite", name: BRAND_NAME, url: SITE_URL },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web browser (phones, tablets and computers)",
      description: SEO_DESCRIPTION,
      offers: plans.map((p) => ({ "@type": "Offer", name: p.name, price: String(p.priceMonthly ?? 0), priceCurrency: p.currency || "AED" })),
    },
  ];
}

/** Open Graph for one page, keeping the shared preview image (a page's openGraph replaces the layout's whole object). */
export function pageOpenGraph(path: string, title: string, description: string) {
  return {
    type: "website" as const,
    url: path,
    siteName: BRAND_NAME,
    title,
    description,
    locale: "en_AE",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: `${BRAND_NAME}: salon software for the UAE` }],
  };
}

/** schema.org VideoObject for the 60-second demo on the home page ("Watch demo"). */
export function videoJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${BRAND_NAME} in 60 seconds`,
    description: "How a UAE salon rings up a VAT bill in three taps, gets the daily sheet and staff commission done for it, and brings customers back on WhatsApp.",
    thumbnailUrl: `${SITE_URL}/media/salonkit-demo-poster.jpg`,
    contentUrl: `${SITE_URL}/media/salonkit-demo.mp4`,
    uploadDate: "2026-11-03",
    duration: "PT1M0S",
    inLanguage: "en",
  };
}
