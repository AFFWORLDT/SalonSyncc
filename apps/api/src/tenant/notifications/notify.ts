import type { Context } from "hono";
import type { AppEnv, Env } from "../../env";
import { services, type Push } from "../../core/services";
import { featuresFor } from "../../core/features-cache";
import { orgAppUrl } from "../../core/links";
import { platformRepo, type Org } from "../../data/platform";
import { notificationsRepo } from "../../data/tenant";

/** The org and its features: from the session when the context is this org's, else loaded (cron, webhook). */
async function orgAndFeatures(target: Context<AppEnv> | Env, orgId: string): Promise<{ env: Env; org: Org; features: readonly string[] } | null> {
  if (!("DB" in target)) {
    const t = target.var.tenant;
    if (t?.org.id === orgId) return { env: target.env, org: t.org, features: t.features };
    target = target.env;
  }
  const org = await platformRepo(target.DB).orgById(orgId);
  if (!org) return null;
  return { env: target, org, features: (await featuresFor(target.DB, org)).features };
}

/**
 * Tells these users of `orgId` something: records a feed row each (the bell has it even without a device), then, when
 * FCM_SERVICE_ACCOUNT is set, pushes to their devices in this org and deletes the tokens FCM reports dead.
 * Skips entirely when the org lacks `push`. Ids that are not this org's users are ignored. Never throws (errors are logged).
 */
export async function notifyUsers(target: Context<AppEnv> | Env, orgId: string, userIds: number[], push: Push): Promise<void> {
  try {
    const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) return;
    const of = await orgAndFeatures(target, orgId);
    if (!of || !of.features.includes("push")) return;
    const { env, org } = of;
    const repo = notificationsRepo(env.DB, orgId);
    await repo.record(ids, push); // feed first, so the bell has it even if the push fails
    if (!env.FCM_SERVICE_ACCOUNT) return;
    const tokens = await repo.tokensFor(ids);
    if (!tokens.length) return;
    const link = new URL(push.path ?? "/", `${orgAppUrl(env, org)}/`).toString();
    const { dead } = await services(env).push.send(env, tokens, { ...push, link });
    if (dead.length) await repo.deleteTokens(dead);
  } catch (err) {
    console.error("notifyUsers failed", err);
  }
}
