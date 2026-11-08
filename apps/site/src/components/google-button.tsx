"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { continueWithGoogle, prepareGoogle, savePending, type GoogleResult } from "@/lib/google";
import { track } from "@/lib/track";

/** Google's four-colour "G". */
export function GoogleMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google": a known person goes straight into their salon; a new Google account goes to sign-up with its
 * email filled in (onNew on the sign-up page, otherwise /signup/). Hidden until the server has Google settings.
 */
export function GoogleButton({ onNew, label = "Continue with Google", divider }: { onNew?: (r: Extract<GoogleResult, { kind: "new" }>) => void; label?: string; divider?: "before" | "after" }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void prepareGoogle().then((f) => live && setOn(!!f));
    return () => {
      live = false;
    };
  }, []);

  if (!on) return null;

  async function go() {
    setError(null);
    setBusy(true);
    try {
      const f = await prepareGoogle();
      const r = f && (await continueWithGoogle(f));
      if (!r) return setBusy(false);
      if (r.kind === "signed-in") {
        await track("login", { method: "google" });
        window.location.assign(r.url);
        return;
      }
      setBusy(false);
      if (onNew) return onNew(r);
      savePending({ idToken: r.idToken, email: r.email, name: r.name });
      window.location.assign(new URL("/signup/?google=1", window.location.href).href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      {divider === "before" && <OrDivider />}
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-black/10 bg-white text-[15px] font-medium text-[#1f1f1f] shadow-sm transition duration-150 ease-out hover:bg-[#f7f7f5] active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <GoogleMark />}
        {label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {divider === "after" && <OrDivider />}
    </div>
  );
}

/** "or" between the Google button and the form. */
function OrDivider() {
  return (
    <div className="my-2 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground" aria-hidden>
      <span className="h-px flex-1 bg-current opacity-25" />
      or
      <span className="h-px flex-1 bg-current opacity-25" />
    </div>
  );
}
