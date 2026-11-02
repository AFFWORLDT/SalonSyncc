"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearApiCache } from "@/hooks/use-api";
import { api } from "./api";
import type { Me, Settings } from "./types";
import { forgetPushToken } from "@/lib/push";

interface Session {
  user: Me;
  settings: Settings;
  today: string;
}

interface AuthValue {
  user: Me | null;
  settings: Settings | null;
  isAdmin: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const CACHE_KEY = "fm_session_cache";

/** Last /auth/me answer, so a returning user sees their screen instantly while it revalidates. */
function readCache(): Session | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeCache(s: Session | null) {
  try {
    if (s) localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    else localStorage.removeItem(CACHE_KEY);
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const d = await api<Session>("/api/auth/me", { redirectOn401: false });
      setSession(d);
      writeCache(d);
    } catch {
      setSession(null);
      writeCache(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(cached);
      setLoading(false);
    }
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      await api("/api/auth/login", { body: { username, password }, redirectOn401: false });
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
      setSession(null);
      writeCache(null);
      clearApiCache();
    }
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      settings: session?.settings ?? null,
      isAdmin: session?.user.role === "admin",
      loading,
      login,
      logout,
      refresh,
    }),
    [session, loading, login, logout, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
