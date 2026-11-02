import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import type { UserRow } from "../data/tenant";
import { HttpError } from "./errors";

/** FM's `admin` maps to owner or admin; `barber` stays barber. */
export const isAdmin = (u: UserRow): boolean => u.role === "owner" || u.role === "admin";

export const forbidden = (): HttpError => new HttpError(403, "You don't have access to this");

/** Must run after the tenant guard (needs c.var.tenant). */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!isAdmin(c.var.tenant.user)) throw forbidden();
  await next();
};
