"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export type NewsletterCopy = { title: string; lead: string; placeholder: string; button: string; sending: string; done: string; error: string; privacy: string };

/** Footer newsletter: double opt-in (we email a confirm link). A hidden "website" field catches bots. */
export function NewsletterForm({ t, lang }: { t: NewsletterCopy; lang: "en" | "ar" }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const r = await fetch("/api/public/newsletter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, lang, website }) });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error || t.error);
      setState("done");
    } catch (err) {
      setMsg((err as Error).message || t.error);
      setState("error");
    }
  }
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-[0.12em] text-[#d9ad78] uppercase">{t.title}</h2>
      <p className="mt-3 text-[15px] text-[#f7f1e8]/65">{t.lead}</p>
      {state === "done" ? (
        <p role="status" className="mt-4 flex items-start gap-2 text-[15px] text-[#f7f1e8]">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#d9ad78]" aria-hidden />
          {t.done}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4">
          <label htmlFor="nl-email" className="sr-only">
            {t.placeholder}
          </label>
          <div className="flex rounded-full border border-white/15 bg-white/5 p-1 focus-within:border-[#d9ad78]">
            <input
              id="nl-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.placeholder}
              className="min-w-0 flex-1 bg-transparent px-4 text-[15px] text-[#f7f1e8] placeholder:text-[#f7f1e8]/40 focus:outline-none"
            />
            <button type="submit" disabled={state === "sending"} className="sk-btn sk-btn-gold min-h-10 shrink-0 px-4 text-sm" aria-label={t.button}>
              {state === "sending" ? t.sending : t.button}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </button>
          </div>
          <input tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          {state === "error" && (
            <p role="alert" className="mt-2 text-sm text-[#f3b0a4]">
              {msg}
            </p>
          )}
          <p className="mt-2 text-xs text-[#f7f1e8]/45">{t.privacy}</p>
        </form>
      )}
    </div>
  );
}
