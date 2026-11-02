import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";

/** Top bar over the hero: the mark, pricing, sign in and the trial button. */
export function SiteNav({ dark = true }: { dark?: boolean }) {
  const tone = dark ? "text-white/85 hover:text-white" : "text-foreground/70 hover:text-foreground";
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className={`flex items-center gap-2 font-semibold ${dark ? "text-white" : "text-foreground"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.png" alt="" width={32} height={32} className="size-8 rounded-full bg-black" />
          {BRAND_NAME}
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/pricing/" className={`hidden rounded-full px-3 py-2 sm:inline ${tone}`}>
            Pricing
          </Link>
          <Link href="/login/" className={`rounded-full px-3 py-2 ${tone}`}>
            Sign in
          </Link>
          <Link href="/signup/" className={`rounded-full px-4 py-2 font-medium ${dark ? "bg-white text-[#1c1b18]" : "bg-primary text-primary-foreground"}`}>
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}
