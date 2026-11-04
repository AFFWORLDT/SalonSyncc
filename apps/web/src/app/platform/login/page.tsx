"use client";

import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/auth-ui";
import { errorMessage } from "@/lib/api";
import { papi } from "@/lib/platform";

/** Super admin sign-in (admin.<domain>/platform/login). */
export default function PlatformLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="glass w-full max-w-sm gap-5 p-6">
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <div>
            <h1 className="text-xl leading-tight font-semibold">Atlantic Portal</h1>
            <p className="text-sm text-muted-foreground">For the SalonKit team only.</p>
          </div>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await papi("/login", { body: { email: email.trim(), password } });
              window.location.href = "/platform/";
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <PasswordInput id="p-pass" label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
