import type { Hono } from "hono";
import type { FeatureKey } from "@ss/features";
import type { Org } from "./data/platform";
import type { UserRow, tenantRepo } from "./data/tenant";
import type { PlatformUser } from "./data/admin";

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  BRAND_NAME: string;
  ROOT_DOMAIN: string;
  ADMIN_HOST: string;
  MAIL_FROM: string;
  SUPPORT_EMAIL: string;
  ENVIRONMENT?: string;
  /** App origin for message links when ROOT_DOMAIN is empty (workers.dev), e.g. https://salonkit-app.affworld0.workers.dev. */
  APP_ORIGIN: string;
  /** Secret: base64 of 32 random bytes; AES-GCM key for org_whatsapp.token_enc (lib/secrets). */
  SECRETS_KEY: string;
  /** Secret: the Firebase service-account JSON (one FCM project for all salons). Unset: push sends are skipped. */
  FCM_SERVICE_ACCOUNT?: string;
  /** Secret: the Meta app secret for webhook signatures. Required by the webhook POST (503 without it). */
  WA_APP_SECRET?: string;
  /** Secret: the webhook GET handshake token. */
  WA_VERIFY_TOKEN?: string;
  /** Secret: Resend API key for platform email (welcome, reminders). Unset: emails are logged as skipped. */
  RESEND_API_KEY?: string;
  /** Secret: Cloudflare Turnstile secret for signup. Unset: the check is skipped (the IP rate limit still applies). */
  TURNSTILE_SECRET?: string;
  /** Static dashboard export (wrangler assets). Only /api/* reaches the Worker (run_worker_first). */
  ASSETS?: Fetcher;
  /** Local dev only (.dev.vars), comma-separated origins allowed to write cross-origin, e.g. http://localhost:3000. Never in wrangler vars. */
  DEV_ALLOWED_ORIGINS?: string;
}

export interface TenantContext {
  org: Org;
  user: UserRow;
  repo: ReturnType<typeof tenantRepo>;
  features: FeatureKey[];
  limits: { max_staff: number | null };
  /** Support mode: the platform user signed in as this salon's owner (null for a normal session). */
  supportBy: number | null;
}

export type AppEnv = { Bindings: Env; Variables: { tenant: TenantContext; platform: PlatformUser } };
export type App = Hono<AppEnv>;
