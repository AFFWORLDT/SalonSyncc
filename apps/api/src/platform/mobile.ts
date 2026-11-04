/** The phone app's sign-in (POST /api/mobile/session). The salon comes from the host, as for the web login. */
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { issueMobileSession } from "../core/mobile-session";
import { verifyLogin } from "./auth";

export const mobile = new Hono<AppEnv>();

const DEVICE_ID = /^[A-Za-z0-9_-]{8,100}$/;
const BAD_DEVICE = "Update the app and try again";

function deviceOf(v: unknown): { id: string; name: string; platform: "ios" | "android"; appVersion: string | null } | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const name = typeof d.name === "string" ? d.name.trim() : "";
  if (typeof d.id !== "string" || !DEVICE_ID.test(d.id) || !name || name.length > 80) return null;
  if (d.platform !== "ios" && d.platform !== "android") return null;
  if (d.app_version !== undefined && (typeof d.app_version !== "string" || d.app_version.length > 20)) return null;
  return { id: d.id, name, platform: d.platform, appVersion: (d.app_version as string | undefined) ?? null };
}

mobile.post("/session", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const device = deviceOf(body.device);
  if (!device) throw new HttpError(400, BAD_DEVICE);
  const { org, user } = await verifyLogin(c, body);
  const { token, expiresAt } = await issueMobileSession(c.env.DB, {
    orgId: org.id,
    userId: user.id,
    sessionVersion: user.session_version,
    deviceId: device.id,
    deviceName: device.name,
    platform: device.platform,
    appVersion: device.appVersion,
  });
  return c.json({ token, expires_at: expiresAt });
});
