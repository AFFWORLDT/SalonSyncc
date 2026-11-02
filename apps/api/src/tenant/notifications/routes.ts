import { Hono, type Context } from "hono";
import type { NotificationFeed } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireFeature } from "../../core/pipeline";
import { notificationsRepo } from "../../data/tenant";

/**
 * Push tokens and the notification feed (FM routes.ts 434-481), feature `push`, for every signed-in role. The gate is on
 * each route (the router is mounted at "/"), so unknown paths still fall through to the JSON 404.
 */
export const notifications = new Hono<AppEnv>();
const gate = requireFeature("push");
const bad = (m: string) => new HttpError(400, m);

/** FCM registration tokens are long URL-safe strings with ':' separators. */
const PUSH_TOKEN_RE = /^[\w:-]{20,4096}$/;
/** Mark-read ids per call: the feed shows at most 50. */
const MAX_READ_IDS = 50;

const repoOf = (c: Context<AppEnv>) => notificationsRepo(c.env.DB, c.var.tenant.org.id);
const bodyOf = async (c: Context<AppEnv>): Promise<Record<string, unknown>> => {
  const b = await c.req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
};

notifications.post("/push/tokens", gate, async (c) => {
  const { token } = await bodyOf(c);
  if (typeof token !== "string" || !PUSH_TOKEN_RE.test(token)) throw bad("That notification token doesn't look right");
  // One device = one token; it follows whoever is signed in on that device now, in whichever salon.
  await repoOf(c).registerToken(c.var.tenant.user.id, token);
  return c.json({ ok: true });
});

// Not feature-gated (nor blocked for a lapsed subscription, see pipeline isWriteAllowed): a downgraded org can still drop
// its device token. Still session- and org-scoped.
notifications.delete("/push/tokens", async (c) => {
  const { token } = await bodyOf(c);
  if (typeof token === "string") await repoOf(c).removeToken(c.var.tenant.user.id, token);
  return c.json({ ok: true });
});

notifications.get("/notifications", gate, async (c) => {
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 20));
  const feed: NotificationFeed = await repoOf(c).feed(c.var.tenant.user.id, limit);
  return c.json(feed);
});

/** Marks the given ids read, or all of mine when `ids` is omitted (the bell was opened). */
notifications.post("/notifications/read", gate, async (c) => {
  const { ids } = await bodyOf(c);
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length > MAX_READ_IDS || !ids.every((n) => Number.isInteger(n) && n > 0)) {
      throw bad(`ids must be a list of up to ${MAX_READ_IDS} notification ids`);
    }
  }
  await repoOf(c).markRead(c.var.tenant.user.id, ids === undefined ? undefined : [...new Set(ids as number[])]);
  return c.json({ ok: true });
});
