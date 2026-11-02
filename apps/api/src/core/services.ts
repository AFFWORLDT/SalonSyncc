import type { Env } from "../env";
import type { WaSlot } from "@ss/contract";
import { fcmPush } from "../integrations/push-client";
import { graphWaClient } from "../integrations/wa-client";
import type { WaValue } from "../lib/whatsapp";

/**
 * Outbound service clients (WhatsApp Cloud API, FCM push) behind one seam so tests swap in fakes
 * (test/fakes.ts) and no test ever reaches Meta or Google. Real clients: integrations/push-client.ts and integrations/wa-client.ts.
 */

/** One org's WhatsApp number: from org_whatsapp with the token decrypted. Never logged or returned. */
export interface WaConfig {
  phoneNumberId: string;
  wabaId: string;
  token: string;
  /** Comma-separated canonical phones; when set only these are messaged (the rest are "skipped"). */
  testNumbers: string | null;
  /** The org's calling code (settings phone_country), to turn canonical phones into Meta's digits. */
  callingCode: string;
}

/** A template's blank filled per send (FM WaValue): a plain numbered body value, a header/body slot, or a button suffix. */
export type { WaValue };

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
  slots: WaSlot[];
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
  /**
   * True when `cfg.token` can read `cfg.phoneNumberId` (GET {GRAPH}/{id}?fields=id answers with that id): proof the
   * salon really holds that number before it is connected (M6). 1 subrequest; never throws (false on any failure).
   */
  checkNumber(cfg: WaConfig): Promise<boolean>;
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

/** Cloudflare Turnstile (signup bot check). */
export interface TurnstileClient {
  verify(secret: string, token: string, ip: string | null): Promise<boolean>;
}

/** siteverify (1 subrequest). Network errors count as a failed check. */
const cfTurnstile: TurnstileClient = {
  async verify(secret, token, ip) {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    try {
      const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
      const d = (await r.json()) as { success?: boolean };
      return d.success === true;
    } catch {
      return false;
    }
  },
};

/** Outgoing platform email (Resend). */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}
export interface MailClient {
  /** Sends one email; true when the provider accepted it. Never throws. */
  send(env: Env, m: MailMessage): Promise<boolean>;
}

/** Resend's HTTP API (1 subrequest). Off without RESEND_API_KEY or MAIL_FROM. */
const resendMail: MailClient = {
  async send(env, m) {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.MAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
      });
      if (!r.ok) console.error("mail send failed", r.status);
      return r.ok;
    } catch (e) {
      console.error("mail send failed", (e as Error).message);
      return false;
    }
  },
};

/** Stripe's REST API (1 subrequest per call), pinned to one API version. Throws StripeError on a non-2xx answer. */
export interface StripeClient {
  post<T = Record<string, unknown>>(env: Env, path: string, params: Record<string, string>, opts?: { idempotencyKey?: string }): Promise<T>;
  get<T = Record<string, unknown>>(env: Env, path: string): Promise<T>;
}
export class StripeError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}
/** The Stripe API version every request uses (subscription.current_period_end and invoice.subscription at top level). */
export const STRIPE_VERSION = "2024-06-20";

async function stripeCall<T>(env: Env, method: "GET" | "POST", path: string, params?: Record<string, string>, idem?: string): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new StripeError("Stripe is not set up");
  const headers: Record<string, string> = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Stripe-Version": STRIPE_VERSION };
  if (params) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idem) headers["Idempotency-Key"] = idem;
  const r = await fetch(`https://api.stripe.com/v1${path}`, { method, headers, body: params ? new URLSearchParams(params).toString() : undefined });
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!r.ok) {
    console.error("stripe failed", method, path, r.status, j.error?.message);
    throw new StripeError(j.error?.message ?? `Stripe answered ${r.status}`, r.status);
  }
  return j as T;
}

const stripeApi: StripeClient = {
  post: (env, path, params, opts) => stripeCall(env, "POST", path, params, opts?.idempotencyKey),
  get: (env, path) => stripeCall(env, "GET", path),
};

export interface Services {
  wa: WaClient;
  push: PushClient;
  turnstile: TurnstileClient;
  mail: MailClient;
  stripe: StripeClient;
}

/** Real clients: Meta Graph (v21.0) and FCM v1. */
const REAL: Services = {
  wa: graphWaClient(),
  push: fcmPush,
  turnstile: cfTurnstile,
  mail: resendMail,
  stripe: stripeApi,
};

let override: ((env: Env) => Services) | null = null;

/** Test-only: swap the clients (null restores the real ones). Ignored unless ENVIRONMENT is "test". */
export function setServicesForTest(fn: ((env: Env) => Services) | null): void {
  override = fn;
}

export function services(env: Env): Services {
  return override && env.ENVIRONMENT === "test" ? override(env) : REAL;
}
