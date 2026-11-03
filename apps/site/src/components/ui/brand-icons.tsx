import type { SVGProps } from "react";

/** Small brand-coloured marks for the feature cards (simplified, drawn here; not the official artwork files). */
type P = SVGProps<SVGSVGElement>;

export function WhatsAppIcon(p: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...p}>
      <path fill="#25D366" d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.4.7 4.7 1.9 6.7L3 29l6.9-2.2c1.9 1 4 1.6 6.1 1.6 7 0 12.7-5.7 12.7-12.7S23 3 16 3z" />
      <path fill="#fff" d="M22.6 18.9c-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.3-.7.1-.4-.2-1.5-.6-2.8-1.8-1-.9-1.7-2-1.9-2.3-.2-.4 0-.5.2-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.5 0-.6l-1-2.5c-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.2 3.3 1.4 3.6c.2.2 2.4 3.7 5.8 5.1 2.9 1.1 3.4.9 4.1.9.6-.1 2-.8 2.3-1.6.3-.8.3-1.5.2-1.6-.1-.2-.3-.3-.6-.4z" />
    </svg>
  );
}

export function GoogleSheetsIcon(p: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...p}>
      <path fill="#0F9D58" d="M19 2H8a3 3 0 0 0-3 3v22a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V10z" />
      <path fill="#87CEAC" d="M19 2v6a2 2 0 0 0 2 2h6z" />
      <path fill="#fff" d="M10 14h12v10H10zm2 2v2h3v-2zm5 0v2h3v-2zm-5 4v2h3v-2zm5 0v2h3v-2z" />
    </svg>
  );
}

export function GoogleMapsIcon(p: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...p}>
      <path fill="#1A73E8" d="M16 2a10 10 0 0 0-8.5 15.3L16 30l8.5-12.7A10 10 0 0 0 16 2z" />
      <path fill="#EA4335" d="M16 2a10 10 0 0 0-7.7 3.6l5.1 5.1A3.6 3.6 0 0 1 16 8.4z" />
      <path fill="#FBBC04" d="M8.3 5.6A10 10 0 0 0 7.5 17.3l5.9-6.6z" />
      <path fill="#34A853" d="M7.5 17.3 16 30l3-4.5-5.6-14.8z" />
      <circle cx="16" cy="12" r="3.6" fill="#fff" />
    </svg>
  );
}

export function GoogleRatingIcon(p: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...p}>
      <path fill="#4285F4" d="M27.6 14.3H16v4.5h6.6c-.6 3-3.2 4.8-6.6 4.8a7.6 7.6 0 1 1 4.9-13.4l3.3-3.3A12.2 12.2 0 1 0 16 28.2c6.3 0 11.8-4.6 11.8-11.7 0-.7-.1-1.5-.2-2.2z" />
      <path fill="#FBBC04" d="m24.5 1.5 1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.7 1.4.5-3-2.2-2.1 3-.4z" />
    </svg>
  );
}

export function BillIcon(p: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...p}>
      <path fill="#1F7A6A" d="M7 2h18v28l-3-2-3 2-3-2-3 2-3-2-3 2z" />
      <path fill="#fff" d="M11 8h10v2H11zm0 5h10v2H11zm0 5h6v2h-6z" />
      <path fill="#B8935A" d="M19 18h3v2h-3z" />
    </svg>
  );
}

export function WalletIcon(p: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...p}>
      <rect x="3" y="8" width="26" height="19" rx="4" fill="#B8935A" />
      <path fill="#8C6A3A" d="M6 8 20 3l2 5z" />
      <rect x="19" y="14" width="10" height="7" rx="2" fill="#F2DCAE" />
      <circle cx="23" cy="17.5" r="1.6" fill="#8C6A3A" />
    </svg>
  );
}
