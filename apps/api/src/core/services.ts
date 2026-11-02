import type { Env } from "../env";
import { fcmPush } from "../integrations/push-client";

/**
 * Outbound service clients (WhatsApp Cloud API, FCM push) behind one seam so tests swap in fakes
 * (test/fakes.ts) and no test ever reaches Meta or Google. The real push client is integrations/push-client.ts; WhatsApp lands in Task 6.
 */

/** One org's WhatsApp number: from org_whatsapp with the token decrypted. Never logged or returned. */
export interface WaConfig {
  phoneNumberId: string;
  wabaId: string;
  token: string;
}

/** A template's blank filled per send (FM WaValue): a plain numbered body value, a header/body slot, or a button suffix. */
export type WaValue =
  | string
  | { part: "header" | "body"; key?: string; media?: "image" | "video" | "document"; text: string; filename?: string }
  | { part: "button"; index: number; text: string };

export type SendResult = { status: "sent"; wa_id: string } | { status: "failed"; error: string } | { status: "skipped"; error: string };

/** A Meta template as listed (FM WaTemplate); the contract type arrives with the WhatsApp routes. */
export interface WaTemplateInfo {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  header: string | null;
  body: string;
  vars: number;
  slots: unknown[];
  sendable: boolean;
}

export interface WaTemplateCreate {
  name: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  body: string;
  examples: string[];
}

export interface WaClient {
  sendTemplate(cfg: WaConfig, phone: string, template: string, lang: string, params: WaValue[]): Promise<SendResult>;
  /** Uploads a header file; returns Meta's media id. */
  uploadMedia(cfg: WaConfig, file: File): Promise<string>;
  listTemplates(cfg: WaConfig): Promise<WaTemplateInfo[]>;
  createTemplate(cfg: WaConfig, input: WaTemplateCreate): Promise<{ id: string; status: string; name?: string }>;
}

export interface Push {
  title: string;
  body: string;
  /** App path opened when the notification is tapped, e.g. "/sales/". */
  path?: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string;
  /** Absolute URL opened on tap (the salon's own app origin); notifyUsers sets it from `path`. */
  link?: string;
}

export interface PushClient {
  /** Sends to every token; returns the tokens FCM reported as gone (the caller deletes them). */
  send(env: Env, tokens: string[], push: Push): Promise<{ dead: string[] }>;
}

export interface Services {
  wa: WaClient;
  push: PushClient;
}

const notImplemented = (what: string) => async (): Promise<never> => {
  throw new Error(`${what}: not implemented`);
};

/** Real clients. WhatsApp is a stub until Task 6 implements it. */
const REAL: Services = {
  wa: {
    sendTemplate: notImplemented("wa.sendTemplate"),
    uploadMedia: notImplemented("wa.uploadMedia"),
    listTemplates: notImplemented("wa.listTemplates"),
    createTemplate: notImplemented("wa.createTemplate"),
  },
  push: fcmPush,
};

let override: ((env: Env) => Services) | null = null;

/** Test-only: swap the clients (null restores the real ones). Ignored unless ENVIRONMENT is "test". */
export function setServicesForTest(fn: ((env: Env) => Services) | null): void {
  override = fn;
}

export function services(env: Env): Services {
  return override && env.ENVIRONMENT === "test" ? override(env) : REAL;
}
