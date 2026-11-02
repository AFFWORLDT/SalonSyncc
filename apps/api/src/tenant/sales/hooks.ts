import type { Context } from "hono";
import type { Sale } from "@ss/contract";
import type { AppEnv } from "../../env";

/** Runs in waitUntil after a sale is created. No-op until Plan 2b fills it (WhatsApp bill/feedback, push to admins). */
export async function afterSale(_c: Context<AppEnv>, _sale: Sale): Promise<void> {}

/** Runs in waitUntil after an edit took effect (never after a 409 stale). `before` is the version the edit replaced. */
export async function afterSaleEdit(_c: Context<AppEnv>, _before: Sale, _after: Sale): Promise<void> {}

/** Runs in waitUntil after a delete took effect (never after a 409 stale). */
export async function afterSaleDelete(_c: Context<AppEnv>, _sale: Sale): Promise<void> {}

/** The seam the sales routes call through, so Plan 2b (and tests) can replace the defaults. */
export const hooks: {
  afterSale: (c: Context<AppEnv>, sale: Sale) => Promise<void>;
  afterSaleEdit: (c: Context<AppEnv>, before: Sale, after: Sale) => Promise<void>;
  afterSaleDelete: (c: Context<AppEnv>, sale: Sale) => Promise<void>;
} = { afterSale, afterSaleEdit, afterSaleDelete };

/**
 * Schedules a hook in waitUntil. Promise.resolve().then: even a hook that throws synchronously can never fail
 * a committed write; errors are only logged.
 */
export function runHook(c: Context<AppEnv>, name: string, fn: () => Promise<void>): void {
  c.executionCtx.waitUntil(Promise.resolve().then(fn).catch((err) => console.error(`${name} hook failed`, err)));
}
