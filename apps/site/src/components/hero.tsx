"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PulsingRing, ShaderBackdrop } from "@/components/ui/shader-backdrop";

/** Top of the home page: the moving teal-and-gold mesh, the SalonKit mark in its pulsing ring, and the trial button. */
export function Hero() {
  const up = "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700";
  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-28 text-[#fffdf8] sm:px-12">
      <ShaderBackdrop />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className={up}>
          <PulsingRing size={170}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the app icon */}
            <img src="/icon-192.png" alt="SalonKit" width={76} height={76} className="rounded-[20px] shadow-xl shadow-black/40" />
          </PulsingRing>
        </div>
        <h1 className={`${up} mt-8 text-balance text-5xl font-semibold tracking-tight [animation-delay:80ms] sm:text-7xl`}>Run your salon. We&apos;ll keep the books.</h1>
        <p className={`${up} mt-6 max-w-xl text-pretty text-lg leading-relaxed text-[#fffdf8]/80 [animation-delay:150ms]`}>
          The salon app made in Dubai, for UAE salons. Bills with VAT in seconds, staff commission worked out for you, the
          daily sheet and ledger kept to the fils, and WhatsApp reminders that bring customers back.
        </p>
        <div className={`${up} mt-10 flex flex-col items-center gap-4 [animation-delay:220ms]`}>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup/"
              className="inline-flex h-13 items-center gap-2 rounded-full bg-[#fffdf8] px-8 font-medium text-[#1c1b18] transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              Start free trial
              <ArrowRight className="size-5" aria-hidden />
            </Link>
            <Link
              href="/login/"
              className="inline-flex h-13 items-center rounded-full border border-[#fffdf8]/40 px-8 font-medium text-[#fffdf8] transition-colors duration-150 hover:bg-[#fffdf8]/10 active:scale-[0.97]"
            >
              Sign in
            </Link>
          </div>
          <span className="text-[13px] text-[#fffdf8]/65">7 days free · No card needed · Prices in AED</span>
        </div>
      </div>
    </section>
  );
}
