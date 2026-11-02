import type { Hono } from "hono";
import type { FeatureKey } from "@ss/features";
import type { Org } from "./data/platform";
import type { UserRow, tenantRepo } from "./data/tenant";

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  BRAND_NAME: string;
  ROOT_DOMAIN: string;
  ADMIN_HOST: string;
  MAIL_FROM: string;
  SUPPORT_EMAIL: string;
  ENVIRONMENT?: string;
}

export interface TenantContext {
  org: Org;
  user: UserRow;
  repo: ReturnType<typeof tenantRepo>;
  features: FeatureKey[];
  limits: { max_staff: number | null };
}

export type AppEnv = { Bindings: Env; Variables: { tenant: TenantContext } };
export type App = Hono<AppEnv>;
