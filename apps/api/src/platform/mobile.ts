/** The phone app's sign-in (POST /api/mobile/session). The salon comes from the host, as for the web login. */
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { issueMobileSession, revokeMobileSession } from "../core/mobile-session";
import { requireAdmin } from "../core/roles";
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

/** On the tenant router (needs a signed-in user): this phone signs out; admins see and end their staff's phone sessions. */
export const mobileTenant = new Hono<AppEnv>();

mobileTenant.delete("/mobile/session", async (c) => {
  const id = c.var.tenant.mobileSessionId;
  if (!id) throw new HttpError(400, "Only the phone app signs out here");
  await revokeMobileSession(c.env.DB, id);
  return c.json({ ok: true });
});

const userIdOf = (s: string) => (/^\d{1,12}$/.test(s) ? Number(s) : -1);

mobileTenant.get("/users/:id/devices", requireAdmin, async (c) => {
  if (!(await c.var.tenant.repo.userById(userIdOf(c.req.param("id"))))) throw new HttpError(404, "Not found");
  const { results } = await c.env.DB.prepare(
    "SELECT id, device_name, platform, app_version, last_used_at FROM mobile_sessions WHERE org_id = ? AND user_id = ? AND expires_at >= ? ORDER BY last_used_at DESC",
  ).bind(c.var.tenant.org.id, userIdOf(c.req.param("id")), Date.now()).all();
  return c.json(results);
});

mobileTenant.delete("/users/:id/devices/:sid", requireAdmin, async (c) => {
  const [sid, orgId, uid] = [c.req.param("sid"), c.var.tenant.org.id, userIdOf(c.req.param("id"))];
  const [, r] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM push_tokens WHERE mobile_session_id = ? AND org_id = ? AND user_id = ?").bind(sid, orgId, uid),
    c.env.DB.prepare("DELETE FROM mobile_sessions WHERE id = ? AND org_id = ? AND user_id = ?").bind(sid, orgId, uid),
  ]);
  if (!r!.meta.changes) throw new HttpError(404, "Not found");
  return c.json({ ok: true });
});
