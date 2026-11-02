import type { Announcement } from "@ss/contract";

/** Staff announcements (FM routes.ts 483-530). Every statement is scoped by org_id (RF5). */

/** FM shows the admin's last 30. */
export const ANNOUNCEMENTS_LIMIT = 30;

const COLS = `a.id, a.sender_id, s.name AS sender_name, a.audience, a.target_id, t.name AS target_name, a.title, a.body, a.recipients, a.created_at`;

export function announcementsRepo(db: D1Database, orgId: string) {
  return {
    /** Recent announcements, newest first. */
    async list(): Promise<Announcement[]> {
      const { results } = await db
        .prepare(`SELECT ${COLS} FROM announcements a JOIN users s ON s.org_id = a.org_id AND s.id = a.sender_id LEFT JOIN users t ON t.org_id = a.org_id AND t.id = a.target_id WHERE a.org_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?`)
        .bind(orgId, ANNOUNCEMENTS_LIMIT)
        .all<Announcement>();
      return results;
    },

    /** Whether the id is an active user of this org. */
    async activeUserExists(id: number): Promise<boolean> {
      const r = await db.prepare("SELECT id FROM users WHERE org_id = ? AND id = ? AND active = 1").bind(orgId, id).first();
      return !!r;
    },

    /** Active users of this org (owner, admins and barbers), leaving out the sender. */
    async activeIdsExcept(senderId: number): Promise<number[]> {
      const { results } = await db
        .prepare("SELECT id FROM users WHERE org_id = ? AND active = 1 AND id <> ? ORDER BY id")
        .bind(orgId, senderId)
        .all<{ id: number }>();
      return results.map((r) => r.id);
    },

    /** Stores the announcement and returns it in the API shape. */
    async create(a: { senderId: number; audience: "all" | "barber"; targetId: number | null; title: string; body: string; recipients: number }): Promise<Announcement> {
      const row = await db
        .prepare(
          "INSERT INTO announcements (org_id, sender_id, audience, target_id, title, body, recipients, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        )
        .bind(orgId, a.senderId, a.audience, a.targetId, a.title, a.body, a.recipients, Date.now())
        .first<{ id: number }>();
      return (await db.prepare(`SELECT ${COLS} FROM announcements a JOIN users s ON s.org_id = a.org_id AND s.id = a.sender_id LEFT JOIN users t ON t.org_id = a.org_id AND t.id = a.target_id WHERE a.org_id = ? AND a.id = ?`).bind(orgId, row!.id).first<Announcement>())!;
    },
  };
}
