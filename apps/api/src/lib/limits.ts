/**
 * Login throttling. Every wrong password counts against three counters, and any one at its max refuses further
 * tries until its 15-minute window ends:
 *  - the device (IP), across usernames: stops guessing many accounts from one place;
 *  - the username on that device: someone typing "admin" wrongly only locks themselves out, not the real admin;
 *  - the username from anywhere, with a high max: slows a guess spread over many devices.
 * The two username key kinds have distinct prefixes (d:/a:) and the username is URI-encoded (no ":" or "|"), so no
 * username can spell another key. Usernames are only unique per org, so those keys carry the org id (login_failures rows also carry it as org_id).
 * The device counter lives in rate_hits (key `login-ip:<ip>`); the two username counters are login_failures rows.
 */
export const LOGIN_WINDOW_MS = 15 * 60_000;

export function loginLimits(orgId: string, rawUsername: string, ip: string): { key: string; max: number }[] {
  const username = rawUsername.toLowerCase(); // logins are case-insensitive, so counters are too
  return [
    { key: `login-ip:${ip}`, max: 20 },
    { key: `d:${orgId}:${encodeURIComponent(username)}:${ip}`, max: 8 },
    { key: `a:${orgId}:${encodeURIComponent(username)}`, max: 50 },
  ];
}

/** Fixed 15-minute window the device counter (rate_hits) counts in. */
export const loginWindow = (at: number) => Math.floor(at / LOGIN_WINDOW_MS);

/**
 * Requests per minute per IP on the public links; the PDF costs CPU to draw, so it gets fewer. Staff photos have their
 * own, higher bucket: one staff screen loads many of them, and they must not eat the receipts/services budget.
 */
export const PUBLIC_LIMITS = { pub: 60, pdf: 10, avatar: 300, slug: 30, book: 6 } as const;

/** Signups per IP per hour (key `signup:<ip>` in rate_hits, hourly windows). */
export const SIGNUP_PER_HOUR = 5;
export const hourWindow = (at: number) => Math.floor(at / 3_600_000);

/** The minute a request counts in (fixed windows). */
export const minuteWindow = (at: number) => Math.floor(at / 60_000);

/** True once a counter's failure count has reached its max. */
export const isLocked = (count: number, max: number): boolean => count >= max;
