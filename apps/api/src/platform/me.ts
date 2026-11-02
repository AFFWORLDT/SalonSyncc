import type { App } from "../env";

/** Registers GET /me on the tenant router. Auth comes from the router-level tenantGuard; do not add it here. */
export function registerMe(tenantApi: App): void {
  tenantApi.get("/me", async (c) => {
    const { org, user, repo, features, limits } = c.var.tenant;
    const s = await repo.settings();
    return c.json({
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
      org: { id: org.id, slug: org.slug, name: org.name, status: org.status, planId: org.planId },
      settings: {
        displayName: s.displayName,
        logoUrl: s.logoUrl,
        brandColor: s.brandColor,
        currency: s.currency,
        locale: s.locale,
        timezone: s.timezone,
      },
      features,
      limits,
      subscription: { status: org.status, planId: org.planId, trialEndsAt: org.trialEndsAt, graceEndsAt: org.graceEndsAt },
      brand: { name: c.env.BRAND_NAME },
    });
  });
}
