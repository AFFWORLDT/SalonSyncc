import { Hono, type Context, type MiddlewareHandler } from "hono";
import { FEATURE_KEYS, OVERRIDE_ONLY, isFeatureKey, type FeatureKey } from "@ss/features";
import { mcpRepo } from "../data/tenant/mcp";
import type { AppEnv } from "../env";
import { HttpError } from "../core/errors";
import { checkPassword, hashPassword, randomToken } from "../core/crypto";
import { originGuard, WRITE_METHODS } from "../core/pipeline";
import { clearPlatformSession, issuePlatformSession, readPlatformSession } from "../core/platform-session";
import { slugFromHost } from "../core/tenant";
import { computeFeatures, invalidateAllFeatures, invalidateFeatures } from "../core/features-cache";
import { adminRepo, type AdminOrgRow, type AuditInput, type PlatformRole, type PlatformUser } from "../data/admin";
import { parseLimits, platformRepo } from "../data/platform";
import { rateCount, rateHit } from "../data/infra";
import { isLocked, loginWindow } from "../lib/limits";
import { sha256 } from "../lib/hash";

const DAY = 86_400_000;
/** How long a "Log in as salon" code works, and the support session it opens. */
export const SUPPORT_CODE_MS = 60_000;
export const SUPPORT_SESSION_MS = 2 * 60 * 60 * 1000;
/** Wrong platform passwords per IP per 15-minute window. */
export const PLATFORM_LOGIN_MAX = 10;
/** Salons one bulk action may touch (1 update + 1 audit row each stays inside the 45-statement budget). */
export const BULK_MAX = 20;
const EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

type PEnv = AppEnv;
type PC = Context<PEnv>;

const bad = (m: string, code?: string) => new HttpError(400, m, code);
const ip = (c: PC) => c.req.header("CF-Connecting-IP") ?? "unknown";

async function body(c: PC): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The panel only answers on admin.<domain> (or anywhere when ROOT_DOMAIN is empty: workers.dev, local dev). */
const hostGuard: MiddlewareHandler<PEnv> = async (c, next) => {
  if (c.env.ROOT_DOMAIN && slugFromHost(new URL(c.req.url).host, c.env.ROOT_DOMAIN, c.env.ADMIN_HOST).kind !== "admin") {
    return c.json({ error: "Not found" }, 404);
  }
  await next();
};

/** Signed ss_platform cookie + a live platform user with the same session_version. 1 statement. */
const platformAuth: MiddlewareHandler<PEnv> = async (c, next) => {
  const s = await readPlatformSession(c);
  const user = s ? await adminRepo(c.env.DB).userById(s.pid) : null;
  if (!s || !user || user.session_version !== s.v) throw new HttpError(401, "Please sign in");
  c.set("platform", user);
  await next();
};

/** Support accounts read and open support sessions; every other change needs the owner role. */
const ownerOnly: MiddlewareHandler<PEnv> = async (c, next) => {
  if (c.var.platform.role !== "owner") throw new HttpError(403, "Only a platform owner can do this");
  await next();
};

const auditOf = (c: PC, action: string, orgId: string | null, before?: unknown, after?: unknown): AuditInput => ({
  who: c.var.platform.email,
  action,
  orgId,
  before,
  after,
  at: Date.now(),
});

export const platformApi = new Hono<PEnv>();
platformApi.use("*", hostGuard);
platformApi.use("*", async (c, next) => (WRITE_METHODS.has(c.req.method.toUpperCase()) ? originGuard(c, next) : next()));

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword(crypto.randomUUID()));

platformApi.post("/login", async (c) => {
  const b = await body(c);
  const email = typeof b.email === "string" ? b.email.trim().slice(0, 120) : "";
  const password = typeof b.password === "string" ? b.password : "";
  const at = Date.now();
  const key = `plogin:${ip(c)}`;
  if (isLocked(await rateCount(c.env.DB, key, loginWindow(at)), PLATFORM_LOGIN_MAX)) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  const repo = adminRepo(c.env.DB);
  const user = email ? await repo.userByEmail(email) : null;
  const ok = await checkPassword(password, user?.password_hash ?? (await dummyHash()));
  if (!user || !ok) {
    await rateHit(c.env.DB, key, loginWindow(at));
    throw new HttpError(401, "Wrong email or password");
  }
  await issuePlatformSession(c, user.id, user.session_version);
  return c.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
});

platformApi.post("/logout", (c) => {
  clearPlatformSession(c);
  return c.json({ ok: true });
});

platformApi.use("*", async (c, next) => (new URL(c.req.url).pathname.endsWith("/platform/login") ? next() : platformAuth(c, next)));
// Writes need the owner role, except opening a support session (support staff exist to do exactly that) and the
// signed-in user's own password.
platformApi.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (!WRITE_METHODS.has(c.req.method.toUpperCase()) || /\/orgs\/[^/]+\/support$/.test(path) || path.endsWith("/platform/me/password")) return next();
  return ownerOnly(c, next);
});

platformApi.get("/me", (c) => {
  const u = c.var.platform;
  return c.json({ id: u.id, email: u.email, role: u.role, brand: c.env.BRAND_NAME });
});

platformApi.put("/me/password", async (c) => {
  const b = await body(c);
  const u = c.var.platform;
  if (typeof b.next !== "string" || b.next.length < 10 || b.next.length > 200) throw bad("New password must be 10 to 200 characters");
  if (typeof b.current !== "string" || !(await checkPassword(b.current, u.password_hash))) throw bad("Current password is wrong");
  const v = await adminRepo(c.env.DB).setUserPassword(u.id, await hashPassword(b.next), auditOf(c, "password_change", null, undefined, { id: u.id }));
  await issuePlatformSession(c, u.id, v);
  return c.json({ ok: true });
});

// ---------- overview ----------
platformApi.get("/overview", async (c) => c.json(await adminRepo(c.env.DB).overview(Date.now())));

// ---------- salons ----------
const STATUSES = ["trial", "active", "grace", "past_due", "expired", "deactivated", "deleted"];
const toOrgOut = (r: AdminOrgRow) => ({ ...r, limits_override: r.limits_override_json ? parseLimits(r.limits_override_json) : null, limits_override_json: undefined });

platformApi.get("/orgs", async (c) => {
  const status = c.req.query("status") ?? "";
  const plan = c.req.query("plan") ?? "";
  if (status && !STATUSES.includes(status)) throw bad("Unknown status");
  const rows = await adminRepo(c.env.DB).orgs({ status, plan: plan.slice(0, 30), q: (c.req.query("q") ?? "").trim().slice(0, 60), now: Date.now() });
  return c.json(rows.map(toOrgOut));
});

async function loadOrg(c: PC): Promise<AdminOrgRow> {
  const id = c.req.param("id") ?? "";
  const row = id.length <= 64 ? await adminRepo(c.env.DB).org(id, Date.now()) : null;
  if (!row) throw new HttpError(404, "No such salon");
  return row;
}

platformApi.get("/orgs/:id", async (c) => {
  const row = await loadOrg(c);
  const repo = adminRepo(c.env.DB);
  const platform = platformRepo(c.env.DB);
  const [extras, planFeatures, planLimits] = await Promise.all([repo.orgExtras(row.id), platform.planFeatures(row.plan_id), platform.planLimits(row.plan_id)]);
  const org = (await platform.orgById(row.id))!;
  const effective = computeFeatures(org, planFeatures, planLimits, extras.overrides);
  return c.json({ org: toOrgOut(row), ...extras, plan_features: planFeatures, plan_limits: planLimits, features: effective.features, limits: effective.limits });
});

const days = (v: unknown): number => {
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 365) throw bad("Days must be a whole number from 1 to 365");
  return v as number;
};

platformApi.post("/orgs/:id/plan", async (c) => {
  const row = await loadOrg(c);
  const b = await body(c);
  const plan = typeof b.plan_id === "string" ? b.plan_id : "";
  if (!(await adminRepo(c.env.DB).plans()).some((p) => p.id === plan)) throw bad("Unknown plan");
  await adminRepo(c.env.DB).updateOrg(row.id, { plan_id: plan }, auditOf(c, "plan_change", row.id, { plan_id: row.plan_id }, { plan_id: plan }));
  invalidateFeatures(row.id);
  return c.json({ ok: true });
});

platformApi.post("/orgs/:id/extend", async (c) => {
  const row = await loadOrg(c);
  const b = await body(c);
  const kind = b.kind === "grace" ? "grace" : b.kind === "trial" ? "trial" : null;
  if (!kind) throw bad("Choose trial or grace");
  if (row.status === "deleted") throw bad("This salon was deleted");
  const n = days(b.days);
  const now = Date.now();
  const set =
    kind === "trial"
      ? (() => {
          const t = Math.max(now, row.trial_ends_at ?? now) + n * DAY;
          return { status: "trial", trial_ends_at: t, grace_ends_at: t + 7 * DAY, deactivated_at: null };
        })()
      : { status: "grace", grace_ends_at: Math.max(now, row.grace_ends_at ?? now) + n * DAY, deactivated_at: null };
  await adminRepo(c.env.DB).updateOrg(row.id, set, auditOf(c, `extend_${kind}`, row.id, { status: row.status, trial_ends_at: row.trial_ends_at, grace_ends_at: row.grace_ends_at }, { days: n, ...set }));
  invalidateFeatures(row.id);
  return c.json({ ok: true, ...set });
});

platformApi.post("/orgs/:id/activate", async (c) => {
  const row = await loadOrg(c);
  const b = await body(c);
  if (row.status === "deleted") throw bad("This salon was deleted");
  const plan = typeof b.plan_id === "string" ? b.plan_id : row.plan_id;
  if (!(await adminRepo(c.env.DB).plans()).some((p) => p.id === plan)) throw bad("Unknown plan");
  const until = b.until === null || b.until === undefined ? null : Number.isInteger(b.until) && (b.until as number) > Date.now() ? (b.until as number) : NaN;
  if (Number.isNaN(until)) throw bad("Paid-until must be a future date");
  await adminRepo(c.env.DB).activate(row.id, plan, until, auditOf(c, "activate", row.id, { status: row.status, plan_id: row.plan_id }, { status: "active", plan_id: plan, until }));
  invalidateFeatures(row.id);
  return c.json({ ok: true });
});

platformApi.post("/orgs/:id/deactivate", async (c) => {
  const row = await loadOrg(c);
  if (row.status === "deleted") throw bad("This salon was deleted");
  const at = Date.now();
  await adminRepo(c.env.DB).updateOrg(row.id, { status: "deactivated", deactivated_at: at }, auditOf(c, "deactivate", row.id, { status: row.status }, { status: "deactivated" }));
  invalidateFeatures(row.id);
  return c.json({ ok: true });
});

/** Back to the status its dates (or a manual payment) give it: active, trial, grace or expired. */
export function reactivatedStatus(o: { trial_ends_at: number | null; grace_ends_at: number | null }, sub: { provider?: unknown; current_period_end?: unknown } | null, now: number): "active" | "trial" | "grace" | "expired" {
  if (sub?.provider === "manual" && (sub.current_period_end === null || (typeof sub.current_period_end === "number" && sub.current_period_end > now))) return "active";
  if (o.trial_ends_at && o.trial_ends_at > now) return "trial";
  if (o.grace_ends_at && o.grace_ends_at > now) return "grace";
  return "expired";
}

platformApi.post("/orgs/:id/reactivate", async (c) => {
  const row = await loadOrg(c);
  if (row.status !== "deactivated") throw bad("Only a deactivated salon can be reactivated");
  const { profile } = await adminRepo(c.env.DB).orgExtras(row.id);
  const status = reactivatedStatus(row, profile, Date.now());
  await adminRepo(c.env.DB).updateOrg(row.id, { status, deactivated_at: null }, auditOf(c, "reactivate", row.id, { status: row.status }, { status }));
  invalidateFeatures(row.id);
  return c.json({ ok: true, status });
});

platformApi.post("/orgs/:id/delete", async (c) => {
  const row = await loadOrg(c);
  const b = await body(c);
  if (b.confirm !== row.slug) throw bad("Type the salon ID to confirm", "confirm");
  if (row.status === "deleted") return c.json({ ok: true });
  // Soft delete: nobody can sign in, the owner's email is free for a new signup, rows stay for export/restore.
  await adminRepo(c.env.DB).updateOrg(row.id, { status: "deleted", deleted_at: Date.now() }, auditOf(c, "delete", row.id, { status: row.status }, { status: "deleted" }));
  invalidateFeatures(row.id);
  return c.json({ ok: true });
});

platformApi.put("/orgs/:id/features/:key", async (c) => {
  const row = await loadOrg(c);
  const key = c.req.param("key");
  if (!isFeatureKey(key)) throw bad("Unknown feature");
  if (key === "core_sales") throw bad("Sales are always on");
  const b = await body(c);
  const enabled = b.enabled === true ? 1 : b.enabled === false ? 0 : b.enabled === null ? null : undefined;
  if (enabled === undefined) throw bad("enabled must be true, false or null (follow the plan)");
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "";
  if (enabled !== null && !reason) throw bad("Say why (the salon's audit trail keeps it)", "reason");
  await adminRepo(c.env.DB).setOverride(row.id, key, enabled, reason || null, c.var.platform.id, auditOf(c, "feature_override", row.id, undefined, { feature: key, enabled, reason: reason || null }));
  invalidateFeatures(row.id);
  return c.json({ ok: true });
});

// Per-role switches: hide a salon feature from its barbers or its admins (owner + admin). Off rows only; on = no row.
const ROLES = ["barber", "admin"] as const;
platformApi.get("/orgs/:id/role-features", async (c) => {
  const row = await loadOrg(c);
  const { results } = await c.env.DB.prepare("SELECT role, feature_key FROM org_role_features WHERE org_id = ? AND enabled = 0").bind(row.id).all<{ role: string; feature_key: string }>();
  const grid = (role: string) => Object.fromEntries(FEATURE_KEYS.map((k) => [k, !results.some((r) => r.role === role && r.feature_key === k)]));
  return c.json({ barber: grid("barber"), admin: grid("admin") });
});

platformApi.put("/orgs/:id/role-features/:role/:key", async (c) => {
  const row = await loadOrg(c);
  const role = c.req.param("role");
  const key = c.req.param("key");
  if (!ROLES.includes(role as (typeof ROLES)[number])) throw bad("Role must be barber or admin");
  if (!isFeatureKey(key)) throw bad("Unknown feature");
  if (key === "core_sales") throw bad("Sales are always on");
  const b = await body(c);
  if (typeof b.enabled !== "boolean") throw bad("enabled must be true or false");
  const a = auditOf(c, "role_feature", row.id, undefined, { role, feature: key, enabled: b.enabled });
  await adminRepo(c.env.DB).setRoleFeature(row.id, role, key, b.enabled, a);
  invalidateFeatures(row.id);
  return c.json({ ok: true });
});

// AI connect (feature mcp_api, switched on with the override above): live connections, recent calls, revoke all.
platformApi.get("/orgs/:id/mcp", async (c) => {
  const row = await loadOrg(c);
  const repo = mcpRepo(c.env.DB, row.id);
  const [summary, connections, calls] = await Promise.all([repo.summary(), repo.connections(), repo.calls(20)]);
  return c.json({ ...summary, connections, calls });
});

platformApi.post("/orgs/:id/mcp/revoke-all", async (c) => {
  const row = await loadOrg(c);
  const n = await mcpRepo(c.env.DB, row.id).revokeAll();
  await adminRepo(c.env.DB).audit(auditOf(c, "mcp_revoke_all", row.id, undefined, { revoked: n })).run();
  return c.json({ ok: true, revoked: n });
});

platformApi.put("/orgs/:id/limits", async (c) => {
  const row = await loadOrg(c);
  const b = await body(c);
  let json: string | null;
  if (b.reset === true) json = null;
  else if (b.max_staff === null) json = JSON.stringify({ max_staff: null });
  else if (Number.isInteger(b.max_staff) && (b.max_staff as number) >= 1 && (b.max_staff as number) <= 1000) json = JSON.stringify({ max_staff: b.max_staff });
  else throw bad("Staff limit must be 1 to 1000, null (unlimited) or reset");
  await adminRepo(c.env.DB).updateOrg(row.id, { limits_override_json: json }, auditOf(c, "limits_override", row.id, { limits: row.limits_override_json }, { limits: json }));
  invalidateFeatures(row.id);
  return c.json({ ok: true });
});

platformApi.post("/orgs/:id/support", async (c) => {
  const row = await loadOrg(c);
  if (row.status === "deleted" || row.status === "deactivated") throw bad("Reactivate the salon first");
  const code = randomToken(24);
  const at = Date.now();
  await adminRepo(c.env.DB).createSupport(await sha256(code), c.var.platform.id, row.id, at + SUPPORT_CODE_MS, auditOf(c, "support_code", row.id));
  const root = c.env.ROOT_DOMAIN;
  const q = `support=${encodeURIComponent(code)}`;
  const url = root ? `https://${row.slug}.${root}/login/?${q}` : `/login/?org=${encodeURIComponent(row.slug)}&${q}`;
  return c.json({ url, expires_at: at + SUPPORT_CODE_MS });
});

/** The expired queue's bulk actions. At most BULK_MAX salons, one batch per salon. */
platformApi.post("/orgs/bulk", async (c) => {
  const b = await body(c);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === "string" && x.length <= 64))] : [];
  if (!ids.length || ids.length > BULK_MAX) throw bad(`Pick 1 to ${BULK_MAX} salons`);
  const action = b.action;
  if (action !== "deactivate" && action !== "extend_trial") throw bad("Unknown action");
  const n = action === "extend_trial" ? days(b.days) : 0;
  const now = Date.now();
  const repo = adminRepo(c.env.DB);
  const ph = (from: number) => ids.map((_, i) => `?${i + from}`).join(",");
  const t = now + n * DAY;
  const update =
    action === "deactivate"
      ? c.env.DB.prepare(`UPDATE orgs SET status = 'deactivated', deactivated_at = ?1 WHERE status != 'deleted' AND id IN (${ph(2)}) RETURNING id`).bind(now, ...ids)
      : c.env.DB.prepare(`UPDATE orgs SET status = 'trial', trial_ends_at = ?1, grace_ends_at = ?2, deactivated_at = NULL WHERE status != 'deleted' AND id IN (${ph(3)}) RETURNING id`).bind(t, t + 7 * DAY, ...ids);
  const { results } = await update.all<{ id: string }>();
  // Audit only the salons that actually changed (unknown or deleted ids are skipped by the update).
  const changed = results.map((r) => r.id);
  if (changed.length) await c.env.DB.batch(changed.map((id) => repo.audit(auditOf(c, action === "deactivate" ? "deactivate" : "extend_trial", id, undefined, { bulk: true, days: n || undefined }))));
  changed.forEach(invalidateFeatures);
  return c.json({ ok: true, changed: changed.length });
});

// ---------- plans ----------
platformApi.get("/plans", async (c) => {
  const rows = await adminRepo(c.env.DB).plans();
  return c.json({
    feature_keys: FEATURE_KEYS,
    plans: rows.map((p) => ({ ...p, features: JSON.parse(p.features ?? "[]") as string[], limits: parseLimits(p.limits_json), limits_json: undefined, active: p.active === 1 })),
  });
});

platformApi.put("/plans/:id", async (c) => {
  const id = c.req.param("id");
  const b = await body(c);
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 40) throw bad("Plan name must be 1 to 40 characters");
  if (!Number.isInteger(b.price_monthly) || (b.price_monthly as number) < 0 || (b.price_monthly as number) > 100_000) throw bad("Price must be a whole number from 0");
  const stripe = typeof b.stripe_price_id === "string" && b.stripe_price_id.trim() ? b.stripe_price_id.trim().slice(0, 100) : null;
  const max = b.max_staff;
  if (!(max === null || (Number.isInteger(max) && (max as number) >= 1 && (max as number) <= 1000))) throw bad("Staff limit must be 1 to 1000 or unlimited");
  const features = Array.isArray(b.features) ? [...new Set(b.features.filter((f): f is string => typeof f === "string" && isFeatureKey(f)))] : null;
  if (!features) throw bad("features must be a list");
  if (features.some((f) => OVERRIDE_ONLY.includes(f as FeatureKey))) throw bad("AI connect is switched on per salon, not per plan");
  if (!features.includes("core_sales")) features.unshift("core_sales");
  const repo = adminRepo(c.env.DB);
  const before = (await repo.plans()).find((p) => p.id === id);
  if (!before) throw new HttpError(404, "No such plan");
  const next = { name, price_monthly: b.price_monthly as number, stripe_price_id: stripe, limits_json: JSON.stringify({ max_staff: max }), active: (b.active === false ? 0 : 1) as 0 | 1, features };
  await repo.updatePlan(id, next, auditOf(c, "plan_edit", null, { id, name: before.name, price_monthly: before.price_monthly, limits_json: before.limits_json, active: before.active, features: JSON.parse(before.features) }, { id, ...next }));
  invalidateAllFeatures();
  return c.json({ ok: true });
});

// ---------- platform users ----------
platformApi.get("/users", async (c) => c.json(await adminRepo(c.env.DB).users()));

platformApi.post("/users", async (c) => {
  const b = await body(c);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 120) throw bad("Enter a valid email");
  const role: PlatformRole = b.role === "owner" ? "owner" : "support";
  if (typeof b.password !== "string" || b.password.length < 10 || b.password.length > 200) throw bad("Password must be 10 to 200 characters");
  const repo = adminRepo(c.env.DB);
  if (await repo.userByEmail(email)) throw new HttpError(409, "This email already has an account");
  await repo.createUser(email, await hashPassword(b.password), role, auditOf(c, "user_create", null, undefined, { email, role }));
  return c.json({ ok: true }, 201);
});

platformApi.delete("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HttpError(404, "No such user");
  if (id === c.var.platform.id) throw bad("You can't remove your own account");
  const repo = adminRepo(c.env.DB);
  const u = await repo.userById(id);
  if (!u) throw new HttpError(404, "No such user");
  await repo.deleteUser(id, auditOf(c, "user_delete", null, { email: u.email, role: u.role }));
  return c.json({ ok: true });
});

// ---------- audit ----------
platformApi.get("/audit", async (c) => {
  const before = Number(c.req.query("before") ?? 0);
  return c.json(await adminRepo(c.env.DB).auditLog({ orgId: c.req.query("org_id") ?? "", before: Number.isInteger(before) && before > 0 ? before : 0, limit: 100 }));
});
