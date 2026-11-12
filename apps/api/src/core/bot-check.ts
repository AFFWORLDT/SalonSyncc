import type { Context } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "./errors";
import { services } from "./services";

/**
 * Cloudflare Turnstile check for web forms (signup, sign-in, email code, bookings).
 * Off while TURNSTILE_SECRET is unset. `token` is the widget's response, sent by the page.
 */
export async function requireHuman(c: Context<AppEnv>, token: unknown): Promise<void> {
  const secret = c.env.TURNSTILE_SECRET;
  if (!secret) return;
  const t = typeof token === "string" ? token : "";
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  if (!t || t.length > 4096 || !(await services(c.env).turnstile.verify(secret, t, ip))) throw new HttpError(400, "Please complete the check", "turnstile");
}

/** True when the request comes from a web page (browsers send Origin on POST); the phone app sends none. */
export const fromBrowser = (c: Context<AppEnv>) => !!c.req.header("Origin");
