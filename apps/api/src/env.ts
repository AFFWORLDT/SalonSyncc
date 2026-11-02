import type { Hono } from "hono";

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  BRAND_NAME: string;
  ROOT_DOMAIN: string;
  ADMIN_HOST: string;
  MAIL_FROM: string;
  SUPPORT_EMAIL: string;
}

export type AppEnv = { Bindings: Env; Variables: Record<string, unknown> };
export type App = Hono<AppEnv>;
