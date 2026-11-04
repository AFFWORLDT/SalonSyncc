/** The phone app's minimum and latest versions (app_config). Read before a salon is chosen, so on any API host. */
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { publicRateLimit } from "../core/public";

export const PLATFORMS = ["ios", "android"] as const;
export type AppPlatform = (typeof PLATFORMS)[number];
export const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Numeric per part: 1.10.0 is after 1.9.0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export const isPlatform = (s: string | undefined): s is AppPlatform => PLATFORMS.includes(s as AppPlatform);

export const appConfigPublic = new Hono<AppEnv>();
appConfigPublic.get("/", publicRateLimit("pub"), async (c) => {
  const platform = c.req.query("platform");
  if (!isPlatform(platform)) throw new HttpError(400, "platform must be ios or android");
  const r = await c.env.DB.prepare("SELECT min_version, latest_version, store_url FROM app_config WHERE platform = ?").bind(platform).first();
  if (!r) throw new HttpError(404, "Not found");
  return c.json(r, 200, { "cache-control": "public, max-age=300" });
});
