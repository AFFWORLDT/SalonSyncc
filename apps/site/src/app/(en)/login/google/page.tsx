"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ShaderBackdrop } from "@/components/ui/shader-backdrop";
import { SiteNav } from "@/components/nav";
import { GoogleMark } from "@/components/google-button";
import { googleRedirect, prepareGoogle, savePending } from "@/lib/google";
import { salonLoginUrl } from "@/lib/brand";
import { SLUG_RE, normalizeSlug } from "@/lib/slug";
import { track } from "@/lib/track";

/**
 * "Continue with Google" from a salon's own sign-in page (?org=<salon>): Google as a full-page redirect on
 * salonkit.online, then straight into the person's salon (or Start free for a new Google account).
 */
export default function GoogleSignIn() {
  const [state, setState] = useState<{ kind: "working" } | { kind: "stopped"; message: string | null }>({ kind: "working" });
  const [org, setOrg] = useState<string | null>(null);

  useEffect(() => {
    const o = normalizeSlug(new URLSearchParams(window.location.search).get("org") ?? "");
    const from = SLUG_RE.test(o) ? o : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrg(from);
    void (async () => {
      try {
        const f = await prepareGoogle();
        if (!f) return setState({ kind: "stopped", message: "Google sign-in isn't available right now. Use your email and password instead." });
        const r = await googleRedirect(f);
        if (r === "leaving") return;
        if (!r) return setState({ kind: "stopped", message: null });
        if (r.kind === "signed-in") {
          await track("login", { method: "google" });
          window.location.replace(r.url);
          return;
        }
        savePending({ idToken: r.idToken, email: r.email, name: r.name });
        window.location.replace(new URL("/signup/?google=1", window.location.href).href);
      } catch (e) {
        setState({ kind: "stopped", message: (e as Error).message });
      }
    })();
  }, []);

  const back = org ? salonLoginUrl(org) : "/login/";
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-24">
      <ShaderBackdrop />
      <SiteNav />
      <div className="glass relative z-10 grid w-full max-w-sm justify-items-center gap-4 rounded-2xl p-7 text-center">
        <GoogleMark className="size-9" />
        {state.kind === "working" ? (
          <>
            <h1 className="text-xl font-semibold">Signing you in with Google…</h1>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">{state.message ? "Google sign-in didn't finish" : "You didn't pick a Google account"}</h1>
            {state.message && (
              <p role="alert" className="text-sm text-destructive">
                {state.message}
              </p>
            )}
            <div className="grid w-full gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-black/10 bg-white text-[15px] font-medium text-[#1f1f1f] shadow-sm transition duration-150 ease-out hover:bg-[#f7f7f5] active:scale-[0.98]"
              >
                <GoogleMark />
                Try Google again
              </button>
              <a href={back} className="text-sm text-primary underline-offset-4 hover:underline">
                Back to sign in
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
