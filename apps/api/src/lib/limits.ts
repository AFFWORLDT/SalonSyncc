/**
 * Login throttling. Every wrong password counts against three counters, and any one at its max refuses further
 * tries until its 15-minute window ends:
 *  - the device (IP), across usernames: stops guessing many accounts from one place;
 *  - the username on that device: someone typing "admin" wrongly only locks themselves out, not the real admin;
 *  - the username from anywhere, with a high max: slows a guess spread over many devices.
 * Usernames are only unique per org, so those keys carry the org id.
 */
export const LOGIN_WINDOW_MS = 15 * 60_000;

export function loginLimits(orgId: string, username: string, ip: string): { key: string; max: number }[] {
  return [
    { key: `ip:${ip}`, max: 20 },
    { key: `u:${orgId}:${username}|${ip}`, max: 8 },
    { key: `u:${orgId}:${username}`, max: 50 },
  ];
}

/** Requests per minute per IP on the public links; the PDF costs CPU to draw, so it gets fewer. */
export const PUBLIC_LIMITS = { pub: 60, pdf: 10 } as const;

/** The minute a request counts in (fixed windows). */
export const minuteWindow = (at: number) => Math.floor(at / 60_000);

/** True once a counter's failure count has reached its max. */
export const isLocked = (count: number, max: number): boolean => count >= max;
