import type { Metadata, Viewport } from "next";
import { appFontClassName } from "@/lib/fonts";
import { BRAND_NAME } from "@/lib/brand";
import { Analytics } from "@/components/analytics";
import { GSC_VERIFICATION, SEO_DESCRIPTION, SEO_KEYWORDS, SEO_TITLE, SITE_URL, structuredData } from "@/lib/seo";
import "../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SEO_TITLE, template: `%s · ${BRAND_NAME}` },
  description: SEO_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  applicationName: BRAND_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    type: "website",
    url: "/",
    siteName: BRAND_NAME,
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    locale: "en_AE",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: `${BRAND_NAME}: salon software for the UAE` }],
  },
  twitter: { card: "summary_large_image", title: SEO_TITLE, description: SEO_DESCRIPTION, images: ["/og.jpg"] },
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }] },
  ...(GSC_VERIFICATION ? { verification: { google: GSC_VERIFICATION } } : {}),
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f1e8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appFontClassName}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }} />
        <Analytics />
      </body>
    </html>
  );
}
