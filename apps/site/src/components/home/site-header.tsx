"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { HomeCopy, Link as NavLink } from "./copy";

/** One dropdown: opens on hover and keyboard focus (CSS), and on tap/click (state) for touch screens. */
function Dropdown({ label, items, wide }: { label: string; items: NavLink[]; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full px-3 py-2 text-[15px] text-foreground/75 transition-colors hover:text-foreground"
      >
        {label}
        <ChevronDown className="size-4 opacity-60 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" aria-hidden />
      </button>
      <div
        className={cn(
          "invisible absolute top-full pt-3 opacity-0 transition duration-200 ease-out group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ltr:left-1/2 ltr:-translate-x-1/2 rtl:right-1/2 rtl:translate-x-1/2",
          open && "visible opacity-100"
        )}
      >
        <ul className={cn("sk-card grid gap-1 p-2", wide ? "w-[34rem] grid-cols-2" : "w-72")}>
          {items.map((it) => (
            <li key={it.href + it.label}>
              <Link href={it.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 transition-colors hover:bg-[#f5e9da]">
                <span className="block text-[15px] font-semibold">{it.label}</span>
                {it.desc && <span className="mt-0.5 block text-[13px] text-muted-foreground">{it.desc}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The site header: transparent over the hero, ivory glass once you scroll, dropdowns on desktop, a full menu on phones. */
export function SiteHeader({ t }: { t: Pick<HomeCopy, "lang" | "home" | "nav"> }) {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [menu]);
  const n = t.nav;
  return (
    <header className={cn("fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300", scrolled && "bg-[#f7f1e8]/80 shadow-[0_1px_0_rgb(72_52_35/0.1)] backdrop-blur-xl")}>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link href={t.home} className="flex items-center gap-2.5 text-lg font-bold tracking-tight font-display">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
          <img src="/brand/mark.png" alt="" width={36} height={36} className="size-9 rounded-full bg-black shadow-md" />
          {BRAND_NAME}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          <Dropdown label={n.product} items={n.productItems} />
          <Dropdown label={n.features} items={n.featureItems} wide />
          <Link href={t.lang === "ar" ? "/ar/#pricing" : "/pricing/"} className="rounded-full px-3 py-2 text-[15px] text-foreground/75 transition-colors hover:text-foreground">
            {n.pricing}
          </Link>
          <Dropdown label={n.resources} items={n.resourceItems} />
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href={n.other.href} hrefLang={n.other.hrefLang} lang={n.other.lang} className="hidden rounded-full px-3 py-2 text-[15px] text-foreground/75 hover:text-foreground sm:inline">
            {n.other.label}
          </Link>
          <Link href="/login/" className="hidden rounded-full px-3 py-2 text-[15px] font-medium text-foreground/80 hover:text-foreground md:inline">
            {n.signIn}
          </Link>
          <Link href="/signup/" className="sk-btn sk-btn-dark hidden min-h-11 px-5 text-sm sm:inline-flex">
            {n.start}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
          <button type="button" onClick={() => setMenu(true)} aria-label={n.menu} className="grid size-11 place-items-center rounded-full border border-foreground/10 bg-white/60 lg:hidden">
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={n.menu}>
          <button type="button" aria-label={n.close} className="absolute inset-0 bg-[#211a17]/40 backdrop-blur-sm" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 w-[min(88vw,380px)] overflow-y-auto bg-[#f7f1e8] p-6 shadow-2xl animate-in duration-300 ltr:right-0 ltr:slide-in-from-right rtl:left-0 rtl:slide-in-from-left">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold font-display">{BRAND_NAME}</span>
              <button type="button" onClick={() => setMenu(false)} aria-label={n.close} className="grid size-11 place-items-center rounded-full border border-foreground/10 bg-white">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {[
              [n.product, n.productItems],
              [n.features, n.featureItems],
              [n.resources, n.resourceItems],
            ].map(([title, items]) => (
              <div key={title as string} className="mt-7">
                <p className="text-xs font-semibold tracking-[0.14em] text-[#946226] uppercase">{title as string}</p>
                <ul className="mt-2 grid">
                  {(items as NavLink[]).map((it) => (
                    <li key={it.href + it.label}>
                      <Link href={it.href} onClick={() => setMenu(false)} className="block rounded-xl py-2.5 text-[16px] font-medium">
                        {it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="mt-8 grid gap-3">
              <Link href="/signup/" onClick={() => setMenu(false)} className="sk-btn sk-btn-dark w-full">
                {n.start}
              </Link>
              <Link href="/login/" onClick={() => setMenu(false)} className="sk-btn sk-btn-ghost w-full">
                {n.signIn}
              </Link>
              <Link href={n.other.href} hrefLang={n.other.hrefLang} lang={n.other.lang} className="py-2 text-center text-[15px] text-foreground/75">
                {n.other.label}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
