import type { Context } from "hono";
import type { Sale, Settings } from "@ss/contract";
import type { AppEnv } from "../../env";
import { isAdmin } from "../../core/roles";
import { notificationsRepo, settingsRepo } from "../../data/tenant";
import { notifyUsers } from "../notifications/notify";
import { moneyText } from "../../lib/money";
import { sendBill } from "../whatsapp/bill";
import { runFeedback } from "../../jobs/wa-jobs";

export { moneyText };

const hasFeature = (c: Context<AppEnv>, key: string) => (c.var.tenant.features as readonly string[]).includes(key);

/** Push (FM routes.ts 772-780): tell this org's admins about the bill when notify_sales is on and the amount reaches notify_sale_min; never the person who rang it up. */
async function salePush(c: Context<AppEnv>, sale: Sale, s: Settings): Promise<void> {
  if (!hasFeature(c, "push")) return;
  if (!s.notify_sales || sale.amount < s.notify_sale_min) return;
  const orgId = c.var.tenant.org.id;
  const what = sale.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ");
  const admins = await notificationsRepo(c.env.DB, orgId).adminIds(c.var.tenant.user.id);
  await notifyUsers(c, orgId, admins, {
    title: `New bill · ${moneyText(sale.amount, s)}`,
    body: [sale.barber_name, sale.customer_label, what].filter(Boolean).join(" · "),
    path: "/sales/",
  });
}

/** WhatsApp bill (FM routes.ts 760-765): when wa_bill_auto is on (sendBill checks readiness). */
async function saleBill(c: Context<AppEnv>, sale: Sale, s: Settings): Promise<void> {
  if (!hasFeature(c, "whatsapp") || !sale.customer_phone || !s.wa_bill_auto) return;
  await sendBill(c.env, c.var.tenant.org.id, sale.id, c.var.tenant.user.id);
}

/**
 * The rating request inline (FM routes.ts 766-767) when wa_feedback_enabled && wa_feedback_delay_min === 0: one send
 * at most, for this sale only; like FM, no hour window. runFeedback checks readiness and claims the sale first.
 */
async function saleRating(c: Context<AppEnv>, sale: Sale, s: Settings): Promise<void> {
  if (!hasFeature(c, "whatsapp") || !sale.customer_phone) return;
  if (!s.wa_feedback_enabled || s.wa_feedback_delay_min !== 0) return;
  await runFeedback(c.env, c.var.tenant.org.id, Date.now(), 1, { left: 1 }, sale.id);
}

/**
 * Runs in waitUntil after a sale is created: the push, the WhatsApp bill and the rating request, independently (one failing never
 * stops the others; the first error is rethrown afterwards so runHook logs it).
 */
export async function afterSale(c: Context<AppEnv>, sale: Sale): Promise<void> {
  if (!hasFeature(c, "push") && !hasFeature(c, "whatsapp")) return;
  const s = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
  const results = await Promise.allSettled([salePush(c, sale, s), saleBill(c, sale, s), saleRating(c, sale, s)]);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
}

/** An admin changed or deleted another barber's sale and the org wants barbers told (FM notify_barber_changes). */
async function barberChangeSettings(c: Context<AppEnv>, sale: Sale): Promise<Settings | null> {
  const me = c.var.tenant.user;
  if (!hasFeature(c, "push") || !isAdmin(me) || sale.barber_id === me.id) return null;
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
