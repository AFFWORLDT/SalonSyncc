import { Hono, type Context } from "hono";
import type { User, UserInput } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { hashPassword } from "../../core/crypto";
import { requireAdmin } from "../../core/roles";
import { requireFeature } from "../../core/pipeline";
import { settingsRepo, usersRepo, avatarUrl, type StaffRow, type StaffWrite } from "../../data/tenant";
import { bannerUrl } from "../../data/tenant/users";
import { canonicalPhone } from "../../lib/phone";
import { resolvePublicOrg, publicRateLimit } from "../../core/public";

const bad = (m: string) => new HttpError(400, m);
const notFound = () => new HttpError(404, "User not found");
const ownerLocked = () => bad("The owner can't be changed here");

/** Plain names ("sonu") or email-style logins ("admin@salon.com"); case is kept as typed, uniqueness ignores case. */
const USERNAME_RE = /^[A-Za-z0-9._@+-]{2,60}$/;
const AVATAR_TYPES = ["image/webp", "image/jpeg", "image/png"];
const AVATAR_MAX = 300 * 1024;
/** A plain, practical email check (one @, a dot in the domain, no spaces). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(v: unknown, max = 200): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

function userId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw bad("Invalid id");
  return n;
}

function pct(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw bad(`${field} must be between 0 and 100`);
  return Math.round(n * 100) / 100;
}

const toUser = (r: StaffRow, slug: string): User => ({
  id: r.id,
  name: r.name,
  username: r.username,
  phone: r.phone,
  email: r.email,
  role: r.role,
  commission_pct: r.commission_pct,
  sort_order: r.sort_order,
  active: !!r.active,
  can_add_expense: !!r.can_add_expense,
  avatar_url: avatarUrl(r.id, r.avatar_v, slug, r.active),
  created_at: r.created_at,
});

async function body(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw bad("Send the details as JSON");
}

/**
 * Validated profile fields; role/active/sort/etc stay undefined when the request didn't send them.
 * `phone` and `commission` are `undefined` when omitted (PUT keeps the stored value), null when sent as null or "" (clears).
 */
async function readInput(c: Context<AppEnv>, raw: Record<string, unknown>, creating: boolean) {
  const b = raw as unknown as UserInput;
  const name = clean(b.name, 60);
  if (!name) throw bad("Enter a name");
  const username = clean(b.username, 60) ?? "";
  if (!USERNAME_RE.test(username)) throw bad("Username: 2–60 letters, numbers, . _ - @ +, no spaces");
  let phone: string | null | undefined = b.phone === undefined ? undefined : null;
  if (clean(b.phone)) {
    const { phone_country } = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
    phone = canonicalPhone(b.phone, phone_country);
    if (!phone) throw bad("Mobile number doesn't look right");
  }
  // Email: optional; omitted = keep (PUT), null or "" = clear.
  let email: string | null | undefined = b.email === undefined ? undefined : null;
  const typedEmail = clean(b.email, 120);
  if (typedEmail) {
    if (!EMAIL_RE.test(typedEmail)) throw bad("Email doesn't look right");
    email = typedEmail.toLowerCase();
  }
  if (creating && (typeof b.password !== "string" || b.password.length < 4)) throw bad("Password must be at least 4 characters");
  if (b.role !== undefined && b.role !== "admin" && b.role !== "barber" && b.role !== "owner") throw bad("Choose a role");
  const commission =
    b.commission_pct === undefined ? undefined : b.commission_pct === null || (b.commission_pct as unknown) === "" ? null : pct(b.commission_pct, "Commission");
  const sort = Number.isInteger(b.sort_order) ? (b.sort_order as number) : null;
  return {
    name,
    username,
    phone,
    email,
    role: b.role,
    commission,
    sort,
    active: b.active === undefined ? null : !!b.active,
    canAddExpense: b.can_add_expense === undefined ? null : !!b.can_add_expense,
    password: b.password,
  };
}

export const staff = new Hono<AppEnv>();
// Mounted at "/" on tenantApi, so the feature gate is per route (a "*" middleware here would also catch unknown paths).
const gate = requireFeature("core_sales");

const actorOf = (c: Context<AppEnv>) => ({ id: c.var.tenant.user.id, name: c.var.tenant.user.name });
const repoOf = (c: Context<AppEnv>) => usersRepo(c.env.DB, c.var.tenant.org.id);

const staffLimit = () => new HttpError(409, "Staff limit reached for your plan", "staff_limit");

staff.get("/users", gate, requireAdmin, async (c) => {
  const slug = c.var.tenant.org.slug;
  return c.json((await repoOf(c).list()).map((r) => toUser(r, slug)));
});

staff.post("/users", gate, requireAdmin, async (c) => {
  const u = await readInput(c, await body(c), true);
  if (u.role === "owner") throw bad("Choose Admin or Barber");
  const repo = repoOf(c);
  if (await repo.usernameTaken(u.username, null)) throw new HttpError(409, "Username is taken");
  const w: StaffWrite = {
    name: u.name,
    username: u.username,
    phone: u.phone ?? null,
    email: u.email ?? null,
    role: u.role ?? "barber",
    commission_pct: u.commission ?? null,
    sort_order: u.sort ?? (await repo.nextSortOrder()),
    active: true,
    can_add_expense: !!u.canAddExpense,
  };
  try {
    const row = await repo.create(w, await hashPassword(u.password as string), actorOf(c), c.var.tenant.limits.max_staff);
    if (!row) throw staffLimit();
    return c.json(toUser(row, c.var.tenant.org.slug), 201);
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Username is taken");
    throw e;
  }
});

staff.put("/users/:id", gate, requireAdmin, async (c) => {
  const id = userId(c.req.param("id"));
  const me = c.var.tenant.user;
  const repo = repoOf(c);
  const existing = await repo.byId(id);
  if (!existing) throw notFound();
  const u = await readInput(c, await body(c), false);

  if (existing.role === "owner") {
    // Only the owner edits their own profile; role, login name and active state never change.
    if (me.id !== existing.id) throw ownerLocked();
    if ((u.role !== undefined && u.role !== "owner") || u.active === false || u.username.toLowerCase() !== existing.username.toLowerCase()) throw ownerLocked();
  } else {
    if (u.role === "owner") throw bad("Choose Admin or Barber");
    if (id === me.id && (u.role === "barber" || u.active === false)) throw bad("You can't remove your own admin access");
  }
  if (await repo.usernameTaken(u.username, id)) throw new HttpError(409, "Username is taken");

  const active = existing.role === "owner" ? true : (u.active ?? !!existing.active);
  const reactivating = active && !existing.active;
  const w: StaffWrite = {
    name: u.name,
    username: existing.role === "owner" ? existing.username : u.username,
    // Omitted = keep (only explicit null or "" clears), like the other optional fields.
    phone: u.phone === undefined ? existing.phone : u.phone,
    email: u.email === undefined ? existing.email : u.email,
    role: existing.role === "owner" ? "owner" : (u.role ?? existing.role),
    commission_pct: u.commission === undefined ? existing.commission_pct : u.commission,
    sort_order: u.sort ?? existing.sort_order,
    active,
    can_add_expense: u.canAddExpense ?? !!existing.can_add_expense,
  };
  try {
    const row = await repo.update(id, existing, w, !active, actorOf(c), reactivating ? { max: c.var.tenant.limits.max_staff } : undefined);
    if (!row) throw staffLimit();
    return c.json(toUser(row, c.var.tenant.org.slug));
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Username is taken");
    throw e;
  }
});

staff.post("/users/:id/reset-password", gate, requireAdmin, async (c) => {
  const id = userId(c.req.param("id"));
  const repo = repoOf(c);
  const target = await repo.byId(id);
  if (!target) throw notFound();
  const { password } = (await body(c)) as { password?: unknown };
  if (typeof password !== "string" || password.length < 4) throw bad("Password must be at least 4 characters");
  if (target.role === "owner" && target.id !== c.var.tenant.user.id) throw ownerLocked();
  await repo.resetPassword(target, await hashPassword(password), actorOf(c));
  return c.json({ ok: true });
});

/** Deletes a user with no history; anyone referenced by business records is deactivated instead so reports stay intact. */
staff.delete("/users/:id", gate, requireAdmin, async (c) => {
  const id = userId(c.req.param("id"));
  const repo = repoOf(c);
  const target = await repo.byId(id);
  if (!target) throw notFound();
  if (target.role === "owner") throw ownerLocked();
  if (id === c.var.tenant.user.id) throw bad("You can't delete yourself");
  if (await repo.userHasActivity(id)) {
    await repo.deactivate(target, actorOf(c));
    return c.json({ ok: true, deactivated: true });
  }
  await repo.remove(target, actorOf(c));
  return c.json({ ok: true, deleted: true });
});

// ---------- photos ----------

async function saveAvatar(c: Context<AppEnv>, id: number) {
  const repo = repoOf(c);
  const target = await repo.byId(id);
  if (!target) throw notFound(); // 404 before looking at the body, so a foreign id never reveals anything else
  if (target.role === "owner" && id !== c.var.tenant.user.id) throw ownerLocked();
  const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!AVATAR_TYPES.includes(type)) throw bad("Send a WebP, JPEG or PNG image");
  if (Number(c.req.header("content-length") ?? 0) > AVATAR_MAX) throw bad("Photo is too large (max 300 KB)");
  const bytes = await c.req.arrayBuffer();
  if (!bytes.byteLength) throw bad("The photo is empty");
  if (bytes.byteLength > AVATAR_MAX) throw bad("Photo is too large (max 300 KB)");
  const v = await repo.setAvatar(id, bytes, type);
  if (v === null) throw notFound();
  return c.json({ avatar_url: avatarUrl(id, v, c.var.tenant.org.slug) });
}

async function clearAvatar(c: Context<AppEnv>, id: number) {
  const repo = repoOf(c);
  const target = await repo.byId(id);
  if (!target) throw notFound();
  if (target.role === "owner" && id !== c.var.tenant.user.id) throw ownerLocked();
  await repo.clearAvatar(id);
  return c.json({ avatar_url: null });
}

staff.put("/me/avatar", gate, (c) => saveAvatar(c, c.var.tenant.user.id));
staff.delete("/me/avatar", gate, (c) => clearAvatar(c, c.var.tenant.user.id));
// The banner behind my photo on my profile: same image rules as the photo.
staff.put("/me/banner", gate, async (c) => {
  const id = c.var.tenant.user.id;
  const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!AVATAR_TYPES.includes(type)) throw bad("Send a WebP, JPEG or PNG image");
  if (Number(c.req.header("content-length") ?? 0) > AVATAR_MAX) throw bad("Banner is too large (max 300 KB)");
  const bytes = await c.req.arrayBuffer();
  if (!bytes.byteLength) throw bad("The banner is empty");
  if (bytes.byteLength > AVATAR_MAX) throw bad("Banner is too large (max 300 KB)");
  const v = await repoOf(c).setBanner(id, bytes, type);
  if (v === null) throw notFound();
  return c.json({ banner_url: bannerUrl(id, v, c.var.tenant.org.slug) });
});
staff.delete("/me/banner", gate, async (c) => {
  await repoOf(c).clearBanner(c.var.tenant.user.id);
  return c.json({ banner_url: null });
});
staff.put("/users/:id/avatar", gate, requireAdmin, (c) => saveAvatar(c, userId(c.req.param("id"))));
staff.delete("/users/:id/avatar", gate, requireAdmin, (c) => clearAvatar(c, userId(c.req.param("id"))));

/**
 * Public photo route, mounted on publicApi at /avatar: GET /api/public/avatar/:id/:v. The org comes from the host (or
 * ?org= on workers.dev). `v` must be the user's current avatar_v and the user must be active. Own rate-limit bucket.
 */
export const avatarPublic = new Hono<AppEnv>();
avatarPublic.get("/:id/:v", publicRateLimit("avatar"), async (c) => {
  const org = await resolvePublicOrg(c);
  const id = Number(c.req.param("id"));
  const v = Number(c.req.param("v"));
  if (!org || !Number.isInteger(id) || id <= 0 || !Number.isInteger(v) || v <= 0) return c.json({ error: "Not found" }, 404);
  // Only the current version of an active user's photo: old URLs and deactivated staff are 404.
  const img = await usersRepo(c.env.DB, org.id).avatar(id, v);
  if (!img) return c.json({ error: "Not found" }, 404);
  return new Response(img.bytes, {
    headers: { "content-type": img.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
});

/** Public banner route, mounted on publicApi at /banner: GET /api/public/banner/:id/:v (same rules as the photo). */
export const bannerPublic = new Hono<AppEnv>();
bannerPublic.get("/:id/:v", publicRateLimit("avatar"), async (c) => {
  const org = await resolvePublicOrg(c);
  const id = Number(c.req.param("id"));
  const v = Number(c.req.param("v"));
  if (!org || !Number.isInteger(id) || id <= 0 || !Number.isInteger(v) || v <= 0) return c.json({ error: "Not found" }, 404);
  const img = await usersRepo(c.env.DB, org.id).banner(id, v);
  if (!img) return c.json({ error: "Not found" }, 404);
  return new Response(img.bytes, {
    headers: { "content-type": img.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
});
