import type { Context } from "hono";
import type { Settings } from "@ss/contract";
import type { AppEnv } from "../../env";
import { services } from "../../core/services";
import { usersRepo } from "../../data/tenant";
import { orgAppUrl } from "../../core/links";
import type { Email, StaffEmailBase } from "../../emails/staff";

/**
 * Emails the given staff who have an email address (1 D1 statement + 1 subrequest: one Resend batch). Never throws:
 * callers run it in waitUntil after the change has been saved, and email is a nicety on top of the feed and push.
 */
export async function emailStaff(c: Context<AppEnv>, s: Settings, ids: number[], make: (base: StaffEmailBase) => Email): Promise<void> {
  if (!ids.length) return;
  try {
    const { org } = c.var.tenant;
    const results = await usersRepo(c.env.DB, org.id).emailsFor(ids);
    if (!results.length) return;
    const site = c.env.ROOT_DOMAIN ? `https://${c.env.ROOT_DOMAIN}` : orgAppUrl(c.env, org);
    const mails = results.map((u) => make({ brand: c.env.BRAND_NAME, siteUrl: site, salonName: s.display_name || org.name, appUrl: orgAppUrl(c.env, org), to: u.email, name: u.name }));
    await services(c.env).mail.sendBatch(c.env, mails);
  } catch (err) {
    console.error("staff email failed", err);
  }
}
