import type { Metadata, Viewport } from "next";
import { appFontClassName } from "@/lib/fonts";
import { BRAND_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${BRAND_NAME} — run your salon`, template: `%s · ${BRAND_NAME}` },
  description: "Sales, bills, staff commission, WhatsApp reminders and reports for salons. 7 days free.",
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f2e29" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appFontClassName}>
      <body>{children}</body>
    </html>
  );
}
