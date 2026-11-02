"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_ACCENT, isHexColor, themeVars, type Appearance } from "./theme";
import "./app-theme.css";

export interface UiPrefsValue {
  appearance: Appearance;
  accent: string;
}

interface AppThemeValue extends UiPrefsValue {
  resolved: "light" | "dark";
  setAppearance: (a: Appearance) => void;
  setAccent: (hex: string) => void;
}

const DEFAULTS: UiPrefsValue = { appearance: "system", accent: DEFAULT_ACCENT };
const PREFS_KEY = "fm_ui_prefs";
const PREFS_EVENT = "fm-ui-prefs";

const AppThemeContext = createContext<AppThemeValue | null>(null);

function normalize(raw: unknown): UiPrefsValue | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<UiPrefsValue>;
  const appearance: Appearance = r.appearance === "light" || r.appearance === "dark" ? r.appearance : "system";
  return { appearance, accent: isHexColor(r.accent) ? r.accent.toUpperCase() : DEFAULT_ACCENT };
}

// Appearance lives in this browser only: it is a per-device preference.
function readPrefs(): string | null {
  try {
    return localStorage.getItem(PREFS_KEY);
  } catch {
    return null;
  }
}
function writePrefs(p: UiPrefsValue) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {}
  window.dispatchEvent(new Event(PREFS_EVENT));
}
function subscribePrefs(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(PREFS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(PREFS_EVENT, cb);
  };
}

function useSystemDark() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false
  );
}

/** Appearance + accent for the whole app, remembered in localStorage. */
export function AppThemeProvider({
  className = "",
  fontClassName = "",
  children,
}: {
  className?: string;
  /** next/font variable classes; mirrored on <html> so portals get the fonts too. */
  fontClassName?: string;
  children: React.ReactNode;
}) {
  const raw = useSyncExternalStore(subscribePrefs, readPrefs, () => null);
  const current = useMemo(() => {
    try {
      return (raw ? normalize(JSON.parse(raw)) : null) ?? DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  }, [raw]);

  const systemDark = useSystemDark();
  const resolved: "light" | "dark" =
    current.appearance === "system" ? (systemDark ? "dark" : "light") : current.appearance;
  const vars = useMemo(() => themeVars(resolved, current.accent), [resolved, current.accent]);

  const setAppearance = useCallback((appearance: Appearance) => writePrefs({ ...current, appearance }), [current]);
  const setAccent = useCallback(
    (hex: string) => {
      if (isHexColor(hex)) writePrefs({ ...current, accent: hex.toUpperCase() });
    },
    [current]
  );

  // Portalled content (dialogs, popovers, tooltips) renders under <body>, so
  // mirror the theme on <html> while a themed shell is mounted.
  useEffect(() => {
    const html = document.documentElement;
    const fontClasses = fontClassName.split(/\s+/).filter(Boolean);
    html.setAttribute("data-app-theme", resolved);
    html.classList.toggle("dark", resolved === "dark");
    html.classList.add(...fontClasses);
    for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v);
    // The status bar follows the in-app appearance, not just the OS scheme.
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((m) => m.content);
    for (const m of metas) m.content = vars["--background"];
    return () => {
      metas.forEach((m, i) => (m.content = before[i]));
      html.removeAttribute("data-app-theme");
      html.classList.remove("dark", ...fontClasses);
      for (const k of Object.keys(vars)) html.style.removeProperty(k);
    };
  }, [resolved, vars, fontClassName]);

  const value = useMemo<AppThemeValue>(
    () => ({ appearance: current.appearance, accent: current.accent, resolved, setAppearance, setAccent }),
    [current.appearance, current.accent, resolved, setAppearance, setAccent]
  );

  return (
    <AppThemeContext.Provider value={value}>
      <div
        className={`app-theme app-root ${fontClassName} ${resolved === "dark" ? "dark" : ""} ${className}`}
        style={vars as React.CSSProperties}
      >
        {children}
        <Toaster />
      </div>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within AppThemeProvider");
  return ctx;
}

/** Older names, kept so copied components read naturally. */
export const AdminThemeProvider = AppThemeProvider;
export const useAdminTheme = useAppTheme;
