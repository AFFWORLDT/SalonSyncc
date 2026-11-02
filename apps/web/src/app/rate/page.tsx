"use client";

import { useEffect, useState } from "react";

/** WhatsApp's "Rate your visit" button always opens production; a staging bill's token comes marked "s.". */
const STAGING = "fm-salon-staging.affworld0.workers.dev";

/**
 * "Rate your visit" from the WhatsApp message (/rate/?t=<bill token>). The salon wants reviews on Google
 * (owner request 2026-10-30), so this only hands over to /api/public/review/<token>, which notes the tap
 * on the bill and redirects to the salon's Google review page.
 */
export default function RatePage() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let t = new URLSearchParams(window.location.search).get("t") ?? "";
    if (t.startsWith("s.")) {
      if (window.location.host !== STAGING && window.location.hostname !== "localhost") {
        window.location.replace(`https://${STAGING}/rate/?t=${encodeURIComponent(t)}`);
        return;
      }
      t = t.slice(2);
    }
    const to = `/api/public/review/${encodeURIComponent(t || "none")}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHref(to);
    window.location.replace(to);
  }, []);

  return (
    <div className="flex min-h-full justify-center bg-gradient-to-b from-zinc-900 via-zinc-900 to-background px-4 pt-16 pb-12">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-white shadow-lg ring-4 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" className="size-20 object-contain" />
        </div>
        <p className="mt-3 text-sm font-semibold tracking-wide text-white">Faizan Mohammed Gents Salon</p>
        <p className="mt-8 text-sm text-zinc-300" aria-live="polite">
          Opening Google reviews…
        </p>
        {href && (
          <a href={href} className="mt-3 text-xs text-zinc-400 underline underline-offset-4">
            Not opening? Tap here
          </a>
        )}
      </div>
    </div>
  );
}
