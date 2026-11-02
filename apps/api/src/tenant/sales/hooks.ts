import type { Context } from "hono";
import type { Sale } from "@ss/contract";
import type { AppEnv } from "../../env";

/** Runs in waitUntil after a sale is created. No-op in Plan 2a; Plan 2b fills it (WhatsApp bill/feedback, push to admins). */
export async function afterSale(_c: Context<AppEnv>, _sale: Sale): Promise<void> {}

/** The seam the sales routes call through, so Plan 2b (and tests) can replace the default. */
export const hooks: { afterSale: (c: Context<AppEnv>, sale: Sale) => Promise<void> } = { afterSale };
