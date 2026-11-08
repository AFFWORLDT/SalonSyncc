/**
 * Phone app sessions: a random bearer token per (user, device), stored only as its SHA-256. A sign-in lasts
 * MOBILE_TTL_MS from last use; the sliding update writes at most once per MOBILE_TOUCH_MS to keep D1 writes low.
 */
import { randomToken } from "./crypto";

export const MOBILE_TTL_MS = 30 * 86_400_000;
export const MOBILE_TOUCH_MS = 3_600_000;
export const TOKEN_PREFIX = "skm_";

export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface MobileDevice {
  orgId: string;
  userId: number;
  sessionVersion: number;
  deviceId: string;
  deviceName: string;
  platform: "ios" | "android";
  appVersion: string | null;
}

export async function issueMobileSession(db: D1Database, o: MobileDevice, now = Date.now()): Promise<{ token: string; expiresAt: number }> {
  const token = TOKEN_PREFIX + randomToken(32);
  const expiresAt = now + MOBILE_TTL_MS;
  const hash = await hashToken(token);
  await db.batch([
    // One signed-in person per phone: someone else's session on this device ends, and its pushes with it.
    db.prepare(
      "DELETE FROM push_tokens WHERE mobile_session_id IN (SELECT id FROM mobile_sessions WHERE org_id = ? AND device_id = ? AND user_id <> ?)",
    ).bind(o.orgId, o.deviceId, o.userId),
    db.prepare("DELETE FROM mobile_sessions WHERE org_id = ? AND device_id = ? AND user_id <> ?").bind(o.orgId, o.deviceId, o.userId),
    db.prepare(
      `INSERT INTO mobile_sessions(id,org_id,user_id,token_hash,device_id,device_name,platform,app_version,session_version,created_at,last_used_at,expires_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(org_id,user_id,device_id) DO UPDATE SET token_hash=excluded.token_hash, device_name=excluded.device_name,
         platform=excluded.platform, app_version=excluded.app_version, session_version=excluded.session_version,
         created_at=excluded.created_at, last_used_at=excluded.last_used_at, expires_at=excluded.expires_at`,
    ).bind(`ms_${randomToken(12)}`, o.orgId, o.userId, hash, o.deviceId, o.deviceName, o.platform, o.appVersion, o.sessionVersion, now, now, expiresAt),
  ]);
  return { token, expiresAt };
}

export interface MobileSession {
  id: string;
  uid: number;
  orgId: string;
  v: number;
  platform: string;
  appVersion: string | null;
}

export async function readMobileSession(db: D1Database, token: string, now = Date.now()): Promise<MobileSession | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const r = await db.prepare("SELECT id, org_id, user_id, session_version, last_used_at, expires_at, platform, app_version FROM mobile_sessions WHERE token_hash = ?")
    .bind(await hashToken(token))
    .first<{ id: string; org_id: string; user_id: number; session_version: number; last_used_at: number; expires_at: number; platform: string; app_version: string | null }>();
  if (!r || r.expires_at < now) return null;
  if (now - r.last_used_at >= MOBILE_TOUCH_MS) {
    await db.prepare("UPDATE mobile_sessions SET last_used_at = ?, expires_at = ? WHERE id = ?").bind(now, now + MOBILE_TTL_MS, r.id).run();
  }
  return { id: r.id, uid: r.user_id, orgId: r.org_id, v: r.session_version, platform: r.platform, appVersion: r.app_version };
}

export async function revokeMobileSession(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM push_tokens WHERE mobile_session_id = ?").bind(id),
    db.prepare("DELETE FROM mobile_sessions WHERE id = ?").bind(id),
  ]);
}
