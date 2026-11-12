import type { Metadata } from "next";
import Link from "next/link";
import { appFontClassName } from "@/lib/fonts";
import "./globals.css";
import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "Page not found · SalonKit", robots: { index: false, follow: true } };

/** The branded 404 page for any unknown address (the site has two root layouts, so this one brings its own <html>). */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={appFontClassName}>
      <body>
      <SiteNav />
      <main className="px-5 pt-40 pb-28 text-center">
        <p className="sk-eyebrow">404</p>
        <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">We couldn&apos;t find that page</h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">The link may be old or mistyped. These will get you back on track:</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="sk-btn sk-btn-dark">Home</Link>
          <Link href="/pricing/" className="sk-btn sk-btn-ghost">Pricing</Link>
          <Link href="/blog/" className="sk-btn sk-btn-ghost">Blog</Link>
        </div>
      </main>
      <SiteFooter />
      </body>
    </html>
  );
}
