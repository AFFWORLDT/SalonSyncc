"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * The one-tap link from a sign-in or invite email (/l/?e=<email>&c=<code>). On a phone with the app installed the app
 * opens instead (App Links / Universal Links); here, on the web, it signs in with the code and goes home.
 */
export default function LinkSignIn() {
  const { loginWithCode } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const email = q.get("e") ?? "";
    const code = q.get("c") ?? "";
    // The code must not linger in the address bar or history.
    window.history.replaceState(null, "", "/l/");
    if (!email || !code) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("This link is incomplete. Sign in with your email or password.");
      return;
    }
    loginWithCode(undefined, email, code)
      .then(() => router.replace("/"))
      .catch((e) => setError(errorMessage(e, "This link has expired or was already used.")));
  }, [loginWithCode, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="grid max-w-sm gap-4 text-center">
        {error ? (
          <>
            <p className="text-base">{error}</p>
            <Button onClick={() => router.replace("/login/")}>Go to sign in</Button>
          </>
        ) : (
          <p className="text-muted-foreground">Signing you in…</p>
        )}
      </div>
    </main>
  );
}
