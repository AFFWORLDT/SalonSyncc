import { decryptSecret, encryptSecret } from "../../lib/secrets";
import { auditRepo } from "./audit";
import type { Customer, WaCampaign, WaMessage } from "@ss/contract";
import type { SendResult, WaConfig } from "../../core/services";
import type { WaStatusEvent } from "../../lib/whatsapp";

/**
 * One org's WhatsApp number (org_whatsapp). The token is stored AES-GCM encrypted (lib/secrets, SECRETS_KEY) and only
 * `get()` decrypts it, for the Graph client. Nothing here logs, audits or returns the plaintext token (RF4):
 * audit snapshots carry token "[redacted]". The org lookup by phone_number_id (webhook) is platformRepo.orgByPhoneNumberId.
 */
export interface WaConfigInput {
  phoneNumberId: string;
  wabaId: string;
  token: string;
  /** Comma-separated canonical phones, or null for "message everyone". */
  testNumbers: string | null;
}

/** The stored config without the token (GET /api/whatsapp/config, audit snapshots). */
export interface WaConfigMeta {
  phoneNumberId: string;
  wabaId: string;
  testNumbers: string | null;
  updatedAt: number;
}

const REDACTED = "[redacted]";
const snapshot = (m: { phoneNumberId: string; wabaId: string; testNumbers: string | null }) => ({
  phone_number_id: m.phoneNumberId,
  waba_id: m.wabaId,
  test_numbers: m.testNumbers,
  token: REDACTED,
});

type Row = { phone_number_id: string; waba_id: string; token_enc: string; test_numbers: string | null; updated_at: number; cc: string | null };

export function waConfigRepo(db: D1Database, orgId: string, secretsKey: string) {
  const row = () =>
    db
      .prepare(
        `SELECT phone_number_id, waba_id, token_enc, test_numbers, updated_at,
           (SELECT phone_country FROM org_settings WHERE org_id = ?1) AS cc
         FROM org_whatsapp WHERE org_id = ?1`,
      )
      .bind(orgId)
      .first<Row>();

  async function meta(): Promise<WaConfigMeta | null> {
    const r = await row();
    return r ? { phoneNumberId: r.phone_number_id, wabaId: r.waba_id, testNumbers: r.test_numbers, updatedAt: r.updated_at } : null;
  }

  return {
    meta,
    /**
     * The config with the token decrypted, for sending. Null when none is stored, or when the token can't be
     * decrypted (e.g. SECRETS_KEY rotated): that org is simply not WA-ready; the error is logged without the token.
     */
    async get(): Promise<WaConfig | null> {
      const r = await row();
      if (!r) return null;
      let token: string;
      try {
        token = await decryptSecret(r.token_enc, secretsKey);
      } catch (e) {
        console.error(`org_whatsapp: token decrypt failed for org ${orgId}: ${(e as Error)?.name ?? "error"}`);
        return null;
      }
      return { phoneNumberId: r.phone_number_id, wabaId: r.waba_id, token, testNumbers: r.test_numbers, callingCode: r.cc ?? "971" };
    },
    /**
     * Saves (encrypting the token) and audits in one batch. "conflict" when another org already has this
     * phone_number_id (globally UNIQUE); nothing is written then.
     */
    async set(input: WaConfigInput, actor: { id: number; name: string }): Promise<"created" | "updated" | "conflict"> {
      const before = await meta();
      const tokenEnc = await encryptSecret(input.token, secretsKey);
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO org_whatsapp (org_id, phone_number_id, waba_id, token_enc, test_numbers, updated_at) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(org_id) DO UPDATE SET phone_number_id = excluded.phone_number_id, waba_id = excluded.waba_id,
                 token_enc = excluded.token_enc, test_numbers = excluded.test_numbers, updated_at = excluded.updated_at`,
            )
            .bind(orgId, input.phoneNumberId, input.wabaId, tokenEnc, input.testNumbers, Date.now()),
          auditRepo(db, orgId).stmt({
            actor,
            entity: "whatsapp",
            entityId: 1,
            ref: "WhatsApp",
            action: before ? "update" : "create",
            before: before ? snapshot(before) : null,
            after: snapshot(input),
          }),
        ]);
      } catch (e) {
        if (/UNIQUE constraint failed: org_whatsapp\.phone_number_id/.test(String((e as Error)?.message))) return "conflict";
        throw e; // D1 errors carry no bound values; the plaintext token is never bound anyway
      }
      return before ? "updated" : "created";
    },
    /** Removes the number (audited). False when there was none. */
    async clear(actor: { id: number; name: string }): Promise<boolean> {
      const before = await meta();
      if (!before) return false;
      await db.batch([
        db.prepare("DELETE FROM org_whatsapp WHERE org_id = ?").bind(orgId),
        auditRepo(db, orgId).stmt({ actor, entity: "whatsapp", entityId: 1, ref: "WhatsApp", action: "delete", before: snapshot(before), after: null }),
      ]);
      return true;
    },
  };
}

// ---------- sent messages (wa_messages) and customer opt-out ----------

/** What one send attempt is logged as (FM logSend). `params` are the template values as sent (never the token). */
export interface WaLogInput {
  kind: WaMessage["kind"];
  phone: string;
  template: string;
  params: unknown[];
  customerId?: number | null;
  saleId?: number | null;
  actorId?: number | null;
}

const WA_MESSAGE_COLS = "id, kind, phone, template, status, error, created_at, delivered_at, read_at";
type CustomerRow = Omit<Customer, "wa_opt_out"> & { wa_opt_out: number };

/** This org's wa_messages and the customers' WhatsApp opt-out. Every statement is org_id scoped (opt-out is per org, RF3). */
export function waMessagesRepo(db: D1Database, orgId: string) {
  const logStatement = (m: WaLogInput, r: SendResult, returning: string): D1PreparedStatement => {
    const at = Date.now();
    return db
      .prepare(
        `INSERT INTO wa_messages (org_id, kind, customer_id, phone, template, params, status, wa_id, error, sale_id, created_by, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)${returning}`,
      )
      .bind(
        orgId,
        m.kind,
        m.customerId ?? null,
        m.phone,
        m.template,
        JSON.stringify(m.params),
        r.status,
        r.status === "sent" ? r.wa_id : null,
        r.status === "sent" ? null : r.error,
        m.saleId ?? null,
        m.actorId ?? null,
        at,
        r.status === "sent" ? at : null,
      );
  };
  return {
    /** Writes exactly one row for a send attempt and returns it as the API shows it. */
    async log(m: WaLogInput, r: SendResult): Promise<WaMessage> {
      return (await logStatement(m, r, ` RETURNING ${WA_MESSAGE_COLS}`).first<WaMessage>())!;
    },

    /** The same one-row write as a statement, for the jobs to batch with their "done" mark (one D1 round trip per item). */
    logStatement(m: WaLogInput, r: SendResult): D1PreparedStatement {
      return logStatement(m, r, "");
    },

    /** The latest bill message for a sale of this org, or null. */
    latestBill(saleId: number): Promise<WaMessage | null> {
      return db
        .prepare(`SELECT ${WA_MESSAGE_COLS} FROM wa_messages WHERE org_id = ? AND sale_id = ? AND kind = 'bill' ORDER BY id DESC LIMIT 1`)
        .bind(orgId, saleId)
        .first<WaMessage>();
    },

    /** True when this org's customer (by id, else by canonical phone) opted out of WhatsApp. */
    async optedOut(customerId: number | null, phone: string): Promise<boolean> {
      const r = customerId
        ? await db.prepare("SELECT wa_opt_out FROM customers WHERE org_id = ? AND id = ?").bind(orgId, customerId).first<{ wa_opt_out: number }>()
        : await db.prepare("SELECT wa_opt_out FROM customers WHERE org_id = ? AND phone = ?").bind(orgId, phone).first<{ wa_opt_out: number }>();
      return !!r?.wa_opt_out;
    },

    /**
     * The writes for one webhook change of this org (FM POST /wa/webhook, org-scoped): delivery receipts by wa_id (delivered_at
     * and read_at are set only once; "read" implies delivered; "failed" stores the error, at most 300 chars) and STOP replies
     * as opt-outs by this org's canonical phone. Statements only: the caller batches them.
     */
    webhookStatements(statuses: WaStatusEvent[], optOutPhones: string[]): D1PreparedStatement[] {
      const out: D1PreparedStatement[] = [];
      for (const s of statuses) {
        if (s.status === "failed") {
          out.push(
            db.prepare("UPDATE wa_messages SET status = 'failed', error = ? WHERE org_id = ? AND wa_id = ?").bind((s.error ?? "Not delivered").slice(0, 300), orgId, s.wa_id),
          );
        } else if (s.status === "delivered") {
          out.push(db.prepare("UPDATE wa_messages SET delivered_at = COALESCE(delivered_at, ?) WHERE org_id = ? AND wa_id = ?").bind(s.at, orgId, s.wa_id));
        } else {
          out.push(
            db
              .prepare("UPDATE wa_messages SET read_at = COALESCE(read_at, ?), delivered_at = COALESCE(delivered_at, ?) WHERE org_id = ? AND wa_id = ?")
              .bind(s.at, s.at, orgId, s.wa_id),
          );
        }
      }
      for (const phone of new Set(optOutPhones)) out.push(db.prepare("UPDATE customers SET wa_opt_out = 1 WHERE org_id = ? AND phone = ?").bind(orgId, phone));
      return out;
    },

    /** FM PUT /customers/:id/whatsapp: sets the flag and audits it in one batch; null when this org has no such customer. */
    async setOptOut(customerId: number, optOut: boolean, actor: { id: number; name: string }): Promise<Customer | null> {
      const old = await db
        .prepare("SELECT name, phone, wa_opt_out FROM customers WHERE org_id = ? AND id = ?")
        .bind(orgId, customerId)
        .first<{ name: string | null; phone: string | null; wa_opt_out: number }>();
      if (!old) return null;
      await db.batch([
        db.prepare("UPDATE customers SET wa_opt_out = ? WHERE org_id = ? AND id = ?").bind(optOut ? 1 : 0, orgId, customerId),
        auditRepo(db, orgId).stmt({
          actor,
          entity: "settings", // FM parity
          entityId: customerId,
          ref: `Customer ${old.name ?? old.phone ?? customerId}`,
          action: "update",
          before: { wa_opt_out: !!old.wa_opt_out },
          after: { wa_opt_out: optOut },
        }),
      ]);
      const row = await db
        .prepare("SELECT id, name, phone, visits, spent, last_visit_at, wa_opt_out FROM customers WHERE org_id = ? AND id = ?")
        .bind(orgId, customerId)
        .first<CustomerRow>();
      return row ? { ...row, wa_opt_out: !!row.wa_opt_out } : null;
    },
  };
}

// ---------- campaigns (wa_campaigns + their queued wa_messages) ----------

/** Customers a campaign goes to (FM AUDIENCE, per org): a phone and not opted out (RF3). Binds ?1 = org. */
const AUDIENCE_SQL = "FROM customers WHERE org_id = ?1 AND phone IS NOT NULL AND wa_opt_out = 0";

/**
 * FM CAMPAIGN_SELECT, per org: every count and the creator's name are tied to the campaign's own org. Binds ?1 = org;
 * callers append " AND k.<col> = ?2" (or nothing) and the ORDER/LIMIT.
 */
export const CAMPAIGN_SELECT = `SELECT k.id, k.template, k.total, k.created_at, k.finished_at, u.name AS created_by_name,
    (SELECT COUNT(*) FROM wa_messages m WHERE m.org_id = k.org_id AND m.campaign_id = k.id AND m.status = 'sent') AS sent,
    (SELECT COUNT(*) FROM wa_messages m WHERE m.org_id = k.org_id AND m.campaign_id = k.id AND m.status = 'failed') AS failed,
    (SELECT COUNT(*) FROM wa_messages m WHERE m.org_id = k.org_id AND m.campaign_id = k.id AND m.status = 'skipped') AS skipped,
    (SELECT COUNT(*) FROM wa_messages m WHERE m.org_id = k.org_id AND m.campaign_id = k.id AND m.status = 'queued') AS queued
  FROM wa_campaigns k LEFT JOIN users u ON u.org_id = k.org_id AND u.id = k.created_by
  WHERE k.org_id = ?1`;

/** A campaign's send settings (what a drain needs). */
export interface CampaignRow {
  id: number;
  template: string;
  language: string;
  params: string; // JSON WaParam[]
  finished_at: number | null;
}

/** One claimed queued message, with the customer's name and opt-out flag read at claim (= send) time. */
export interface ClaimedMessage {
  id: number;
  phone: string;
  customer_id: number | null;
  name: string | null;
  opted_out: number;
}

export interface CampaignCreate {
  uid: string;
  template: string;
  language: string;
  params: unknown[];
  actor: { id: number; name: string };
  /** At most this many recipients are queued (backstop for the route's audience check). */
  cap: number;
}

/** A drain claim older than this is taken over (a crashed drain); far longer than one batch of sends takes. */
export const CLAIM_STALE_MS = 300_000;
/** wa_messages.error on a claimed row whose Graph send is about to start (status stays 'queued'; the CHECK is unchanged). */
export const SENDING = "sending";
/** What a takeover writes on a row whose drain died during (or right after) its send: never re-sent (at-most-once). */
export const INTERRUPTED = "interrupted, may have been sent";

/**
 * This org's WhatsApp campaigns (FM routes.ts 1474-1521, wa-jobs drainCampaign). Every statement binds org_id as ?1.
 * The create batch finds the new campaign by (org_id, uid), never by the highest id (INV §8.2), and only creates it
 * while the org has no unfinished campaign (one at a time). The drain claim keeps FM's sent_at claim marker: one
 * UPDATE ... RETURNING stamps up to `limit` queued, unclaimed (or stale) rows, so two overlapping drains (two /next
 * clicks, /next vs the cron) get disjoint rows. Sends are at-most-once: a row is marked SENDING (error column) before
 * its Graph call, and a takeover turns a stale SENDING row into "failed: interrupted" instead of re-queueing it.
 */
export function waCampaignsRepo(db: D1Database, orgId: string) {
  const view = (where: string, ...binds: unknown[]) => db.prepare(`${CAMPAIGN_SELECT}${where}`).bind(orgId, ...binds);
  return {
    async audienceSize(): Promise<number> {
      return (await db.prepare(`SELECT COUNT(*) AS n ${AUDIENCE_SQL}`).bind(orgId).first<{ n: number }>())?.n ?? 0;
    },

    /** One read for the create checks: the audience size and whether an unfinished campaign exists. */
    async createCheck(): Promise<{ audience: number; running: boolean }> {
      const r = await db
        .prepare(
          `SELECT (SELECT COUNT(*) ${AUDIENCE_SQL}) AS n,
             EXISTS (SELECT 1 FROM wa_campaigns k WHERE k.org_id = ?1 AND k.finished_at IS NULL) AS running`,
        )
        .bind(orgId)
        .first<{ n: number; running: number }>();
      return { audience: r?.n ?? 0, running: !!r?.running };
    },

    /** The newest 20 (FM). */
    async list(): Promise<WaCampaign[]> {
      return (await view(" ORDER BY k.id DESC LIMIT 20").all<WaCampaign>()).results;
    },

    view(id: number): Promise<WaCampaign | null> {
      return view(" AND k.id = ?2", id).first<WaCampaign>();
    },

    row(id: number): Promise<CampaignRow | null> {
      return db
        .prepare("SELECT id, template, language, params, finished_at FROM wa_campaigns WHERE org_id = ?1 AND id = ?2")
        .bind(orgId, id)
        .first<CampaignRow>();
    },

    /**
     * One batch (one D1 round trip, atomic): the campaign row (only when no unfinished campaign exists), a queued
     * 'announcement' message per audience customer (INSERT ... SELECT, at most `cap`, only when that row was created),
     * total = the rows queued, the audit row (same condition), and the campaign as the API shows it. Null when another
     * unfinished campaign won the race (nothing written).
     */
    async create(k: CampaignCreate): Promise<WaCampaign | null> {
      const at = Date.now();
      const mine = { sql: "EXISTS (SELECT 1 FROM wa_campaigns WHERE org_id = ? AND uid = ?)", binds: [orgId, k.uid] };
      const res = await db.batch([
        db
          .prepare(
            `INSERT INTO wa_campaigns (org_id, uid, template, language, params, created_by, created_at)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE NOT EXISTS (SELECT 1 FROM wa_campaigns k WHERE k.org_id = ?1 AND k.finished_at IS NULL)`,
          )
          .bind(orgId, k.uid, k.template, k.language, JSON.stringify(k.params), k.actor.id, at),
        db
          .prepare(
            `INSERT INTO wa_messages (org_id, kind, customer_id, phone, template, status, campaign_id, created_by, created_at)
             SELECT ?1, 'announcement', id, phone, ?2, 'queued', (SELECT id FROM wa_campaigns WHERE org_id = ?1 AND uid = ?3), ?4, ?5
             ${AUDIENCE_SQL} AND EXISTS (SELECT 1 FROM wa_campaigns WHERE org_id = ?1 AND uid = ?3) ORDER BY id LIMIT ?6`,
          )
          .bind(orgId, k.template, k.uid, k.actor.id, at, k.cap),
        db
          .prepare(
            `UPDATE wa_campaigns SET total = (SELECT COUNT(*) FROM wa_messages m WHERE m.org_id = ?1 AND m.campaign_id = wa_campaigns.id)
             WHERE org_id = ?1 AND uid = ?2`,
          )
          .bind(orgId, k.uid),
        auditRepo(db, orgId).stmt({
          actor: k.actor,
          entity: "settings", // FM parity
          entityId: { sql: "(SELECT id FROM wa_campaigns WHERE org_id = ? AND uid = ?)", binds: [orgId, k.uid] },
          when: mine,
          ref: `WhatsApp announcement ${k.template}`,
          action: "create",
          before: null,
          after: { template: k.template, params: k.params },
        }),
        view(" AND k.uid = ?2", k.uid),
      ]);
      return (res[4]!.results as WaCampaign[])[0] ?? null;
    },

    /** Audits a template submitted to Meta (FM parity: entity settings, id 1). */
    async templateCreated(actor: { id: number; name: string }, after: Record<string, unknown>): Promise<void> {
      await auditRepo(db, orgId)
        .stmt({ actor, entity: "settings", entityId: 1, ref: `WhatsApp template ${String(after.name)}`, action: "create", before: null, after })
        .run();
    },

    /**
     * One round trip: first, rows of this campaign still marked SENDING under a stale claim (their drain died during
     * or right after the Graph call) become failed "interrupted, may have been sent", never re-sent; then up to
     * `limit` queued rows that are unclaimed or stale-claimed (claimed but never attempted) are claimed (sent_at =
     * `claim`). Returns exactly the rows the claim stamped, each with the customer's CURRENT name and opt-out flag.
     */
    async claim(campaignId: number, claim: number, limit: number): Promise<ClaimedMessage[]> {
      const stale = claim - CLAIM_STALE_MS;
      const [, r] = await db.batch([
        db
          .prepare(
            `UPDATE wa_messages SET status = 'failed', error = ?4 WHERE org_id = ?1 AND campaign_id = ?2 AND status = 'queued'
               AND error = ?5 AND sent_at < ?3`,
          )
          .bind(orgId, campaignId, stale, INTERRUPTED, SENDING),
        db
          .prepare(
            `UPDATE wa_messages SET sent_at = ?3, error = NULL
             WHERE org_id = ?1 AND id IN (
               SELECT id FROM wa_messages WHERE org_id = ?1 AND campaign_id = ?2 AND status = 'queued' AND COALESCE(sent_at, 0) < ?4 ORDER BY id LIMIT ?5)
             RETURNING id, phone, customer_id,
               (SELECT c.name FROM customers c WHERE c.org_id = ?1 AND c.id = wa_messages.customer_id) AS name,
               COALESCE((SELECT c.wa_opt_out FROM customers c WHERE c.org_id = ?1 AND c.id = wa_messages.customer_id), 0) AS opted_out`,
          )
          .bind(orgId, campaignId, claim, stale, limit),
      ]);
      return (r!.results as ClaimedMessage[]).sort((a, b) => a.id - b.id);
    },

    /** Marks a claimed row SENDING right before its Graph call; applies (changes = 1) only while this drain's claim holds. */
    sendingStatement(messageId: number, claim: number): D1PreparedStatement {
      return db
        .prepare("UPDATE wa_messages SET error = ?3 WHERE org_id = ?1 AND id = ?2 AND status = 'queued' AND sent_at = ?4")
        .bind(orgId, messageId, SENDING, claim);
    },

    /** The result of one claimed message (clears SENDING); only applies while this drain's claim is in place. */
    resultStatement(messageId: number, claim: number, r: SendResult, params: unknown[]): D1PreparedStatement {
      return db
        .prepare(
          "UPDATE wa_messages SET status = ?3, wa_id = ?4, error = ?5, params = ?6, sent_at = ?7 WHERE org_id = ?1 AND id = ?2 AND status = 'queued' AND sent_at = ?8",
        )
        .bind(orgId, messageId, r.status, r.status === "sent" ? r.wa_id : null, r.status === "sent" ? null : r.error, JSON.stringify(params), Date.now(), claim);
    },

    /** Hands claimed-but-unsent messages back (budget ran out): queued and unclaimed again. */
    releaseStatement(messageIds: number[], claim: number): D1PreparedStatement {
      return db
        .prepare("UPDATE wa_messages SET sent_at = NULL WHERE org_id = ?1 AND id IN (SELECT value FROM json_each(?2)) AND status = 'queued' AND sent_at = ?3")
        .bind(orgId, JSON.stringify(messageIds), claim);
    },

    /** Marks the campaign finished once no queued message remains (no-op otherwise). */
    finishStatement(campaignId: number): D1PreparedStatement {
      return db
        .prepare(
          `UPDATE wa_campaigns SET finished_at = ?3 WHERE org_id = ?1 AND id = ?2 AND finished_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM wa_messages m WHERE m.org_id = ?1 AND m.campaign_id = ?2 AND m.status = 'queued')`,
        )
        .bind(orgId, campaignId, Date.now());
    },

    viewStatement(campaignId: number): D1PreparedStatement {
      return view(" AND k.id = ?2", campaignId);
    },

    async run(stmts: D1PreparedStatement[]): Promise<D1Result[]> {
      return stmts.length ? db.batch(stmts) : [];
    },
  };
}
