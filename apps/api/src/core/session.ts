import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { sign, verify } from "./crypto";

export const COOKIE = "ss_session";
const SESSION_MS = 60 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  uid: number;
  orgId: string;
  v: number;
  exp: number; // ms
  /** Support mode: the platform user who is signed in as this salon's owner (2-hour session, red banner). */
  sp?: number;
  /** That platform user's session_version when the support session began: removing them or a password change ends it. */
  spv?: number;
}

const cookieOpts = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;

export async function issueSession(c: Context<AppEnv>, p: Omit<SessionPayload, "exp">, ttlMs = SESSION_MS): Promise<void> {
  const exp = Date.now() + ttlMs;
  const payload: SessionPayload = { uid: p.uid, orgId: p.orgId, v: p.v, exp };
  if (p.sp !== undefined) payload.sp = p.sp;
  if (p.spv !== undefined) payload.spv = p.spv;
  const token = await sign(payload, c.env.SESSION_SECRET);
  setCookie(c, COOKIE, token, { ...cookieOpts, maxAge: Math.floor(ttlMs / 1000) });
}

export async function readSession(c: Context<AppEnv>): Promise<SessionPayload | null> {
  let p: Partial<SessionPayload> | null;
  try {
    p = await verify<Partial<SessionPayload>>(getCookie(c, COOKIE), c.env.SESSION_SECRET);
  } catch {
    return null; // malformed base64 etc.: treat as no session, never a 500
  }
  if (!p || typeof p !== "object") return null;
  if (
    !Number.isInteger(p.uid) || typeof p.orgId !== "string" || !p.orgId ||
    !Number.isInteger(p.v) || typeof p.exp !== "number" || !(p.exp >= Date.now())
  ) return null;
  const out: SessionPayload = { uid: p.uid!, orgId: p.orgId, v: p.v!, exp: p.exp };
  if (p.sp !== undefined) {
    // A support session without a valid version is not a session at all (never silently a normal owner session).
    if (!Number.isInteger(p.sp) || !Number.isInteger(p.spv)) return null;
    out.sp = p.sp;
    out.spv = p.spv;
  }
  return out;
}

export function clearSession(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE, cookieOpts);
}
