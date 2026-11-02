import type { Context } from "hono";
import type { AppEnv, Env } from "../../env";
import type { Org } from "../../data/platform";
import type { WaConfig } from "../../core/services";
import { featuresFor } from "../../core/features-cache";
import { waConfigRepo } from "../../data/tenant";

/**
 * A salon is WA-ready when it has the `whatsapp` feature and a usable org_whatsapp row. Takes a request context
 * (uses the session's features) or a bare env (cron, webhook: features resolved for the org). Never throws for a bad
 * row: an undecryptable token (rotated SECRETS_KEY) means "not ready", so a sale never fails because of WhatsApp.
 */
export async function waSetup(x: Env | Context<AppEnv>, org: Org, known?: readonly string[]): Promise<WaConfig | null> {
  const isCtx = "req" in x && "env" in x;
  const env: Env = isCtx ? (x as Context<AppEnv>).env : (x as Env);
  const tenant = isCtx ? (x as Context<AppEnv>).get("tenant") : undefined;
  // `known`: the caller already has this org's features (the cron's org loader), so this costs exactly 1 statement.
  const features = known ?? (tenant && tenant.org.id === org.id ? tenant.features : (await featuresFor(env.DB, org)).features);
  if (!features.includes("whatsapp")) return null;
  return waConfigRepo(env.DB, org.id, env.SECRETS_KEY).get();
}

export async function waReady(x: Env | Context<AppEnv>, org: Org): Promise<boolean> {
  return (await waSetup(x, org)) !== null;
}
