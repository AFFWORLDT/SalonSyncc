import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { sign, verify } from "./crypto";

/** The super admin's cookie. Host-only on admin.<domain>, so salon subdomains never receive it. */
export const PLATFORM_COOKIE = "ss_platform";
export const PLATFORM_SESSION_MS = 12 * 60 * 60 * 1000;

export interface PlatformSession {
  /** platform_users.id */
  pid: number;
  v: number;
  exp: number;
  /** Always "platform": a salon session token (same secret) can never be read as one. */
  k: "platform";
}

const opts = { httpOnly: true, secure: true, sameSite: "Strict", path: "/" } as const;

export async function issuePlatformSession(c: Context<AppEnv>, pid: number, v: number): Promise<void> {
  const token = await sign({ pid, v, exp: Date.now() + PLATFORM_SESSION_MS, k: "platform" } satisfies PlatformSession, c.env.SESSION_SECRET);
  setCookie(c, PLATFORM_COOKIE, token, { ...opts, maxAge: PLATFORM_SESSION_MS / 1000 });
}

export async function readPlatformSession(c: Context<AppEnv>): Promise<PlatformSession | null> {
  let p: Partial<PlatformSession> | null;
  try {
    p = await verify<Partial<PlatformSession>>(getCookie(c, PLATFORM_COOKIE), c.env.SESSION_SECRET);
  } catch {
    return null;
  }
  if (!p || typeof p !== "object" || p.k !== "platform") return null;
  if (!Number.isInteger(p.pid) || !Number.isInteger(p.v) || typeof p.exp !== "number" || !(p.exp >= Date.now())) return null;
  return { pid: p.pid!, v: p.v!, exp: p.exp, k: "platform" };
}

export function clearPlatformSession(c: Context<AppEnv>): void {
  deleteCookie(c, PLATFORM_COOKIE, opts);
}
