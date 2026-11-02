import type { MeResponse } from "@ss/contract";
import type { App } from "../env";
import { HttpError } from "../core/errors";
import { checkPassword, hashPassword } from "../core/crypto";
import { issueSession } from "../core/session";
import { businessDay } from "../lib/clock";
import { clockOf, settingsRepo } from "../data/tenant";

/** Registers /me routes on the tenant router. Auth, origin and write guards come from the router-level tenantGuard; do not add them here. */
export function registerMe(tenantApi: App): void {
  tenantApi.get("/me", async (c) => {
    const { org, user, features, limits } = c.var.tenant;
    const settings = await settingsRepo(c.env.DB, org.id).get();
    const body: MeResponse = {
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
      org: { id: org.id, slug: org.slug, name: org.name, status: org.status, planId: org.planId },
      settings,
      features,
      limits,
      subscription: { status: org.status, planId: org.planId, trialEndsAt: org.trialEndsAt, graceEndsAt: org.graceEndsAt },
      brand: { name: c.env.BRAND_NAME },
      today: businessDay(Date.now(), clockOf(settings)),
    };
    return c.json(body);
  });

  tenantApi.put("/me/password", async (c) => {
    const { org, user, repo } = c.var.tenant;
    let b: { current?: unknown; next?: unknown } = {};
    try {
      const parsed = await c.req.json();
      if (parsed && typeof parsed === "object") b = parsed;
    } catch {
      /* falls through to the validation below */
    }
    if (typeof b.next !== "string" || b.next.length < 6) throw new HttpError(400, "New password must be at least 6 characters");
    if (typeof b.current !== "string" || !(await checkPassword(b.current, user.password_hash))) {
      throw new HttpError(400, "Current password is wrong");
    }
    // A new password signs out every other device (a stolen session stops working); this one gets a fresh cookie.
    const v = await repo.setPassword(user.id, await hashPassword(b.next), Date.now());
    await issueSession(c, { uid: user.id, orgId: org.id, v });
    return c.json({ ok: true });
  });
}
