"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Info } from "lucide-react";
import type { HomeCopy } from "./copy";

type S = "confirmed" | "unsubscribed" | "invalid";

/** /newsletter/?s=… : where the confirm and unsubscribe links land. */
export function NewsletterStatus({ t, home }: { t: HomeCopy["newsletter"]; home: string }) {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("s");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the query string once after mount (static export)
    setS(v === "confirmed" || v === "unsubscribed" ? v : "invalid");
  }, []);
  if (!s) return <div className="min-h-40" />;
  const ok = s !== "invalid";
  return (
    <div className="sk-card mx-auto max-w-lg p-10 text-center">
      <span className={`mx-auto grid size-14 place-items-center rounded-full ${ok ? "bg-[#a7b8a1]/30 text-[#3f5a3a]" : "bg-[#f5e5d2] text-[#8a5a22]"}`}>
        {ok ? <CheckCircle2 className="size-7" aria-hidden /> : <Info className="size-7" aria-hidden />}
      </span>
      <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.03em]">{t.pageTitle}</h1>
      <p role="status" className="mt-3 text-lg text-muted-foreground">{t[s]}</p>
      <Link href={home} className="sk-btn sk-btn-dark mt-8">
        {t.back}
      </Link>
    </div>
  );
}
