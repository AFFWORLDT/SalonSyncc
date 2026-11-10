import type { MeResponse } from "@ss/contract";
import type { App } from "../env";
import { HttpError } from "../core/errors";
import { checkPassword, hashPassword } from "../core/crypto";
import { issueSession } from "../core/session";
import { LOGIN_WINDOW_MS, isLocked, loginLimits } from "../lib/limits";
import { businessDay } from "../lib/clock";
import { clockOf, settingsRepo, withWaReady } from "../data/tenant";
import { avatarUrl, bannerUrl, usersRepo } from "../data/tenant/users";
import { adminRepo } from "../data/admin";
import { billingRepo } from "../data/billing";
import { services } from "../core/services";
import { invalidateFeatures } from "../core/features-cache";

/** Registers /me routes on the tenant router. Auth, origin and write guards come from the router-level tenantGuard; do not add them here. */
export function registerMe(tenantApi: App): void {
  tenantApi.get("/me", async (c) => {
    const { org, user, features, limits } = c.var.tenant;
    const settings = await settingsRepo(c.env.DB, org.id).get();
    const body: MeResponse = {
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        commission_pct: user.commission_pct,
        avatar_url: avatarUrl(user.id, user.avatar_v, org.slug),
        banner_url: bannerUrl(user.id, user.banner_v, org.slug),
        can_add_expense: !!user.can_add_expense,
      },
      org: { id: org.id, slug: org.slug, name: org.name, status: org.status, planId: org.planId },
      settings: await withWaReady(c.env.DB, org.id, features, settings),
      features,
      limits,
      subscription: { status: org.status, planId: org.planId, trialEndsAt: org.trialEndsAt, graceEndsAt: org.graceEndsAt },
      brand: { name: c.env.BRAND_NAME },
      today: businessDay(Date.now(), clockOf(settings)),
      support: c.var.tenant.supportBy !== null,
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
    if (b.next.length > 200) throw new HttpError(400, "New password must be at most 200 characters");
    // Wrong guesses of the current password count against the per-device username key, like login.
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const [, perDevice] = loginLimits(org.id, user.username, ip);
    const at = Date.now();
    if (isLocked(await repo.loginFailureCount(perDevice!.key, at - LOGIN_WINDOW_MS), perDevice!.max)) {
      throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
    }
    if (typeof b.current !== "string" || !(await checkPassword(b.current, user.password_hash))) {
      await repo.recordLoginFailure([perDevice!.key], at, at - LOGIN_WINDOW_MS);
      throw new HttpError(400, "Current password is wrong");
    }
    await repo.clearLoginFailures([perDevice!.key]);
    // A new password signs out every other device (a stolen session stops working); this one stays signed in:
    // a fresh cookie on the web, the new version on this phone's session row.
    const v = await repo.setPassword(user.id, await hashPassword(b.next), Date.now());
    const phone = c.var.tenant.mobileSessionId;
    // The other phones' pushes stop too (their sessions are now stale).
    await c.env.DB.prepare("DELETE FROM push_tokens WHERE org_id = ? AND user_id = ? AND mobile_session_id IS NOT NULL AND mobile_session_id <> ?")
      .bind(org.id, user.id, phone ?? "")
      .run();
    if (phone) await c.env.DB.prepare("UPDATE mobile_sessions SET session_version = ? WHERE id = ?").bind(v, phone).run();
    else await issueSession(c, { uid: user.id, orgId: org.id, v });
    return c.json({ ok: true });
  });

  /**
   * Deletes my account (App Store rule 5.1.1(v)). Staff: my sign-in and personal details go; a user referenced by
   * sales is deactivated and scrubbed so the salon's reports stay intact. The owner: the whole salon closes (soft
   * delete, as the super admin does it), everyone is signed out, personal details are erased and card billing stops.
   * Confirm with the salon ID (owner) or "DELETE" (staff). Never in support mode.
   */
  tenantApi.delete("/me", async (c) => {
    const { org, user, supportBy } = c.var.tenant;
    if (supportBy !== null) throw new HttpError(403, "Support can't delete an account");
    let b: { confirm?: unknown } = {};
    try {
      const parsed = await c.req.json();
      if (parsed && typeof parsed === "object") b = parsed;
    } catch {
      /* falls through to the check below */
    }
    const confirm = typeof b.confirm === "string" ? b.confirm.trim() : "";
    const db = c.env.DB;
    const now = Date.now();
    const scrub = (where: string, ...args: unknown[]) =>
      db
        .prepare(`UPDATE users SET email = NULL, phone = NULL, avatar = NULL, avatar_type = NULL, avatar_v = -(abs(avatar_v) + 1), banner = NULL, banner_type = NULL, banner_v = -(abs(banner_v) + 1), active = 0, session_version = session_version + 1, updated_at = ? WHERE ${where}`)
        .bind(now, ...args);

    if (user.role !== "owner") {
      if (confirm.toUpperCase() !== "DELETE") throw new HttpError(400, 'Type DELETE to confirm', "confirm");
      const repo = usersRepo(db, org.id);
      const target = await repo.byId(user.id);
      if (!target) throw new HttpError(404, "Not found");
      const actor = { id: user.id, name: user.name };
      if (await repo.userHasActivity(user.id)) {
        await repo.deactivate(target, actor);
        await db.batch([
          scrub("org_id = ? AND id = ?", org.id, user.id),
          db.prepare("DELETE FROM mobile_sessions WHERE org_id = ? AND user_id = ?").bind(org.id, user.id),
          db.prepare("DELETE FROM push_tokens WHERE org_id = ? AND user_id = ?").bind(org.id, user.id),
        ]);
      } else {
        await repo.remove(target, actor);
      }
      return c.json({ ok: true });
    }

    if (confirm.toLowerCase() !== org.slug.toLowerCase()) throw new HttpError(400, "Type your salon ID to confirm", "confirm");
    // Card billing stops first, so a closed salon is never charged again.
    const sub = await billingRepo(db).sub(org.id);
    if (sub?.provider === "stripe" && sub.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(sub.status ?? "")) {
      await services(c.env).stripe.post(c.env, `/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`, { cancel_at_period_end: "true" });
    }
    await adminRepo(db).updateOrg(org.id, { status: "deleted", deleted_at: now }, { who: `owner:${user.username}`, action: "self_delete", orgId: org.id, before: { status: org.status }, after: { status: "deleted" }, at: now });
    await db.batch([
      scrub("org_id = ?", org.id),
      db.prepare("UPDATE orgs SET owner_email = NULL, owner_phone = NULL WHERE id = ?").bind(org.id),
      db.prepare("DELETE FROM mobile_sessions WHERE org_id = ?").bind(org.id),
      db.prepare("DELETE FROM push_tokens WHERE org_id = ?").bind(org.id),
    ]);
    invalidateFeatures(org.id);
    return c.json({ ok: true });
  });
}
