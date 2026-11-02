/**
 * Admin panel theme tokens: the mobile app's palette (DhColors / DhAccent in
 * dehertz-mobile lib/core/theme/dh_tokens.dart) expressed as shadcn variables.
 */

export type Appearance = "system" | "light" | "dark";

/** Default accent (the "SalonKit" choice): deep green on the cream light theme, a brighter green in dark. */
export const DEFAULT_ACCENT = "#C08A5B";
/** The light-mode colour of the default accent. */
export const LIGHT_BRAND = "#1F7A6A";
/** The dark-mode colour of the default accent: the same green, a step brighter for dark backgrounds. */
export const DARK_BRAND = "#2A9D88";
/** Glow colours of the dark background mesh: deep teals. */
const DARK_MESH = ["#1F7A6A", "#2A9D88", "#0F2E29"] as const;
/** Glow colours of the light background mesh: teal, the logo's gold, deep green. */
const LIGHT_MESH = ["#2A9D88", "#B8935A", "#1D4A42"] as const;

export const ACCENTS: { name: string; hex: string }[] = [
  { name: "SalonKit green", hex: "#C08A5B" },
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
  // Dark: deep green-black, so the green accent and teal glows sit in the same family as the light theme.
  dark: {
    bg: "#08110F",
    card: "#13201C",
    muted: "#1A2A25",
    border: "#26382F",
    fg: "#F2F2F2",
    mutedFg: "#8C8C8C",
    faint: "#5C5C5C",
    success: "#2FD27A",
    warning: "#FFB020",
    destructive: "#FF5A5F",
  },
  // Light: the creamy canvas with deep green (deHertz Type palette).
  light: {
    bg: "#F6F2E9",
    card: "#FFFDF8",
    muted: "#ECE6D9",
    border: "#E0D9CB",
    fg: "#1C1B18",
    mutedFg: "#67635B",
    faint: "#9A958B",
    success: "#14935A",
    warning: "#B86E00",
    destructive: "#D92D20",
  },
} as const;

/** "#RRGGBB" + alpha -> "rgb(r g b / a)" (glass surfaces are see-through over the tinted background). */
export function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
}

/** How see-through glass surfaces are: cards and bars, and the more solid popovers/menus/dialogs (readability). */
const GLASS = { light: { card: 0.62, popover: 0.86, border: 0.55 }, dark: { card: 0.5, popover: 0.82, border: 0.5 } } as const;

/** The shadcn variable set for a resolved mode and accent. */
export function themeVars(mode: "light" | "dark", accent: string): Record<string, string> {
  const p = PALETTE[mode];
  const brand = accent.toUpperCase() === DEFAULT_ACCENT;
  const a = mode === "light" ? (brand ? LIGHT_BRAND : accentForLight(accent)) : brand ? DARK_BRAND : accent.toUpperCase();
  // Background mesh: cream with teal and gold glows in light, deep teal glows in dark (brand); accent glows otherwise.
  const mesh = brand ? (mode === "light" ? LIGHT_MESH : DARK_MESH) : [a, a, a];
  const onA = onAccent(a);
  return {
    "--background": p.bg,
    "--foreground": p.fg,
    "--card": withAlpha(p.card, GLASS[mode].card),
    "--card-foreground": p.fg,
    "--popover": withAlpha(p.card, GLASS[mode].popover),
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
    "--border": withAlpha(p.border, GLASS[mode].border),
    "--mesh-a": mesh[0],
    "--mesh-b": mesh[1],
    "--mesh-c": mesh[2],
    "--glass-highlight": mode === "light" ? "rgb(255 255 255 / 0.55)" : "rgb(255 255 255 / 0.08)",
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
