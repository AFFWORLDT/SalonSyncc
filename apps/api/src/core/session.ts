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
}

const cookieOpts = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;

export async function issueSession(c: Context<AppEnv>, p: Omit<SessionPayload, "exp">): Promise<void> {
  const exp = Date.now() + SESSION_MS;
  const token = await sign({ uid: p.uid, orgId: p.orgId, v: p.v, exp } satisfies SessionPayload, c.env.SESSION_SECRET);
  setCookie(c, COOKIE, token, { ...cookieOpts, maxAge: SESSION_MS / 1000 });
}

export async function readSession(c: Context<AppEnv>): Promise<SessionPayload | null> {
  const p = await verify<Partial<SessionPayload>>(getCookie(c, COOKIE), c.env.SESSION_SECRET);
  if (!p) return null;
  if (
    !Number.isInteger(p.uid) || typeof p.orgId !== "string" || !p.orgId ||
    !Number.isInteger(p.v) || typeof p.exp !== "number" || !(p.exp >= Date.now())
  ) return null;
  return { uid: p.uid!, orgId: p.orgId, v: p.v!, exp: p.exp };
}

export function clearSession(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE, cookieOpts);
}
