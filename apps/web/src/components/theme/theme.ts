/**
 * Admin panel theme tokens: the mobile app's palette (DhColors / DhAccent in
 * dehertz-mobile lib/core/theme/dh_tokens.dart) expressed as shadcn variables.
 */

export type Appearance = "system" | "light" | "dark";

/** Default accent (blue); a salon can pick another per device. */
export const DEFAULT_ACCENT = "#3B4CCA";

export const ACCENTS: { name: string; hex: string }[] = [
  { name: "Salon blue", hex: "#3B4CCA" },
  { name: "Red", hex: "#D71921" },
  { name: "Gold", hex: "#D4AF37" },
  { name: "Mono", hex: "#E6E6E6" },
  { name: "Blue", hex: "#2F6BFF" },
  { name: "Green", hex: "#1DB954" },
  { name: "Orange", hex: "#FF6A13" },
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** WCAG relative luminance, same as Flutter's Color.computeLuminance. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** DhAccent.onColor: Flutter's estimateBrightnessForColor picks white on dark colours. */
export function onAccent(hex: string): "#111111" | "#FFFFFF" {
  const l = luminance(hex);
  return (l + 0.05) * (l + 0.05) > 0.15 ? "#111111" : "#FFFFFF";
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * DhAccent.forLight: very light accents (e.g. Mono) vanish on an off-white
 * background, so anything with HSL lightness above 0.62 is darkened to 0.32.
 */
export function accentForLight(hex: string): string {
  const [h, s, l] = rgbToHsl(...parseHex(hex));
  if (l <= 0.62) return hex.toUpperCase();
  return toHex(...hslToRgb(h, s, 0.32));
}

const PALETTE = {
  dark: {
    bg: "#000000",
    card: "#1C1C1C",
    muted: "#262626",
    border: "#2E2E2E",
    fg: "#F2F2F2",
    mutedFg: "#8C8C8C",
    faint: "#5C5C5C",
    success: "#2FD27A",
    warning: "#FFB020",
    destructive: "#FF5A5F",
  },
  light: {
    bg: "#F4F4F2",
    card: "#FFFFFF",
    muted: "#EAEAE7",
    border: "#DCDCD8",
    fg: "#111111",
    mutedFg: "#6B6B6B",
    faint: "#9A9A96",
    success: "#14935A",
    warning: "#B86E00",
    destructive: "#D92D20",
  },
} as const;

/** The shadcn variable set for a resolved mode and accent. */
export function themeVars(mode: "light" | "dark", accent: string): Record<string, string> {
  const p = PALETTE[mode];
  const a = mode === "light" ? accentForLight(accent) : accent.toUpperCase();
  const onA = onAccent(a);
  return {
    "--background": p.bg,
    "--foreground": p.fg,
    "--card": p.card,
    "--card-foreground": p.fg,
    "--popover": p.card,
    "--popover-foreground": p.fg,
    "--primary": a,
    "--primary-foreground": onA,
    "--secondary": p.muted,
    "--secondary-foreground": p.fg,
    "--muted": p.muted,
    "--muted-foreground": p.mutedFg,
    "--accent": p.muted,
    "--accent-foreground": p.fg,
    "--destructive": p.destructive,
    "--border": p.border,
    "--input": p.border,
    "--ring": a,
    "--faint": p.faint,
    "--success": p.success,
    "--warning": p.warning,
    "--chart-1": a,
    "--chart-2": "#2F6BFF",
    "--chart-3": p.success,
    "--chart-4": p.warning,
    "--chart-5": p.mutedFg,
    "--sidebar": p.card,
    "--sidebar-foreground": p.fg,
    "--sidebar-primary": a,
    "--sidebar-primary-foreground": onA,
    "--sidebar-accent": p.muted,
    "--sidebar-accent-foreground": p.fg,
    "--sidebar-border": p.border,
    "--sidebar-ring": a,
  };
}
