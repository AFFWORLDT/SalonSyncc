/**
 * Who used SalonKit, when and on what (Atlantic Portal → App usage, People): one activity_daily row per person per
 * platform per UTC day. Written after the response (waitUntil) and at most once every 10 minutes per person per
 * platform per isolate, so it stays a few writes a day per person (free plan: 100k writes/day).
 */
export const ACTIVITY_EVERY_MS = 10 * 60_000;
/** Most people remembered per isolate (oldest dropped first); a forgotten person just writes again. */
const MAX_REMEMBERED = 5_000;
const lastWrite = new Map<string, number>();

export type ActivityPlatform = "web" | "ios" | "android";

export function activityPlatform(p: string | null | undefined): ActivityPlatform {
  return p === "ios" || p === "android" ? p : "web";
}

export const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

/** Whether this touch should be written (and remembers it). Exported for tests. */
export function shouldRecord(userId: number, platform: ActivityPlatform, at: number): boolean {
  const key = `${userId}:${platform}`;
  const prev = lastWrite.get(key);
  if (prev !== undefined && at - prev < ACTIVITY_EVERY_MS && utcDay(prev) === utcDay(at)) return false;
  lastWrite.delete(key);
  lastWrite.set(key, at);
  if (lastWrite.size > MAX_REMEMBERED) lastWrite.delete(lastWrite.keys().next().value!);
  return true;
}

export function forgetActivityForTest() {
  lastWrite.clear();
}

/** 1 statement when recorded, none otherwise. Never throws (usage numbers must not break a request). */
export async function recordActivity(db: D1Database, a: { orgId: string; userId: number; platform: ActivityPlatform; appVersion: string | null; at: number }): Promise<void> {
  if (!shouldRecord(a.userId, a.platform, a.at)) return;
  try {
    await db
      .prepare(
        `INSERT INTO activity_daily(day, org_id, user_id, platform, app_version, first_at, last_at, hits) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?6, 1)
         ON CONFLICT(day, user_id, platform) DO UPDATE SET last_at = excluded.last_at, hits = hits + 1, app_version = COALESCE(excluded.app_version, app_version), org_id = excluded.org_id`,
      )
      .bind(utcDay(a.at), a.orgId, a.userId, a.platform, a.appVersion, a.at)
      .run();
  } catch (e) {
    console.error("activity write failed", (e as Error).message);
  }
}
