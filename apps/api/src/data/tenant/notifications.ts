import type { Notification, NotificationFeed } from "@ss/contract";

/**
 * Push tokens and the notification feed (FM push.ts + routes.ts 434-481). Every recipient list and every statement is
 * scoped by org_id (RF5). The one deliberate exception is `registerToken`'s ON CONFLICT clause: see there.
 */

/** D1 caps bound parameters per statement at 100; id/token lists are chunked below that. */
const CHUNK = 90;
const chunks = <T>(xs: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
};
const marks = (n: number) => Array.from({ length: n }, () => "?").join(",");

export interface PushContent {
  title: string;
  body: string;
  path?: string;
}

export function notificationsRepo(db: D1Database, orgId: string) {
  return {
    /** Active owner and admin ids of this org, optionally leaving one out (the admin who did the thing). */
    async adminIds(except?: number): Promise<number[]> {
      const { results } = await db
        .prepare("SELECT id FROM users WHERE org_id = ? AND role IN ('owner', 'admin') AND active = 1 ORDER BY id")
        .bind(orgId)
        .all<{ id: number }>();
      return results.map((r) => r.id).filter((id) => id !== except);
    },

    /**
     * One feed row per recipient. The INSERT ... SELECT only writes for ids that are users of this org, so an id from
     * another org (or a deleted user) records nothing instead of tripping the FK.
     */
    async record(userIds: number[], push: PushContent): Promise<void> {
      const ids = [...new Set(userIds)];
      if (!ids.length) return;
      const at = Date.now();
      await db.batch(
        ids.map((uid) =>
          db
            .prepare("INSERT INTO notifications (org_id, user_id, title, body, path, created_at) SELECT org_id, id, ?, ?, ?, ? FROM users WHERE org_id = ? AND id = ?")
            .bind(push.title, push.body, push.path ?? "/", at, orgId, uid),
        ),
      );
    },

    /** This org's device tokens for these users. */
    async tokensFor(userIds: number[]): Promise<string[]> {
      const ids = [...new Set(userIds)];
      const out: string[] = [];
      for (const part of chunks(ids)) {
        const { results } = await db
          .prepare(`SELECT token FROM push_tokens WHERE org_id = ? AND user_id IN (${marks(part.length)})`)
          .bind(orgId, ...part)
          .all<{ token: string }>();
        out.push(...results.map((r) => r.token));
      }
      return out;
    },

    /** Removes tokens FCM reported gone; only this org's rows (a token that moved salons in the meantime is kept). */
    async deleteTokens(dead: string[]): Promise<void> {
      const parts = chunks([...new Set(dead)]);
      if (!parts.length) return;
      await db.batch(parts.map((part) => db.prepare(`DELETE FROM push_tokens WHERE org_id = ? AND token IN (${marks(part.length)})`).bind(orgId, ...part)));
    },

    /**
     * Registers this device's token for the session user. SANCTIONED CROSS-ORG WRITE (Plan 2b ruling): the token is the
     * device-global primary key, so ON CONFLICT(token) reassigns org_id/user_id: a device that signs into another salon
     * moves there and stops receiving the old salon's pushes. Every other push_tokens write is org-scoped.
     */
    async registerToken(userId: number, token: string): Promise<void> {
      const at = Date.now();
      await db
        .prepare(
          "INSERT INTO push_tokens (token, org_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET org_id = excluded.org_id, user_id = excluded.user_id, updated_at = excluded.updated_at",
        )
        .bind(token, orgId, userId, at, at)
        .run();
    },

    /** Signs a device out of pushes: only the session user's token in this org. */
    async removeToken(userId: number, token: string): Promise<void> {
      await db.prepare("DELETE FROM push_tokens WHERE org_id = ? AND user_id = ? AND token = ?").bind(orgId, userId, token).run();
    },

    /** The user's recent notifications, newest first, plus how many are still unread. */
    async feed(userId: number, limit: number): Promise<NotificationFeed> {
      const [rows, n] = await Promise.all([
        db
          .prepare("SELECT id, title, body, path, created_at, read_at FROM notifications WHERE org_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
          .bind(orgId, userId, limit)
          .all<Notification>(),
        db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE org_id = ? AND user_id = ? AND read_at IS NULL").bind(orgId, userId).first<{ n: number }>(),
      ]);
      return { items: rows.results, unread: n?.n ?? 0 };
    },

    /** Marks the user's unread notifications read: the given ids (others' ids are ignored), or all when `ids` is omitted. */
    async markRead(userId: number, ids?: number[]): Promise<void> {
      const at = Date.now();
      if (ids === undefined) {
        await db.prepare("UPDATE notifications SET read_at = ? WHERE org_id = ? AND user_id = ? AND read_at IS NULL").bind(at, orgId, userId).run();
        return;
      }
      if (!ids.length) return;
      await db
        .prepare(`UPDATE notifications SET read_at = ? WHERE org_id = ? AND user_id = ? AND read_at IS NULL AND id IN (${marks(ids.length)})`)
        .bind(at, orgId, userId, ...ids)
        .run();
    },
  };
}
