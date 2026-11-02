import type { Env } from "../env";

/**
 * The salon's app origin for links in messages (receipt `${orgAppUrl}/r/?t=`, rating `${orgAppUrl}/rate/?t=`):
 * the tenant subdomain when ROOT_DOMAIN is set, else APP_ORIGIN (workers.dev: the token carries the org).
 */
export function orgAppUrl(env: Pick<Env, "ROOT_DOMAIN" | "APP_ORIGIN">, org: { slug: string }): string {
  if (env.ROOT_DOMAIN) return `https://${org.slug}.${env.ROOT_DOMAIN}`;
  return env.APP_ORIGIN.replace(/\/+$/, "");
}
