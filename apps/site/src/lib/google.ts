/**
 * "Continue with Google" on the website, the same flow as the phone app: Firebase Auth shows Google's account popup and
 * gives an ID token, the server checks it (POST /api/auth/social {web: true}) and the verified email decides:
 * on a salon's team → a single-use link signs them in on the salon's own address; unknown → start a salon.
 * Firebase settings come from GET /api/public/auth-config (kept out of git); no settings = no button.
 */
import type { Auth } from "firebase/auth";

type Config = { google: boolean; firebase?: { apiKey: string; projectId: string; authDomain: string } };
export type GoogleResult = { kind: "signed-in"; url: string } | { kind: "new"; idToken: string; email: string; name: string | null };
type Ready = { auth: Auth; mod: typeof import("firebase/auth") };

/** The Google account that wasn't on any team, carried from Sign in to the sign-up page (this tab only). */
export const PENDING_KEY = "sk-google-signup";
export type PendingGoogle = { idToken: string; email: string; name: string | null; at: number };
/** Firebase ID tokens last an hour; leave a margin for filling in the form. */
const PENDING_MS = 50 * 60_000;

let ready: Promise<Ready | null> | null = null;

/** Loads the settings and Firebase Auth ahead of the click, so the popup opens straight from the tap (not blocked). */
export function prepareGoogle(): Promise<Ready | null> {
  ready ??= (async () => {
    const r = await fetch("/api/public/auth-config").catch(() => null);
    const cfg = (await r?.json().catch(() => null)) as Config | null;
    if (!cfg?.google || !cfg.firebase) return null;
    const [{ initializeApp, getApps }, mod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
    const app = getApps()[0] ?? initializeApp(cfg.firebase);
    return { auth: mod.getAuth(app), mod };
  })().catch(() => null);
  return ready;
}

const CLOSED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

/** Turns Firebase's error into a message worth showing; null = the person closed Google's window. */
function googleError(e: unknown): Error | null {
  const code = (e as { code?: string }).code ?? "";
  if (CLOSED.has(code)) return null;
  if (code === "auth/popup-blocked") return new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again.");
  if (code === "auth/network-request-failed") return new Error("You're offline");
  if (code === "auth/unauthorized-domain" || code === "auth/operation-not-allowed") return new Error("Google sign-in isn't switched on here yet. Use your salon ID instead.");
  return new Error("Google sign-in didn't work. Try again or use your salon ID.");
}

/** The server checks Google's verified email: into the salon (single-use link), or a new salon to start. */
async function exchange(idToken: string): Promise<GoogleResult> {
  const r = await fetch("/api/auth/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_token: idToken, web: true }) });
  const d = (await r.json().catch(() => ({}))) as { handoff_url?: string; new?: boolean; email?: string; name?: string | null; error?: string };
  if (!r.ok) throw new Error(d.error ?? `Sign-in failed (${r.status})`);
  if (d.handoff_url) return { kind: "signed-in", url: d.handoff_url };
  if (d.new && d.email) return { kind: "new", idToken, email: d.email, name: d.name ?? null };
  throw new Error("Sign-in failed. Try again.");
}

const provider = (mod: Ready["mod"]) => {
  const p = new mod.GoogleAuthProvider();
  // A shared salon computer: always ask which account.
  p.setCustomParameters({ prompt: "select_account" });
  return p;
};

/** Google's window as a popup (salonkit.online pages). Null = the person closed it. Throws an Error worth showing. */
export async function continueWithGoogle({ auth, mod }: Ready): Promise<GoogleResult | null> {
  let idToken: string;
  try {
    const cred = await mod.signInWithPopup(auth, provider(mod));
    idToken = await cred.user.getIdToken(true);
  } catch (e) {
    const err = googleError(e);
    if (!err) return null;
    throw err;
  } finally {
    // SalonKit keeps its own session; Firebase was only the identity check.
    await mod.signOut(auth).catch(() => {});
  }
  return exchange(idToken);
}

/**
 * Google as a full-page redirect, for a salon's own sign-in page (salon.salonkit.online sends people to
 * salonkit.online/login/google/: Firebase only allows listed domains, never *.salonkit.online). First visit leaves for
 * Google; the return visit finishes. Null = back from Google without signing in (closed, or another account flow).
 */
const REDIRECT_KEY = "sk-google-redirect";
export async function googleRedirect({ auth, mod }: Ready): Promise<GoogleResult | "leaving" | null> {
  let started = false;
  try {
    started = sessionStorage.getItem(REDIRECT_KEY) !== null;
    sessionStorage.removeItem(REDIRECT_KEY);
  } catch {
    /* no storage: getRedirectResult below still tells us */
  }
  let idToken: string | null = null;
  try {
    const cred = await mod.getRedirectResult(auth);
    if (cred) idToken = await cred.user.getIdToken(true);
  } catch (e) {
    const err = googleError(e);
    if (err) throw err;
    return null;
  } finally {
    if (started) await mod.signOut(auth).catch(() => {});
  }
  if (idToken) return exchange(idToken);
  // Back from Google with nothing: don't loop straight back there.
  if (started) return null;
  try {
    sessionStorage.setItem(REDIRECT_KEY, "1");
  } catch {
    /* ignore */
  }
  await mod.signInWithRedirect(auth, provider(mod));
  return "leaving";
}

export function savePending(p: Omit<PendingGoogle, "at">) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, at: Date.now() }));
  } catch {
    /* private mode: the sign-up page just asks for an email */
  }
}

export function readPending(): PendingGoogle | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as PendingGoogle | null;
    if (p && typeof p.idToken === "string" && typeof p.email === "string" && Date.now() - p.at < PENDING_MS) return p;
  } catch {
    /* ignore */
  }
  clearPending();
  return null;
}

export function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
