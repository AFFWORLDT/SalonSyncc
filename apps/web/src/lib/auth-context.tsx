"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { FeatureKey } from "@ss/features";
import { clearApiCache } from "@/hooks/use-api";
import { api, clearSessionCaches, onApiEvent, SESSION_CACHE_PREFIX } from "./api";
import { setFormat, setServerToday } from "./format";
import type { MeResponse, Settings } from "./types";
import { forgetPushToken } from "@/lib/push";

/** Org statuses in which the salon can still change data (the API's write guard, WRITE_OK). */
const WRITABLE = new Set(["trial", "active", "grace", "past_due"]);
const LAST_ORG = "ss_last_org";
/** Pages that work without signing in. */
export const PUBLIC_PATHS = ["/r", "/rate", "/book", "/platform"];

interface AuthValue {
  me: MeResponse | null;
  user: MeResponse["user"] | null;
  settings: (Settings & { wa_ready: boolean }) | null;
  org: MeResponse["org"] | null;
  features: string[];
  /** True when the salon's plan (plus overrides) includes the feature. */
  has: (f: FeatureKey) => boolean;
  /** Owner or admin. */
  isAdmin: boolean;
  /** The subscription has lapsed: reads only (the API answers writes with 402). */
  readOnly: boolean;
  loading: boolean;
  /** `org` is the salon ID (slug); needed when the host isn't the salon's own subdomain. */
  /** `turnstile`: the bot-check token from the sign-in page (required when Turnstile is on). */
  login: (org: string | undefined, username: string, password: string, turnstile?: string) => Promise<void>;
  /** Signs in with the 6-digit code emailed by POST /api/auth/code. */
  loginWithCode: (org: string | undefined, email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function cacheKey(slug: string) {
  return `${SESSION_CACHE_PREFIX}${slug}`;
}
/** Last /api/me answer for the last salon signed in on this browser, so a returning user sees their screen at once. */
function readCache(): MeResponse | null {
  try {
    const slug = localStorage.getItem(LAST_ORG);
    const raw = slug ? localStorage.getItem(cacheKey(slug)) : null;
    return raw ? (JSON.parse(raw) as MeResponse) : null;
  } catch {
    return null;
  }
}
function writeCache(m: MeResponse | null) {
  try {
    if (m) {
      localStorage.setItem(cacheKey(m.org.slug), JSON.stringify(m));
      localStorage.setItem(LAST_ORG, m.org.slug);
    } else clearSessionCaches();
  } catch {}
}

export function lastOrg(): string {
  try {
    return localStorage.getItem(LAST_ORG) ?? "";
  } catch {
    return "";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((m: MeResponse | null) => {
    setFormat(m?.settings ?? null);
    setServerToday(m?.today ?? null);
    setMe(m);
    writeCache(m);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api<MeResponse>("/api/me", { redirectOn401: false }));
    } catch {
      apply(null);
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    // Public pages (receipt, rating) have no session: never call /api/me there (Workers free plan, no sign-in).
    if (PUBLIC_PATHS.some((p) => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    const cached = readCache();
    if (cached) {
      setFormat(cached.settings);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMe(cached);
      setLoading(false);
    }
    refresh();
  }, [refresh]);

  // The plan or subscription changed while the app was open: reload /api/me so menus and gates follow.
  useEffect(
    () =>
      onApiEvent((k) => {
        if (k === "feature_disabled" || k === "subscription_inactive") refresh();
      }),
    [refresh]
  );

  const login = useCallback(
    async (org: string | undefined, username: string, password: string, turnstile?: string) => {
      const body: Record<string, string> = { username, password };
      if (turnstile) body.turnstile = turnstile;
      if (org) body.org = org.trim().toLowerCase();
      await api("/api/auth/login", { body, redirectOn401: false });
      clearApiCache();
      await refresh();
    },
    [refresh]
  );

  const loginWithCode = useCallback(
    async (org: string | undefined, email: string, code: string) => {
      const body: Record<string, string> = { email, code };
      if (org) body.org = org.trim().toLowerCase();
      await api("/api/auth/code/verify", { body, redirectOn401: false });
      clearApiCache();
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      // This device should stop getting the signed-out user's notifications.
      await forgetPushToken();
      await api("/api/auth/logout", { method: "POST", redirectOn401: false });
    } finally {
      setFormat(null);
      setServerToday(null);
      setMe(null);
      clearSessionCaches();
      clearApiCache();
    }
  }, []);

  const value = useMemo<AuthValue>(() => {
    const features = me?.features ?? [];
    const role = me?.user.role;
    return {
      me,
      user: me?.user ?? null,
      settings: me?.settings ?? null,
      org: me?.org ?? null,
      features,
      has: (f: FeatureKey) => features.includes(f),
      isAdmin: role === "owner" || role === "admin",
      readOnly: !!me && !WRITABLE.has(me.org.status),
      loading,
      login,
      loginWithCode,
      logout,
      refresh,
    };
  }, [me, loading, login, loginWithCode, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
/** Plan name for the session hook. */
export const useSession = useAuth;
