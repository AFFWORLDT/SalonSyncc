/**
 * "Continue with Google / Apple" from the phone app (POST /api/auth/social {id_token, device}). Firebase Auth does the
 * provider sign-in on the phone; here its ID token is checked (lib/firebase-token.ts) and the verified email decides:
 * a person on a salon's team is signed in there (one email = one salon); an unknown email answers {new: true} so the
 * app can offer sign-up (POST /api/public/signup with the same id_token). See docs/superpowers/plans/2026-11-08-google-apple-sign-in.md.
 */
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { issueMobileSession } from "../core/mobile-session";
import { platformRepo } from "../data/platform";
import { tenantRepo } from "../data/tenant";
import { rateHit } from "../data/infra";
import { loginWindow } from "../lib/limits";
import { firebaseKeys, verifyFirebaseIdToken } from "../lib/firebase-token";
import { auth } from "./auth";
import { deviceOf } from "./mobile";
import type { Context } from "hono";

/** Tries per device per 15 minutes (each one may cost a key fetch). */
export const SOCIAL_TRIES = 30;

export async function socialIdentity(c: Context<AppEnv>, idToken: unknown) {
  return verifyFirebaseIdToken(idToken, c.env.FIREBASE_PROJECT_ID ?? "", Date.now(), firebaseKeys);
}

auth.post("/social", async (c) => {
  const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const device = deviceOf(b.device);
  if (!device) throw new HttpError(400, "Update the app and try again");
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  if ((await rateHit(c.env.DB, `social-ip:${ip}`, loginWindow(Date.now()))) > SOCIAL_TRIES) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  const who = await socialIdentity(c, b.id_token);

  const org = await platformRepo(c.env.DB).orgOfEmail(who.email);
  if (!org) {
    // Inactive on a team, or nobody: an inactive person must hear it (not be offered a new salon they can't create).
    const off = await platformRepo(c.env.DB).inactiveSalonOfEmail(who.email);
    if (off) throw new HttpError(403, `Your account at ${off} is turned off. Ask the salon owner to turn it back on.`, "inactive");
    return c.json({ new: true, email: who.email, name: who.name });
  }
  const user = await tenantRepo(c.env.DB, org.id).userByEmail(who.email);
  if (!user) return c.json({ new: true, email: who.email, name: who.name });
  const s = await issueMobileSession(c.env.DB, {
    orgId: org.id,
    userId: user.id,
    sessionVersion: user.session_version,
    deviceId: device.id,
    deviceName: device.name,
    platform: device.platform,
    appVersion: device.appVersion,
  });
  return c.json({ token: s.token, expires_at: s.expiresAt, slug: org.slug });
});
