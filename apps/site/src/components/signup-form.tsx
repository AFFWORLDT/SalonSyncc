"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROOT_DOMAIN } from "@/lib/brand";
import { COUNTRIES } from "@/lib/countries";
import { SLUG_RE, normalizeSlug, suggestSlug } from "@/lib/slug";
import { TURNSTILE_SITE_KEY, mountTurnstile } from "@/lib/turnstile";

type SlugState = { state: "idle" | "checking" | "ok" | "bad"; message?: string };
const REASON: Record<string, string> = { invalid: "3-30 letters, numbers or dashes", reserved: "That salon ID can't be used", taken: "That salon ID is taken" };

/** The signup body the API takes (POST /api/public/signup). */
export interface SignupBody {
  salon_name: string;
  slug: string;
  owner_name: string;
  email: string;
  phone: string;
  password: string;
  country: string;
  turnstile?: string;
}

/** Same rules as the API: the email is also the owner's username (at most 60, safe characters). */
export const EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
/** A typed phone is fine when it is digits with spaces, dashes, dots, brackets and an optional +, 6-15 digits. */
export function phoneOk(raw: string): boolean {
  if (!raw.trim()) return true;
  const digits = raw.replace(/\D/g, "");
  return /^[+\d\s().-]+$/.test(raw) && digits.length >= 6 && digits.length <= 15;
}

const host = (slug: string) => (ROOT_DOMAIN ? `${slug}.${ROOT_DOMAIN}` : slug);

/** Salon name -> suggested salon ID (live-checked), owner details, then straight into the new salon, signed in. */
export function SignupForm() {
  const [salon, setSalon] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ state: "idle" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("AE");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (widget.current) mountTurnstile(widget.current, setToken);
  }, []);

  // The salon ID follows the salon's name until the owner types their own.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!slugEdited) setSlug(suggestSlug(salon));
  }, [salon, slugEdited]);

  // Live availability, debounced.
  useEffect(() => {
    const s = normalizeSlug(slug);
    if (!s) return setSlugState({ state: "idle" });
    if (!SLUG_RE.test(s)) return setSlugState({ state: "bad", message: REASON.invalid });
    setSlugState({ state: "checking" });
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/public/slug?s=${encodeURIComponent(s)}`);
        const d = (await r.json()) as { available: boolean; reason?: string };
        if (live) setSlugState(d.available ? { state: "ok", message: `${host(s)} is yours` } : { state: "bad", message: REASON[d.reason ?? "taken"] });
      } catch {
        if (live) setSlugState({ state: "idle" });
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (TURNSTILE_SITE_KEY && !token) return setError("Please complete the check below");
    setBusy(true);
    const body: SignupBody = { salon_name: salon.trim(), slug: normalizeSlug(slug), owner_name: name.trim(), email: email.trim(), phone: phone.trim(), password, country };
    if (token) body.turnstile = token;
    try {
      const r = await fetch("/api/public/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { handoff_url?: string; error?: string };
      if (!r.ok || !d.handoff_url) throw new Error(d.error ?? `Signup failed (${r.status})`);
      window.location.assign(d.handoff_url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      if (TURNSTILE_SITE_KEY) window.turnstile?.reset();
    }
  }

  const emailBad = email.trim() !== "" && (!EMAIL_RE.test(email.trim()) || email.trim().length > 60);
  const phoneBad = !phoneOk(phone);
  const ready = salon.trim().length >= 2 && slugState.state === "ok" && name.trim().length >= 2 && EMAIL_RE.test(email.trim()) && !emailBad && !phoneBad && password.length >= 8;

  return (
    <form onSubmit={submit} className="grid gap-4" data-testid="signup-form">
      <div className="grid gap-2">
        <Label htmlFor="salon">Salon name</Label>
        <Input id="salon" required value={salon} onChange={(e) => setSalon(e.target.value)} placeholder="Super Beard Gents Salon" className="h-11" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="slug">Salon ID</Label>
        <div className="field-shell flex items-center rounded-lg pr-3">
          <Input
            id="slug"
            required
            value={slug}
            onChange={(e) => (setSlugEdited(true), setSlug(e.target.value.toLowerCase()))}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 border-0 focus-visible:ring-0"
          />
          {ROOT_DOMAIN && <span className="shrink-0 text-sm text-muted-foreground">.{ROOT_DOMAIN}</span>}
        </div>
        <p
          role="status"
          className={`flex items-center gap-1.5 text-xs ${slugState.state === "ok" ? "text-primary" : slugState.state === "bad" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {slugState.state === "checking" && <Loader2 className="size-3.5 animate-spin" />}
          {slugState.state === "ok" && <Check className="size-3.5" />}
          {slugState.state === "bad" && <X className="size-3.5" />}
          {slugState.state === "checking" ? "Checking…" : (slugState.message ?? "Your salon's own address")}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="owner">Your name</Label>
          <Input id="owner" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="country">Country</Label>
          <select id="country" value={country} onChange={(e) => setCountry(e.target.value)} className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={emailBad} className="h-11" />
          {emailBad && <p className="text-xs text-destructive">Enter a valid email (at most 60 characters)</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Mobile (optional)</Label>
          <Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your mobile number" aria-invalid={phoneBad} className="h-11" />
          {phoneBad && <p className="text-xs text-destructive">Enter a valid mobile number</p>}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pe-10" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">At least 8 characters. You sign in with your email and this password.</p>
      </div>
      {TURNSTILE_SITE_KEY && <div ref={widget} data-testid="turnstile" />}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="mt-1 h-12 w-full text-base" disabled={busy || !ready}>
        {busy ? "Creating your salon…" : "Start my free trial"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">7 days of Pro Max, free. No card needed.</p>
    </form>
  );
}
