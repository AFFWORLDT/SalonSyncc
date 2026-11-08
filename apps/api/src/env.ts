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
  /** SHA-256 fingerprints of the Android app's signing certificates (comma separated), for App Links. */
  ANDROID_CERT_SHA256?: string;
  /** Firebase project whose ID tokens "Continue with Google / Apple" accepts (aud / iss). */
  FIREBASE_PROJECT_ID?: string;
  /** Firebase web app's browser API key (website "Continue with Google"); a secret so it stays out of git. */
  FIREBASE_WEB_API_KEY?: string;
  /** Optional; defaults to <project>.firebaseapp.com. */
  FIREBASE_AUTH_DOMAIN?: string;
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
  /** Secret: Stripe secret key (sk_test_… / sk_live_…). Unset: billing is off and the plan page says to contact us. */
  STRIPE_SECRET_KEY?: string;
  /** Secret: the Stripe webhook endpoint's signing secret (whsec_…). Required by POST /api/stripe/webhook (503 without it). */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Static dashboard export (wrangler assets). Only /api/* reaches the Worker (run_worker_first). */
  ASSETS?: Fetcher;
  /** Local dev only (.dev.vars), comma-separated origins allowed to write cross-origin, e.g. http://localhost:3000. Never in wrangler vars. */
  DEV_ALLOWED_ORIGINS?: string;
  /**
   * Internal only: set by the AI connect tool runner (mcp/server.ts) on the env copy it passes to its in-process route
   * call, never a wrangler var or secret. tenantAuth appends " via <MCP_VIA>" to the user's name so audit rows show it.
   */
  MCP_VIA?: string;
}

export interface TenantContext {
  org: Org;
  user: UserRow;
  repo: ReturnType<typeof tenantRepo>;
  /** What this user may use: the org's features narrowed by the per-role switches. Gates routes and menus. */
  features: FeatureKey[];
  /** The org's features before the role switches. Salon-wide side effects (owner pushes, auto WhatsApp) use these. */
  orgFeatures: FeatureKey[];
  limits: { max_staff: number | null };
  /** Support mode: the platform user signed in as this salon's owner (null for a normal session). */
  supportBy: number | null;
  /** The phone-app session this request came in on (bearer token), or null for the web cookie. */
  mobileSessionId: string | null;
}

export type AppEnv = { Bindings: Env; Variables: { tenant: TenantContext; platform: PlatformUser } };
export type App = Hono<AppEnv>;
