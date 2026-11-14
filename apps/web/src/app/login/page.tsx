"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lastOrg, useAuth } from "@/lib/auth-context";
import { salonFromHost } from "@/lib/host";
import { BRAND_NAME, ROOT_DOMAIN } from "@/lib/brand";
import { ArrowRight, Check, KeyRound, Loader2, Lock, Mail, Store } from "lucide-react";
import { GoogleMark } from "@/components/ui/google-mark";
import { api, clearSessionCaches, errorMessage } from "@/lib/api";
import { LogoBadge } from "@/components/logo";
import { LuxeAuth, LuxeCard, LuxeDivider, LuxeField, LuxePassword } from "@/components/auth/luxe-auth";
import { cn } from "@/lib/utils";
import { LOGIN_SCENES, pickScene, type LoginScene } from "@/lib/login-scenes";
import { nextPath } from "@/lib/next-path";
import { TURNSTILE_SITE_KEY, mountTurnstile } from "@/lib/turnstile";

/** "Remember me": the email or username is kept in this browser and filled in next time (sessions are unchanged). */
const REMEMBER = "ss_login_user";

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
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUsername((u) => u || saved);
        setRemember(true);
      }
    } catch {}
  }, []);
  // Cloudflare Turnstile (bot check) for password sign-in and emailing a code. Each token works once.
  const widget = useRef<HTMLDivElement>(null);
  const [human, setHuman] = useState("");
  const needHuman = !!TURNSTILE_SITE_KEY && !human;
  // The form renders after the auth check: mount the widget when its box appears.
  const widgetBox = (el: HTMLDivElement | null) => {
    widget.current = el;
    if (el && !el.dataset.mounted) {
      el.dataset.mounted = "1";
      mountTurnstile(el, setHuman, "dark");
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
    // Carry a typed email across, so "Email me a code" / "Forgot password?" needs no retyping.
    if (m === "code" && !email && username.includes("@")) setEmail(username.trim());
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
      else {
        await login(needOrg ? org : undefined, username.trim(), password, human || undefined);
        try {
          if (remember) localStorage.setItem(REMEMBER, username.trim());
          else localStorage.removeItem(REMEMBER);
        } catch {}
      }
      router.replace(nextPath(window.location.search));
    } catch (err) {
      setError(errorMessage(err));
      if (mode === "password") newCheck();
    } finally {
      setLoading(false);
    }
  }

  const disabled =
    loading ||
    (needOrg && !org.trim()) ||
    (mode === "password" ? !username || !password || needHuman : !email.trim() || (codeSent ? code.replace(/\s+/g, "").length !== 6 : needHuman));

  return (
    <LuxeAuth scene={scene} brandName={BRAND_NAME}>
      <LuxeCard>
        <div className={cn("flex flex-col items-center text-center", "short:-mt-1")}>
          {brand === undefined ? (
            <div className={cn("size-[68px]", "short:size-14")} aria-hidden />
          ) : (
            <LogoBadge
              src={brand?.logo_url}
              alt={brand?.logo_url ? (brand.name ?? "") : BRAND_NAME}
              size={68}
              className={cn("ring-2 ring-[var(--lux-gold)]/70 shadow-[0_8px_24px_-8px_rgba(217,173,120,0.45)] dark:ring-[var(--lux-gold)]/70", "short:!size-14")}
            />
          )}
          <h1 className={cn("mt-4 text-[28px] text-white sm:text-[30px]", "short:mt-3 short:text-[26px]")}>Welcome back</h1>
          <p className="mt-1.5 text-[15px] text-[var(--lux-muted)]">
            {mode === "code" ? "We\u2019ll email a code to the address on your staff profile." : brand?.name ? `Sign in to ${brand.name}` : "Sign in to your salon account"}
          </p>
        </div>

        <div className={cn("mt-6 grid gap-3", "short:mt-5 short:gap-2.5")}>
          {google && googleUrl && (
            <a
              href={googleUrl}
              className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[14px] bg-white text-[15px] font-semibold text-[#1f1f1f] shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] transition duration-200 ease-out hover:bg-[#f4f1ec] focus-visible:ring-[3px] focus-visible:ring-[var(--lux-gold)]/50 focus-visible:outline-none active:scale-[0.99]"
            >
              <GoogleMark />
              Continue with Google
            </a>
          )}
          <button
            type="button"
            aria-pressed={mode === "code"}
            onClick={() => switchMode(mode === "code" ? "password" : "code")}
            className={cn(
              "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[14px] border text-[15px] font-semibold transition duration-200 ease-out focus-visible:ring-[3px] focus-visible:ring-[var(--lux-gold)]/40 focus-visible:outline-none active:scale-[0.99]",
              mode === "code" ? "border-[var(--lux-gold)]/70 bg-[var(--lux-gold)]/10 text-[var(--lux-gold-light)]" : "border-white/20 bg-white/[0.03] text-white hover:border-white/35 hover:bg-white/[0.07]"
            )}
          >
            <Mail className="size-[18px]" strokeWidth={1.7} aria-hidden />
            Email me a sign-in code
          </button>
        </div>

        <div className={cn("my-5", "short:my-4")}>
          <LuxeDivider>{mode === "code" ? "Sign in with an emailed code" : "Or sign in with password"}</LuxeDivider>
        </div>

        <form onSubmit={submit} autoComplete="on" className={cn("grid gap-3", "short:gap-2.5")}>
          {needOrg && (
            <LuxeField
              id="org"
              label="Salon ID"
              placeholder="Salon ID (e.g. superbeard)"
              icon={Store}
              autoComplete="organization"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={org}
              onChange={(e) => setOrg(e.target.value)}
            />
          )}
          {mode === "password" ? (
            <>
              <LuxeField
                id="username"
                label="Email or username"
                icon={Mail}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <LuxePassword id="password" label="Password" icon={Lock} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="flex items-center justify-between pt-0.5 text-sm">
                <label className="group flex cursor-pointer items-center gap-2 text-white/80 select-none">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
                  <span className="grid size-[18px] place-items-center rounded-[5px] border border-white/30 bg-white/[0.04] transition-colors peer-checked:border-[var(--lux-gold)] peer-checked:bg-[var(--lux-gold)] peer-focus-visible:ring-[3px] peer-focus-visible:ring-[var(--lux-gold)]/35 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
                    <Check className="size-3.5 text-[var(--lux-espresso)]" strokeWidth={3} aria-hidden />
                  </span>
                  Remember me
                </label>
                <button type="button" onClick={() => switchMode("code")} className="rounded font-medium text-[var(--lux-gold)] transition-colors hover:text-[var(--lux-gold-light)] focus-visible:ring-2 focus-visible:ring-[var(--lux-gold)]/40 focus-visible:outline-none">
                  Forgot password?
                </button>
              </div>
            </>
          ) : (
            <>
              <LuxeField
                id="email"
                label="Email"
                placeholder="Email on your staff profile"
                icon={Mail}
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                readOnly={codeSent}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {codeSent && (
                <LuxeField
                  id="code"
                  label="6-digit code"
                  icon={KeyRound}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputClassName="font-mono text-lg tracking-[0.4em]"
                />
              )}
            </>
          )}
          {TURNSTILE_SITE_KEY && <div ref={widgetBox} className="flex min-h-[65px] justify-center" data-testid="turnstile" />}
          {notice && !error && <p className="rounded-[14px] border border-[var(--lux-gold)]/35 bg-[var(--lux-gold)]/10 px-4 py-2.5 text-sm text-[var(--lux-ivory)]">{notice}</p>}
          {error && (
            <p role="alert" className="rounded-[14px] border border-[#e5806b]/40 bg-[#e5806b]/10 px-4 py-2.5 text-sm text-[#f3b4a6]">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={disabled}
            className="group mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,#EAC99C_0%,#D9AD78_55%,#C99A62_100%)] text-base font-bold text-[var(--lux-espresso)] shadow-[0_10px_28px_-10px_rgba(217,173,120,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] transition duration-200 ease-out hover:brightness-[1.06] focus-visible:ring-[3px] focus-visible:ring-[var(--lux-gold)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1916] focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:saturate-[0.85] disabled:hover:brightness-100"
          >
            {loading ? (
              <>
                <Loader2 className="size-[18px] animate-spin" aria-hidden />
                {mode === "code" && !codeSent ? "Sending…" : "Signing in…"}
              </>
            ) : (
              <>
                {mode === "code" && !codeSent ? "Email me a code" : "Sign in"}
                <ArrowRight className="size-[18px] transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.2} aria-hidden />
              </>
            )}
          </button>
          {mode === "code" && codeSent && (
            <button type="button" disabled={loading || needHuman} onClick={sendCode} className="h-10 rounded-[14px] text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
              Send a new code
            </button>
          )}
          {mode === "code" && (
            <button type="button" onClick={() => switchMode("password")} className="justify-self-center text-sm font-medium text-[var(--lux-gold)] transition-colors hover:text-[var(--lux-gold-light)]">
              Sign in with your password instead
            </button>
          )}
        </form>
        <p className={cn("mt-5 text-center text-xs text-white/50", "short:mt-4")}>Secure access to your salon workspace.</p>
      </LuxeCard>
    </LuxeAuth>
  );
}
