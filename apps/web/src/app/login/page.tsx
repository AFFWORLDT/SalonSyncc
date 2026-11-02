"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lastOrg, useAuth } from "@/lib/auth-context";
import { salonFromHost } from "@/lib/host";
import { BRAND_NAME } from "@/lib/brand";
import { api, clearSessionCaches, errorMessage } from "@/lib/api";
import { BrandLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthSplit, PasswordInput } from "@/components/ui/auth-ui";
import { LOGIN_SCENES, pickScene, type LoginScene } from "@/lib/login-scenes";

const TAGLINE = "Sales, bills and reports for your salon.";
const QUOTES = ["Every chair, every bill, one place.", "Welcome back. Your salon is ready.", "Less paperwork, more fresh cuts."];

export default function LoginPage() {
  const { user, loading: authLoading, login, refresh } = useAuth();
  const router = useRouter();
  // On the salon's own subdomain the host names the salon; elsewhere (workers.dev, localhost) the user types its ID.
  const [hostSalon, setHostSalon] = useState<string | null>(null);
  const [org, setOrg] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A sign-in link in the address bar is checked first; a cached session must not skip past its outcome.
  const [handingOff, setHandingOff] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("handoff"));
  useEffect(() => {
    if (!authLoading && user && !handingOff) router.replace("/");
  }, [authLoading, user, router, handingOff]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHostSalon(salonFromHost(window.location.host));
    const q = new URLSearchParams(window.location.search);
    setOrg(q.get("org") ?? lastOrg());
    // Fresh from signup: a single-use link signs the owner straight in.
    const handoff = q.get("handoff");
    if (handoff) {
      setLoading(true);
      api("/api/auth/handoff", { body: { token: handoff, org: q.get("org") ?? undefined }, redirectOn401: false })
        .then(() => refresh())
        .then(() => router.replace("/"))
        .catch(async (e) => {
          // The link is spent or expired: whatever session this browser cached is not trustworthy now.
          clearSessionCaches();
          await refresh();
          setHandingOff(false);
          window.history.replaceState(null, "", window.location.pathname + (q.get("org") ? `?org=${encodeURIComponent(q.get("org")!)}` : ""));
          setError(errorMessage(e, "This sign-in link has expired. Sign in with your password."));
          setLoading(false);
        });
    }
  }, [refresh, router]);
  const needOrg = hostSalon === null;
  // A different salon photo (and matching moving background) on every visit; chosen after mount (static export).
  const [scene, setScene] = useState<LoginScene | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScene(LOGIN_SCENES[pickScene()]!);
  }, []);

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
    <AuthSplit
      scene={scene}
      quote={{ text: QUOTES, author: BRAND_NAME }}
    >
      <div className="mx-auto grid w-full max-w-[350px] gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo />
          <h1 className="text-2xl font-bold">Sign in to your salon</h1>
          <p className="text-balance text-sm text-muted-foreground">
            {needOrg ? "Enter your salon ID and the username your salon gave you." : "Sign in with the username your salon gave you."}
          </p>
        </div>

        <form onSubmit={submit} autoComplete="on" className="grid gap-4">
          {needOrg && (
            <div className="grid gap-2">
              <Label htmlFor="org">Salon ID</Label>
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
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
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
          </div>
          <PasswordInput id="password" label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-2 h-12 w-full text-base" disabled={loading || !username || !password || (needOrg && !org.trim())}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">{TAGLINE}</p>
      </div>
    </AuthSplit>
  );
}
