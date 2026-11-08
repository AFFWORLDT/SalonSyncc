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

/** Null = the person closed the popup. Throws an Error with a message worth showing. */
export async function continueWithGoogle({ auth, mod }: Ready): Promise<GoogleResult | null> {
  const provider = new mod.GoogleAuthProvider();
  // A shared salon computer: always ask which account.
  provider.setCustomParameters({ prompt: "select_account" });
  let idToken: string;
  try {
    const cred = await mod.signInWithPopup(auth, provider);
    idToken = await cred.user.getIdToken(true);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (CLOSED.has(code)) return null;
    if (code === "auth/popup-blocked") throw new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again.");
    if (code === "auth/network-request-failed") throw new Error("You're offline");
    if (code === "auth/unauthorized-domain" || code === "auth/operation-not-allowed") throw new Error("Google sign-in isn't switched on here yet. Use your salon ID instead.");
    throw new Error("Google sign-in didn't work. Try again or use your salon ID.");
  } finally {
    // SalonKit keeps its own session; Firebase was only the identity check.
    await mod.signOut(auth).catch(() => {});
  }
  const r = await fetch("/api/auth/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_token: idToken, web: true }) });
  const d = (await r.json().catch(() => ({}))) as { handoff_url?: string; new?: boolean; email?: string; name?: string | null; error?: string };
  if (!r.ok) throw new Error(d.error ?? `Sign-in failed (${r.status})`);
  if (d.handoff_url) return { kind: "signed-in", url: d.handoff_url };
  if (d.new && d.email) return { kind: "new", idToken, email: d.email, name: d.name ?? null };
  throw new Error("Sign-in failed. Try again.");
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
