/**
 * Checks a Firebase ID token (what the phone app gets after "Continue with Google / Apple") without the Admin SDK:
 * RS256 against Google's published keys, then the claims Firebase documents for ID tokens
 * (https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library).
 * Only a verified email from Google or Apple is accepted: SalonKit's accounts are keyed by email.
 */
import { HttpError } from "../core/errors";

export const FIREBASE_KEYS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
export type SocialProvider = "google.com" | "apple.com";
const PROVIDERS: readonly string[] = ["google.com", "apple.com"];
/** Clock skew allowed between Google and us, in seconds. */
const SKEW_S = 60;

export interface FirebaseIdentity {
  uid: string;
  email: string;
  name: string | null;
  provider: SocialProvider;
}

type Jwk = JsonWebKey & { kid?: string };
export type KeyFetcher = () => Promise<Jwk[]>;

let cache: { keys: Jwk[]; until: number } | null = null;

/** Google's keys, kept for as long as its Cache-Control says (they rotate every few hours). 1 subrequest when stale. */
export const fetchFirebaseKeys: KeyFetcher = async () => {
  const now = Date.now();
  if (cache && cache.until > now) return cache.keys;
  const r = await fetch(FIREBASE_KEYS_URL);
  if (!r.ok) throw new HttpError(503, "Sign-in is busy. Try again in a moment.");
  const keys = ((await r.json()) as { keys?: Jwk[] }).keys ?? [];
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  cache = { keys, until: now + Math.min(maxAge, 6 * 3600) * 1000 };
  return keys;
};

const fail = () => new HttpError(401, "That sign-in didn't work. Try again, or use the email code.");

function b64urlBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}

function json(part: string): Record<string, unknown> {
  try {
    const v = JSON.parse(new TextDecoder().decode(b64urlBytes(part)));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function verifyFirebaseIdToken(token: unknown, projectId: string, nowMs = Date.now(), keys: KeyFetcher = fetchFirebaseKeys): Promise<FirebaseIdentity> {
  if (typeof token !== "string" || token.length > 4096 || !projectId) throw fail();
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[\w-]+$/.test(p))) throw fail();
  const [h, p, sig] = parts as [string, string, string];
  const header = json(h);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw fail();
  const jwk = (await keys()).find((k) => k.kid === header.kid);
  if (!jwk) throw fail();
  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    ok = false;
  }
  if (!ok) throw fail();

  const c = json(p);
  const now = Math.floor(nowMs / 1000);
  const num = (k: string) => (typeof c[k] === "number" ? (c[k] as number) : NaN);
  if (c.iss !== `https://securetoken.google.com/${projectId}` || c.aud !== projectId) throw fail();
  if (typeof c.sub !== "string" || !c.sub || c.sub.length > 128) throw fail();
  if (!(num("exp") > now) || !(num("iat") <= now + SKEW_S) || !(num("auth_time") <= now + SKEW_S)) throw fail();
  const fb = c.firebase as { sign_in_provider?: unknown } | undefined;
  const provider = typeof fb?.sign_in_provider === "string" ? fb.sign_in_provider : "";
  if (!PROVIDERS.includes(provider)) throw fail();
  const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !email.includes("@")) throw new HttpError(401, "Your Google or Apple account didn't share an email. Use the email code instead.");
  if (c.email_verified !== true) throw new HttpError(401, "That email isn't verified with Google or Apple yet. Use the email code instead.");
  const name = typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 80) : null;
  return { uid: c.sub, email, name, provider: provider as SocialProvider };
}

/** Tests: forget cached keys. */
export function clearFirebaseKeyCache(): void {
  cache = null;
}

let keySource: KeyFetcher = fetchFirebaseKeys;
/** The key fetcher the routes use (tests swap in their own signing key). */
export const firebaseKeys: KeyFetcher = () => keySource();
export function setFirebaseKeysForTest(f: KeyFetcher | null): void {
  keySource = f ?? fetchFirebaseKeys;
}
