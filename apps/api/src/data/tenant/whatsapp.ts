import { decryptSecret, encryptSecret } from "../../lib/secrets";
import { auditRepo } from "./audit";
import type { WaConfig } from "../../core/services";

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
