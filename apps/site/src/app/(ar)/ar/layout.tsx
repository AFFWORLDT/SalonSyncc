import type { Metadata, Viewport } from "next";
import { arabicFontClassName } from "@/lib/fonts";
import { BRAND_NAME } from "@/lib/brand";
import { Analytics } from "@/components/analytics";
import { AR } from "@/lib/content-ar";
import { GSC_VERIFICATION, SITE_URL, structuredData } from "@/lib/seo";
import "../../globals.css";

/** The Arabic site's own root layout: <html lang="ar" dir="rtl">, Arabic font, and hreflang back to the English page. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: AR.title,
  description: AR.description,
  applicationName: BRAND_NAME,
  alternates: { canonical: "/ar/", languages: { "en-AE": "/", "ar-AE": "/ar/", "x-default": "/" } },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    type: "website",
    url: "/ar/",
    siteName: BRAND_NAME,
    title: AR.title,
    description: AR.description,
    locale: "ar_AE",
    alternateLocale: ["en_AE"],
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: AR.title }],
  },
  twitter: { card: "summary_large_image", title: AR.title, description: AR.description, images: ["/og.jpg"] },
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }] },
  ...(GSC_VERIFICATION ? { verification: { google: GSC_VERIFICATION } } : {}),
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f2e29" };

export default function ArabicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={arabicFontClassName}>
      <body className="[font-family:var(--font-ar),var(--font-gsf),ui-sans-serif,system-ui,sans-serif]">
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }} />
        <Analytics />
      </body>
    </html>
  );
}
