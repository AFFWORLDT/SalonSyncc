import { decryptSecret, encryptSecret } from "../../lib/secrets";
import { auditRepo } from "./audit";
import type { Customer, WaMessage } from "@ss/contract";
import type { SendResult, WaConfig } from "../../core/services";

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
  return {
    /** Writes exactly one row for a send attempt and returns it as the API shows it. */
    async log(m: WaLogInput, r: SendResult): Promise<WaMessage> {
      const at = Date.now();
      const row = await db
        .prepare(
          `INSERT INTO wa_messages (org_id, kind, customer_id, phone, template, params, status, wa_id, error, sale_id, created_by, created_at, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${WA_MESSAGE_COLS}`,
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
        )
        .first<WaMessage>();
      return row!;
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
