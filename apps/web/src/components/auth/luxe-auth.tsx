"use client";

import * as React from "react";
import { useState } from "react";
import { Manrope } from "next/font/google";
import { CalendarCheck, ChartNoAxesCombined, Eye, EyeOff, MessageCircle, UsersRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LoginScene } from "@/lib/login-scenes";

/**
 * The dark luxury sign-in frame: one salon photograph full screen (a different one each visit), the SalonKit pitch on
 * the left and a dark glass card on the right (lg and up). Below lg the photo becomes a short header and the card
 * sits under it. Colours are fixed here (espresso / champagne) whatever the app theme is.
 */

const manrope = Manrope({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-lux", display: "swap" });

const TOKENS = `
.lux{--lux-espresso:#211A17;--lux-dark:#171310;--lux-gold:#D9AD78;--lux-gold-light:#EAC99C;--lux-ivory:#F7F1E8;--lux-muted:#C5BBB0;--lux-border:rgba(255,255,255,0.15);color-scheme:dark}
.lux.lux h1,.lux.lux h2,.lux .lux-display{font-family:var(--font-lux),var(--font-gsf),sans-serif;font-weight:700;letter-spacing:-0.02em}
.lux.lux h2{line-height:1.08}
.lux.lux h1{line-height:1.2}
.lux input[type="password"]::-ms-reveal,.lux input[type="password"]::-ms-clear{display:none}
.lux input:-webkit-autofill{-webkit-text-fill-color:#fff;caret-color:#fff;transition:background-color 9999s ease-out 0s}
`;

const FEATURES: { icon: LucideIcon; label: string }[] = [
  { icon: CalendarCheck, label: "Bookings" },
  { icon: ChartNoAxesCombined, label: "Reports" },
  { icon: UsersRound, label: "Staff" },
  { icon: MessageCircle, label: "Reminders" },
];

export function LuxeAuth({ scene, brandName, children }: { scene: LoginScene | null; brandName: string; children: React.ReactNode }) {
  return (
    <div className={cn(manrope.variable, "lux relative isolate min-h-svh w-full overflow-x-hidden bg-[var(--lux-dark)] text-white lg:h-svh lg:overflow-hidden")}>
      <style>{TOKENS}</style>

      {/* The photograph: full screen on lg, a 38svh header below that. */}
      <div aria-hidden={!scene} className="absolute inset-x-0 top-0 -z-10 h-[38svh] min-h-[260px] overflow-hidden lg:inset-0 lg:h-auto">
        {scene && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={scene.src}
            src={scene.src}
            alt={scene.alt}
            className="h-full w-full animate-in object-cover fade-in duration-700 motion-reduce:animate-none"
            style={{ objectPosition: scene.pos }}
          />
        )}
        {/* Readability: darker behind the headline, darkest under the card; a floor fade at the bottom. */}
        <div className="absolute inset-0 hidden lg:block" style={{ background: "linear-gradient(90deg, rgba(23,19,16,0.72) 0%, rgba(23,19,16,0.5) 38%, rgba(23,19,16,0.62) 58%, rgba(23,19,16,0.86) 100%)" }} />
        <div className="absolute inset-0 hidden lg:block" style={{ background: "radial-gradient(120% 90% at 30% 50%, transparent 40%, rgba(23,19,16,0.55) 100%)" }} />
        <div className="absolute inset-0 lg:hidden" style={{ background: "linear-gradient(180deg, rgba(23,19,16,0.55) 0%, rgba(23,19,16,0.45) 45%, #171310 100%)" }} />
      </div>

      <div className="mx-auto grid min-h-svh w-full max-w-[1440px] lg:h-svh lg:min-h-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <BrandPanel brandName={brandName} />
        <div className="flex items-start justify-center px-4 pb-8 sm:px-6 lg:min-h-0 lg:items-center lg:overflow-y-auto lg:px-10 lg:py-6">{children}</div>
      </div>
    </div>
  );
}

function BrandPanel({ brandName }: { brandName: string }) {
  return (
    <section className="flex flex-col px-5 pt-6 pb-8 sm:px-8 lg:min-h-0 lg:px-14 lg:py-10 xl:px-20">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.png" alt="" width={40} height={40} className="size-9 rounded-full ring-1 ring-[var(--lux-gold)]/70 lg:size-11" />
        <span className="lux-display text-xl lg:text-[26px]">{brandName}</span>
      </div>
      <div className="mt-[11svh] lg:my-auto lg:pb-[6vh]">
        <h2 className="text-[34px] text-[#FBF7F1] sm:text-[42px] lg:text-[clamp(42px,4.1vw,60px)]">
          Run your salon
          <br />
          with <span className="text-[var(--lux-gold)]">{brandName}</span>
        </h2>
        <p className="mt-4 hidden max-w-[440px] text-[17px] leading-relaxed text-[var(--lux-muted)] sm:block lg:mt-5 lg:text-lg">
          Billing, staff, commissions, reports and WhatsApp reminders — all in one place.
        </p>
        <ul className="mt-8 hidden gap-3 lg:flex">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex w-[92px] flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[rgba(23,19,16,0.55)] px-2 pt-3.5 pb-3 backdrop-blur-md">
              <Icon className="size-6 text-[var(--lux-gold)]" strokeWidth={1.6} aria-hidden />
              <span className="text-[13px] font-medium text-white/90">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The dark glass card that holds the form. */
export function LuxeCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[min(480px,100%)] animate-in rounded-[26px] border border-white/15 bg-[rgba(30,25,22,0.84)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[20px] fade-in slide-in-from-bottom-3 duration-500 motion-reduce:animate-none sm:p-9 lg:my-auto short:px-8 short:py-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-[26px] bg-gradient-to-b from-white/[0.06] to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
}

const FIELD =
  "peer h-11 w-full rounded-[14px] border border-white/15 bg-white/[0.04] ps-11 pe-4 text-[15px] text-white outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-white/45 hover:border-white/25 focus:border-[var(--lux-gold)] focus:bg-white/[0.06] focus:ring-[3px] focus:ring-[var(--lux-gold)]/20 read-only:opacity-70";

/** A dark input with a leading icon. The label stays for screen readers (and tests); the placeholder shows it. */
export const LuxeField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: LucideIcon; inputClassName?: string }>(
  ({ label, icon: Icon, id, className, inputClassName, ...props }, ref) => (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input ref={ref} id={id} placeholder={label} className={cn(FIELD, inputClassName)} {...props} />
      <Icon className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-white/55 transition-colors peer-focus:text-[var(--lux-gold)]" strokeWidth={1.7} aria-hidden />
    </div>
  )
);
LuxeField.displayName = "LuxeField";

/** LuxeField for passwords, with a show/hide eye. */
export function LuxePassword(props: Omit<React.ComponentProps<typeof LuxeField>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <LuxeField {...props} type={show ? "text" : "password"} inputClassName="pe-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 end-0 flex w-12 items-center justify-center rounded-e-[14px] text-white/55 transition-colors hover:text-white focus-visible:text-[var(--lux-gold)] focus-visible:outline-none"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-[18px]" strokeWidth={1.7} aria-hidden /> : <Eye className="size-[18px]" strokeWidth={1.7} aria-hidden />}
      </button>
    </div>
  );
}

/** "—— OR SIGN IN WITH PASSWORD ——" */
export function LuxeDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[11.5px] font-medium tracking-[0.12em] text-white/55 uppercase" aria-hidden>
      <span className="h-px flex-1 bg-white/15" />
      {children}
      <span className="h-px flex-1 bg-white/15" />
    </div>
  );
}
