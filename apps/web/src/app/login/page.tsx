"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lastOrg, useAuth } from "@/lib/auth-context";
import { salonFromHost } from "@/lib/host";
import { BRAND_NAME, ROOT_DOMAIN } from "@/lib/brand";
import { Mail } from "lucide-react";
import { GoogleMark } from "@/components/ui/google-mark";
import { api, clearSessionCaches, errorMessage } from "@/lib/api";
import { BrandLogo, LogoBadge } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthSplit, PasswordInput } from "@/components/ui/auth-ui";
import { LOGIN_SCENES, pickScene, type LoginScene } from "@/lib/login-scenes";
import { nextPath } from "@/lib/next-path";
import { TURNSTILE_SITE_KEY, mountTurnstile } from "@/lib/turnstile";

const TAGLINE = "Sales, bills and reports for your salon.";
const QUOTES = ["Every chair, every bill, one place.", "Welcome back. Your salon is ready.", "Less paperwork, more fresh cuts."];

export default function LoginPage() {
  const { user, loading: authLoading, login, loginWithCode, refresh } = useAuth();
  const router = useRouter();
  // On the salon's own subdomain the host names the salon; elsewhere (workers.dev, localhost) the user types its ID.
  const [hostSalon, setHostSalon] = useState<string | null>(null);
  const [org, setOrg] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Sign in with a code emailed to the staff member instead of a password: email first, then the 6 digits.
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Cloudflare Turnstile (bot check) for password sign-in and emailing a code. Each token works once.
  const widget = useRef<HTMLDivElement>(null);
  const [human, setHuman] = useState("");
  const needHuman = !!TURNSTILE_SITE_KEY && !human;
  // The form renders after the auth check: mount the widget when its box appears.
  const widgetBox = (el: HTMLDivElement | null) => {
    widget.current = el;
    if (el && !el.dataset.mounted) {
      el.dataset.mounted = "1";
      mountTurnstile(el, setHuman);
    }
  };
  const newCheck = () => {
    if (!TURNSTILE_SITE_KEY) return;
    setHuman("");
    window.turnstile?.reset();
  };
  // The salon's own name and logo (GET /api/public/brand), so its team sees their salon, not SalonKit.
  // undefined while loading on a salon host (nothing drawn, so the SalonKit logo never flashes first).
  const [brand, setBrand] = useState<{ name: string | null; logo_url: string | null } | null | undefined>(undefined);

  // A sign-in link in the address bar is checked first; a cached session must not skip past its outcome.
  const [handingOff, setHandingOff] = useState(() => typeof window !== "undefined" && (new URLSearchParams(window.location.search).has("handoff") || new URLSearchParams(window.location.search).has("support")));
  useEffect(() => {
    if (!authLoading && user && !handingOff) router.replace(nextPath(window.location.search));
  }, [authLoading, user, router, handingOff]);

  useEffect(() => {
    const host = salonFromHost(window.location.host);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHostSalon(host);
    const q = new URLSearchParams(window.location.search);
    const brandOrg = host ? "" : (q.get("org") ?? lastOrg());
    if (host || brandOrg) {
      api<{ name: string | null; logo_url: string | null }>(`/api/public/brand${host ? "" : `?org=${encodeURIComponent(brandOrg)}`}`, { redirectOn401: false })
        .then((b) => setBrand(b.name ? b : null))
        .catch(() => setBrand(null));
    } else setBrand(null);
    setOrg(q.get("org") ?? lastOrg());
    // Fresh from signup: a single-use link signs the owner straight in.
    // Or a support link from the SalonKit admin panel (Log in as salon): same single-use flow, a 2-hour session.
    const handoff = q.get("handoff");
    const support = q.get("support");
    if (handoff || support) {
      setLoading(true);
      const org = q.get("org") ?? undefined;
      api(handoff ? "/api/auth/handoff" : "/api/auth/support", { body: handoff ? { token: handoff, org } : { code: support, org }, redirectOn401: false })
        .then(() => refresh())
        .then(() => router.replace(nextPath(window.location.search)))
        .catch(async (e) => {
          // The link is spent or expired: whatever session this browser cached is not trustworthy now.
          clearSessionCaches();
          await refresh();
          setHandingOff(false);
          window.history.replaceState(null, "", window.location.pathname + (q.get("org") ? `?org=${encodeURIComponent(q.get("org")!)}` : ""));
          setError(errorMessage(e, handoff ? "This sign-in link has expired. Sign in with your password." : "This support link has expired."));
          setLoading(false);
        });
    }
  }, [refresh, router]);
  const needOrg = hostSalon === null;
  // "Continue with Google" runs on salonkit.online (Firebase allows listed domains only, not every salon's address),
  // then comes back here signed in. Shown once the server has Google settings.
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    if (!hostSalon || !ROOT_DOMAIN) return;
    let live = true;
    api<{ google: boolean }>("/api/public/auth-config", { redirectOn401: false })
      .then((c) => live && setGoogle(!!c.google))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [hostSalon]);
  const googleUrl = hostSalon && ROOT_DOMAIN ? `https://${ROOT_DOMAIN}/login/google/?org=${encodeURIComponent(hostSalon)}` : null;
  // A different salon photo (and matching moving background) on every visit; chosen after mount (static export).
  const [scene, setScene] = useState<LoginScene | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScene(LOGIN_SCENES[pickScene()]!);
  }, []);

  function switchMode(m: "password" | "code") {
    setMode(m);
    setError(null);
    setNotice(null);
    setCodeSent(false);
    setCode("");
  }

  async function sendCode() {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const body: Record<string, string> = { email: email.trim() };
      if (needOrg) body.org = org.trim().toLowerCase();
      if (human) body.turnstile = human;
      await api("/api/auth/code", { body, redirectOn401: false });
      setCodeSent(true);
      setNotice(`If ${email.trim()} is on your staff profile, a 6-digit code is on its way. It works for 10 minutes.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      newCheck();
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "code" && !codeSent) return sendCode();
    setError(null);
    setLoading(true);
    try {
      if (mode === "code") await loginWithCode(needOrg ? org : undefined, email.trim(), code.replace(/\s+/g, ""));
      else await login(needOrg ? org : undefined, username.trim(), password, human || undefined);
      router.replace(nextPath(window.location.search));
    } catch (err) {
      setError(errorMessage(err));
      if (mode === "password") newCheck();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplit
      scene={scene}
      quote={{ text: QUOTES, author: brand?.name ?? BRAND_NAME }}
    >
      <div className="mx-auto grid w-full max-w-[350px] gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {brand === undefined ? (
            <div className="h-24" aria-hidden />
          ) : brand?.logo_url ? (
            <LogoBadge src={brand.logo_url} alt={brand.name ?? ""} size={96} />
          ) : (
            <BrandLogo />
          )}
          <h1 className="text-[28px] leading-tight">{brand?.name ? `Sign in to ${brand.name}` : "Sign in to your salon"}</h1>
          <p className="text-balance text-sm text-muted-foreground">
            {mode === "code" ? "We\u2019ll email a sign-in code to the address on your staff profile." : needOrg ? "Enter your salon ID, then your email or the username your salon gave you." : "Sign in with your email or the username your salon gave you."}
          </p>
        </div>

        {mode === "password" && (
          <div className="-mb-3 grid gap-3">
            {google && googleUrl && (
              <a
                href={googleUrl}
                className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-black/10 bg-white text-[15px] font-medium text-[#1f1f1f] shadow-sm transition duration-150 ease-out hover:bg-[#f7f7f5] active:scale-[0.98]"
              >
                <GoogleMark />
                Continue with Google
              </a>
            )}
            <Button type="button" variant="outline" size="lg" className="h-12 w-full gap-2.5 text-[15px]" onClick={() => switchMode("code")}>
              <Mail className="size-5" />
              Email me a sign-in code
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
              <span className="h-px flex-1 bg-current opacity-25" />
              <span className="rounded-full bg-muted px-3.5 py-1 text-[13px]">or use your password</span>
              <span className="h-px flex-1 bg-current opacity-25" />
            </div>
          </div>
        )}
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
                className="h-12 rounded-full px-5"
              />
            </div>
          )}
          {mode === "password" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="username">Email or username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-12 rounded-full px-5"
                />
              </div>
              <PasswordInput id="password" label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-full ps-5" />
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  readOnly={codeSent}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-full px-5"
                />
              </div>
              {codeSent && (
                <div className="grid gap-2">
                  <Label htmlFor="code">6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]*"
                    maxLength={7}
                    required
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="h-12 rounded-full text-center font-mono text-xl tracking-[0.4em]"
                  />
                </div>
              )}
            </>
          )}
          {TURNSTILE_SITE_KEY && <div ref={widgetBox} className="min-h-[65px]" data-testid="turnstile" />}
          {notice && !error && <p className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">{notice}</p>}
          {error && (
            <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="mt-2 h-12 w-full text-base"
            disabled={
              loading ||
              (needOrg && !org.trim()) ||
              (mode === "password" ? !username || !password || needHuman : !email.trim() || (codeSent ? code.replace(/\s+/g, "").length !== 6 : needHuman))
            }
          >
            {loading ? (mode === "code" && !codeSent ? "Sending…" : "Signing in…") : mode === "code" && !codeSent ? "Email me a code" : "Sign in"}
          </Button>
          {mode === "code" && codeSent && (
            <Button type="button" variant="ghost" disabled={loading || needHuman} onClick={sendCode}>
              Send a new code
            </Button>
          )}
          {mode === "code" && (
            <Button type="button" variant="link" className="justify-self-center" onClick={() => switchMode("password")}>
              Sign in with your password instead
            </Button>
          )}
        </form>
        <p className="text-center text-xs text-muted-foreground">{TAGLINE}</p>
      </div>
    </AuthSplit>
  );
}
