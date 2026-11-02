import type { Context } from "hono";
import type { Sale, Settings } from "@ss/contract";
import type { AppEnv } from "../../env";
import { isAdmin } from "../../core/roles";
import { notificationsRepo, settingsRepo } from "../../data/tenant";
import { notifyUsers } from "../notifications/notify";

/** Money as the org shows it: Intl currency format in the org's locale (FM's aedText, per org). */
export function moneyText(minor: number, s: Pick<Settings, "currency" | "currency_minor" | "locale">): string {
  try {
    return new Intl.NumberFormat(s.locale, { style: "currency", currency: s.currency }).format(minor / s.currency_minor);
  } catch {
    return `${s.currency} ${minor / s.currency_minor}`;
  }
}

const hasPush = (c: Context<AppEnv>) => c.var.tenant.features.includes("push");

/**
 * Runs in waitUntil after a sale is created. Push (FM routes.ts 772-780): tell this org's admins about the bill when
 * notify_sales is on and the amount reaches notify_sale_min; never the person who rang it up.
 */
export async function afterSale(c: Context<AppEnv>, sale: Sale): Promise<void> {
  if (!hasPush(c)) return;
  const orgId = c.var.tenant.org.id;
  const s = await settingsRepo(c.env.DB, orgId).get();
  if (!s.notify_sales || sale.amount < s.notify_sale_min) return;
  const what = sale.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ");
  const admins = await notificationsRepo(c.env.DB, orgId).adminIds(c.var.tenant.user.id);
  await notifyUsers(c, orgId, admins, {
    title: `New bill · ${moneyText(sale.amount, s)}`,
    body: [sale.barber_name, sale.customer_label, what].filter(Boolean).join(" · "),
    path: "/sales/",
  });
}

/** An admin changed or deleted another barber's sale and the org wants barbers told (FM notify_barber_changes). */
async function barberChangeSettings(c: Context<AppEnv>, sale: Sale): Promise<Settings | null> {
  const me = c.var.tenant.user;
  if (!hasPush(c) || !isAdmin(me) || sale.barber_id === me.id) return null;
  const s = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
  return s.notify_barber_changes ? s : null;
}

/** Runs in waitUntil after an edit took effect (never after a 409 stale). `before` is the version the edit replaced. */
export async function afterSaleEdit(c: Context<AppEnv>, before: Sale, after: Sale): Promise<void> {
  const s = await barberChangeSettings(c, before);
  if (!s) return;
  const moved = after.barber_id !== before.barber_id ? " · moved to another barber" : "";
  await notifyUsers(c, c.var.tenant.org.id, [before.barber_id], {
    title: "Your sale was changed",
    body: `${before.bill_no} · ${moneyText(before.amount, s)} → ${moneyText(after.amount, s)}${moved} · by the admin`,
    path: "/history/",
    tag: `sale-${before.id}`,
  });
}

/** Runs in waitUntil after a delete took effect (never after a 409 stale). */
export async function afterSaleDelete(c: Context<AppEnv>, sale: Sale): Promise<void> {
  const s = await barberChangeSettings(c, sale);
  if (!s) return;
  await notifyUsers(c, c.var.tenant.org.id, [sale.barber_id], {
    title: "Your sale was deleted",
    body: `${sale.bill_no} · ${moneyText(sale.amount, s)} · ${sale.customer_label} · by the admin`,
    path: "/history/",
    tag: `sale-${sale.id}`,
  });
}

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
