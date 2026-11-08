"use client";

import { useState } from "react";
import { SiteNav } from "@/components/nav";
import { ShaderBackdrop } from "@/components/ui/shader-backdrop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salonLoginUrl } from "@/lib/brand";
import { SLUG_RE, normalizeSlug } from "@/lib/slug";
import { GoogleButton } from "@/components/google-button";

/** Sign in from the main site: Continue with Google (straight into the salon), or the salon ID then the salon's own sign-in page. */
export default function SiteLogin() {
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-24">
      <ShaderBackdrop />
      <SiteNav />
      <form
        className="glass relative z-10 w-full max-w-sm rounded-2xl p-7"
        onSubmit={(e) => {
          e.preventDefault();
          const slug = normalizeSlug(id);
          if (!SLUG_RE.test(slug)) return setError("Enter your salon ID, e.g. superbeard");
          window.location.assign(salonLoginUrl(slug));
        }}
      >
        <h1 className="text-2xl font-semibold">Sign in to your salon</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your salon ID is the first part of your salon&apos;s address.</p>
        <div className="mt-6 grid gap-2">
          <GoogleButton divider="after" />
          <Label htmlFor="salon-id">Salon ID</Label>
          <Input id="salon-id" value={id} onChange={(e) => (setId(e.target.value), setError(null))} placeholder="superbeard" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-11" />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" className="mt-5 h-11 w-full">
          Continue
        </Button>
      </form>
    </main>
  );
}
