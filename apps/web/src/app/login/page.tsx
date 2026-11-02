"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lastOrg, useAuth } from "@/lib/auth-context";
import { salonFromHost } from "@/lib/host";
import { BRAND_NAME } from "@/lib/brand";
import { errorMessage } from "@/lib/api";
import { LogoBadge } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";

const TAGLINE = "Sales, bills and reports for your salon.";

export default function LoginPage() {
  const { user, loading: authLoading, login } = useAuth();
  const router = useRouter();
  // On the salon's own subdomain the host names the salon; elsewhere (workers.dev, localhost) the user types its ID.
  const [hostSalon, setHostSalon] = useState<string | null>(null);
  const [org, setOrg] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [authLoading, user, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHostSalon(salonFromHost(window.location.host));
    setOrg(lastOrg());
  }, []);
  const needOrg = hostSalon === null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(needOrg ? org : undefined, username.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-full grid-cols-1 bg-background lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col items-center justify-center gap-8 overflow-hidden border-r bg-card p-12 text-center lg:flex">
        <LogoBadge size={260} />
        <div>
          <p className="text-2xl font-semibold tracking-tight">{BRAND_NAME}</p>
          <p className="mx-auto mt-6 max-w-sm text-[0.9375rem] italic leading-relaxed text-muted-foreground">{TAGLINE}</p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[24rem]">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <LogoBadge size={128} />
            <p className="text-lg font-semibold tracking-tight">{BRAND_NAME}</p>
            <p className="text-sm italic text-muted-foreground">{TAGLINE}</p>
          </div>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">Welcome back.</h1>
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">Sign in with the username the admin gave you.</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-5">
            {needOrg && (
              <Field label="Salon ID" htmlFor="org">
                <Input
                  id="org"
                  autoComplete="organization"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  placeholder="e.g. superbeard"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  className="h-11"
                />
              </Field>
            )}
            <Field label="Username" htmlFor="username">
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={loading || !username || !password || (needOrg && !org.trim())}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
