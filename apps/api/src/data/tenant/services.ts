import { auditRepo, type AuditInput } from "./audit";
import { randomToken } from "../../core/crypto";

export interface ServiceRow {
  id: number;
  category: string;
  name: string;
  description: string | null;
  price: number; // minor units
  sort_order: number;
  active: 0 | 1;
}

export interface ServiceWrite {
  category: string;
  name: string;
  description: string | null;
  price: number; // minor units
  /** null = after the last one (create) / unchanged (update). */
  sort_order: number | null;
  /** null = unchanged (update) / active (create). */
  active: boolean | null;
}

export interface PublicService {
  category: string;
  name: string;
  description: string | null;
  price: number;
}

type Actor = AuditInput["actor"];

const COLS = "id, category, name, description, price, sort_order, active";

/** A service as the audit log keeps it. */
export const serviceAudit = (r: ServiceRow) => ({
  category: r.category,
  name: r.name,
  description: r.description,
  price: r.price,
  sort_order: r.sort_order,
  active: !!r.active,
});

/** FM's starting price sheet (FM migration 0004). Prices are in fils (AED x 100); the route converts them to the org's minor unit. */
export const STARTER_SERVICES: ReadonlyArray<{ category: string; name: string; description: string; fils: number; sort: number }> = [
  { category: "Haircuts", name: "Haircut", description: "Scissor or clipper, finished and styled", fils: 2000, sort: 10 },
  { category: "Haircuts", name: "Skin fade", description: "Blended down to the skin, sharp line-up", fils: 2500, sort: 20 },
  { category: "Haircuts", name: "Kids haircut", description: "Boys under 12", fils: 1500, sort: 30 },
  { category: "Haircuts", name: "Hair wash", description: "At the basin, with a quick dry", fils: 1000, sort: 40 },
  { category: "Beard & shave", name: "Beard trim", description: "Even length, neat neckline", fils: 1000, sort: 50 },
  { category: "Beard & shave", name: "Beard shape & line-up", description: "Cheek line and edges with the razor", fils: 1500, sort: 60 },
  { category: "Beard & shave", name: "Clean shave", description: "Hot towel and razor", fils: 1500, sort: 70 },
  { category: "Beard & shave", name: "Haircut + beard", description: "The usual, together", fils: 3000, sort: 80 },
  { category: "Colour & care", name: "Hair colour", description: "Black or natural shades, full head", fils: 5000, sort: 90 },
  { category: "Colour & care", name: "Silver / fashion colour", description: "Bleach and tone", fils: 12000, sort: 100 },
  { category: "Colour & care", name: "Hair straightening", description: "Smoothing treatment for frizz and waves", fils: 15000, sort: 110 },
  { category: "Colour & care", name: "Hair spa", description: "Wash, mask and head massage", fils: 5000, sort: 120 },
  { category: "Face & extras", name: "Facial", description: "Cleanse, scrub and mask", fils: 4000, sort: 130 },
  { category: "Face & extras", name: "Face threading", description: "Cheeks and brows", fils: 1500, sort: 140 },
  { category: "Face & extras", name: "Head massage", description: "Ten minutes with oil", fils: 2000, sort: 150 },
  { category: "Face & extras", name: "Black mask", description: "Nose and cheeks", fils: 2000, sort: 160 },
];

/** Every query here is scoped by org_id; test/sql-guard.test.ts enforces it. */
export function servicesRepo(db: D1Database, orgId: string) {
  const audit = auditRepo(db, orgId);
  const byUid = "(SELECT id FROM services WHERE org_id = ? AND uid = ?)";
  const byId = (id: number) => db.prepare(`SELECT ${COLS} FROM services WHERE org_id = ? AND id = ?`).bind(orgId, id).first<ServiceRow>();

  return {
    byId,
    async list(all: boolean): Promise<ServiceRow[]> {
      const r = await db
        .prepare(`SELECT ${COLS} FROM services WHERE org_id = ?${all ? "" : " AND active = 1"} ORDER BY sort_order, id`)
        .bind(orgId)
        .all<ServiceRow>();
      return r.results;
    },
    async publicList(): Promise<PublicService[]> {
      const r = await db
        .prepare("SELECT category, name, description, price FROM services WHERE org_id = ? AND active = 1 ORDER BY sort_order, id")
        .bind(orgId)
        .all<PublicService>();
      return r.results;
    },
    async count(): Promise<number> {
      return (await db.prepare("SELECT COUNT(*) AS n FROM services WHERE org_id = ?").bind(orgId).first<{ n: number }>())?.n ?? 0;
    },

    async create(w: ServiceWrite, actor: Actor): Promise<ServiceRow> {
      const uid = randomToken(9);
      const at = Date.now();
      // Only a display order: two concurrent creates may share a value, which just ties on id.
      const sort =
        w.sort_order ??
        (await db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM services WHERE org_id = ?").bind(orgId).first<{ n: number }>())?.n ??
        10;
      const [ins] = await db.batch([
        db
          .prepare(
            `INSERT INTO services (org_id, uid, category, name, description, price, sort_order, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLS}`,
          )
          .bind(orgId, uid, w.category, w.name, w.description, w.price, sort, w.active === false ? 0 : 1, at, at),
        audit.stmt({
          actor,
          entity: "service",
          entityId: { sql: byUid, binds: [orgId, uid] },
          ref: w.name,
          action: "create",
          before: null,
          after: { category: w.category, name: w.name, description: w.description, price: w.price, sort_order: sort, active: w.active !== false },
        }),
      ]);
      return ins!.results[0] as unknown as ServiceRow;
    },

    async update(id: number, before: ServiceRow, w: ServiceWrite, actor: Actor): Promise<ServiceRow | null> {
      const [upd] = await db.batch([
        db
          .prepare(
            `UPDATE services SET category = ?, name = ?, description = ?, price = ?, sort_order = COALESCE(?, sort_order),
                    active = COALESCE(?, active), updated_at = ? WHERE org_id = ? AND id = ? RETURNING ${COLS}`,
          )
          .bind(w.category, w.name, w.description, w.price, w.sort_order, w.active === null ? null : w.active ? 1 : 0, Date.now(), orgId, id),
        audit.stmt({
          actor,
          entity: "service",
          entityId: id,
          ref: w.name,
          action: "update",
          before: serviceAudit(before),
          after: {
            category: w.category,
            name: w.name,
            description: w.description,
            price: w.price,
            sort_order: w.sort_order ?? before.sort_order,
            active: w.active ?? !!before.active,
          },
          when: { sql: "EXISTS (SELECT 1 FROM services WHERE org_id = ? AND id = ?)", binds: [orgId, id] },
        }),
      ]);
      return (upd!.results[0] as unknown as ServiceRow | undefined) ?? null;
    },

    /** Old bills keep their own copy of the name and price, so deleting a service never changes them. Task 6 adds the sale_items null-out here. */
    async remove(target: ServiceRow, actor: Actor): Promise<void> {
      await db.batch([
        audit.stmt({ actor, entity: "service", entityId: target.id, ref: target.name, action: "delete", before: serviceAudit(target), after: null }),
        db.prepare("DELETE FROM services WHERE org_id = ? AND id = ?").bind(orgId, target.id),
      ]);
    },

    /**
     * Inserts the starter catalogue (`items` already priced in minor units) only when the org has no services, atomically.
     * One summary audit row (action "starter"), tied to the first service. Returns null when the list wasn't empty.
     */
    async insertStarter(items: Array<{ category: string; name: string; description: string; price: number; sort: number }>, actor: Actor): Promise<ServiceRow[] | null> {
      const at = Date.now();
      const uids = items.map(() => randomToken(9));
      // D1 caps bound variables per statement, so one INSERT per row. The first is guarded by "org has no services";
      // the rest by "the first one was just inserted", which keeps the whole catalogue atomic and all-or-nothing in one batch.
      const stmts = items.map((s, i) =>
        db
          .prepare(
            "INSERT INTO services (org_id, uid, category, name, description, price, sort_order, active, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?, ? WHERE " +
              (i === 0 ? "(SELECT COUNT(*) FROM services WHERE org_id = ?) = 0" : `${byUid} IS NOT NULL`),
          )
          .bind(orgId, uids[i], s.category, s.name, s.description, s.price, s.sort, at, at, ...(i === 0 ? [orgId] : [orgId, uids[0]])),
      );
      await db.batch([
        ...stmts,
        audit.stmt({
          actor,
          entity: "service",
          entityId: { sql: byUid, binds: [orgId, uids[0]] },
          ref: "Starter services",
          action: "starter",
          before: null,
          after: { count: items.length },
          when: { sql: `${byUid} IS NOT NULL`, binds: [orgId, uids[0]] },
        }),
      ]);
      const placeholders = uids.map(() => "?").join(",");
      const r = await db
        .prepare(`SELECT ${COLS} FROM services WHERE org_id = ? AND uid IN (${placeholders}) ORDER BY sort_order, id`)
        .bind(orgId, ...uids)
        .all<ServiceRow>();
      return r.results.length ? r.results : null;
    },
  };
}
