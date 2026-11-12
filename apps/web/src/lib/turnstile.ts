/** Cloudflare Turnstile site key (public, build env). Empty: no widget and the API skips the check. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "expired-callback"?: () => void; theme?: string }): string; reset(id?: string): void };
  }
}

/** Loads the Turnstile script once and renders the widget into `el`; `onToken` gets each fresh token ("" when expired). */
export function mountTurnstile(el: HTMLElement, onToken: (t: string) => void): void {
  if (!TURNSTILE_SITE_KEY) return;
  const render = () => window.turnstile?.render(el, { sitekey: TURNSTILE_SITE_KEY, callback: onToken, "expired-callback": () => onToken(""), theme: "light" });
  if (window.turnstile) return void render();
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true;
  s.onload = render;
  document.head.appendChild(s);
}
