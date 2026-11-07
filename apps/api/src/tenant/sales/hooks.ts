import type { Context } from "hono";
import type { Sale, Settings } from "@ss/contract";
import type { AppEnv } from "../../env";
import { isAdmin } from "../../core/roles";
import { notificationsRepo, settingsRepo } from "../../data/tenant";
import { notifyUsers } from "../notifications/notify";
import { emailStaff } from "../notifications/staff-email";
import { staffSaleChangedEmail } from "../../emails/staff";
import { moneyText } from "../../lib/money";
import { deliverBill } from "../whatsapp/bill";
import { waSetup } from "../whatsapp/ready";
import { runFeedback, type Budget } from "../../jobs/wa-jobs";
import { FREE_SUBREQUESTS } from "../../lib/metered";
import type { WaConfig } from "../../core/services";

export { moneyText };

const hasFeature = (c: Context<AppEnv>, key: string) => (c.var.tenant.orgFeatures as readonly string[]).includes(key);

/**
 * What afterSale's steps share (I4): the route's settings, the WA config loaded at most once (the session's features,
 * so 1 statement), and one subrequest budget for the whole request (FREE_SUBREQUESTS: Graph sends, then FCM tokens + OAuth).
 */
interface SaleCtx {
  s: Settings;
  cfg: () => Promise<WaConfig | null>;
  budget: Budget;
}

/** Push (FM routes.ts 772-780): tell this org's admins about the bill when notify_sales is on and the amount reaches notify_sale_min; never the person who rang it up. */
async function salePush(c: Context<AppEnv>, sale: Sale, { s, budget }: SaleCtx): Promise<void> {
  if (!hasFeature(c, "push")) return;
  if (!s.notify_sales || sale.amount < s.notify_sale_min) return;
  const orgId = c.var.tenant.org.id;
  const what = sale.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ");
  const admins = await notificationsRepo(c.env.DB, orgId).adminIds(c.var.tenant.user.id);
  await notifyUsers(
    c,
    orgId,
    admins,
    { title: `New bill · ${moneyText(sale.amount, s)}`, body: [sale.barber_name, sale.customer_label, what].filter(Boolean).join(" · "), path: "/sales/" },
    { maxTokens: budget.left - 1 }, // the rest of the request's subrequests, less the OAuth call
  );
}

/** WhatsApp bill (FM routes.ts 760-765): when wa_bill_auto is on and the org is WA-ready. */
async function saleBill(c: Context<AppEnv>, sale: Sale, x: SaleCtx): Promise<void> {
  if (!hasFeature(c, "whatsapp") || !sale.customer_phone || !x.s.wa_bill_auto) return;
  const cfg = await x.cfg();
  if (cfg) await deliverBill(c.env, c.var.tenant.org, sale, x.s, cfg, c.var.tenant.user.id, x.budget);
}

/**
 * The rating request inline (FM routes.ts 766-767) when wa_feedback_enabled && wa_feedback_delay_min === 0 and the org
 * has `ratings` (else its /rate link would 404, M8): one send at most, for this sale only; like FM, no hour window.
 * runFeedback claims the sale first (shared with the cron, so never twice).
 */
async function saleRating(c: Context<AppEnv>, sale: Sale, x: SaleCtx): Promise<void> {
  if (!hasFeature(c, "whatsapp") || !hasFeature(c, "ratings") || !sale.customer_phone) return;
  if (!x.s.wa_feedback_enabled || x.s.wa_feedback_delay_min !== 0) return;
  await runFeedback(c.env, c.var.tenant.org.id, Date.now(), 1, x.budget, sale.id, { s: x.s, cfg: x.cfg });
}

/**
 * Runs in waitUntil after a sale is created, in FM's order (M4): the WhatsApp bill, then the inline rating request, then
 * the push. Each step has its own try/catch, so one failing never stops the next; the first error is rethrown at the end
 * so runHook logs it. `s` is the route's settings (no re-read). Worst case, D1: WA config 1 + bill 2 + rating 3 +
 * push 3-4 (admins, feed rows, tokens, dead tokens); subrequests: 1 + 1 + (tokens + OAuth) <= FREE_SUBREQUESTS.
 */
export async function afterSale(c: Context<AppEnv>, sale: Sale, s?: Settings): Promise<void> {
  if (!hasFeature(c, "push") && !hasFeature(c, "whatsapp")) return;
  let cfgP: Promise<WaConfig | null> | null = null;
  const x: SaleCtx = {
    s: s ?? (await settingsRepo(c.env.DB, c.var.tenant.org.id).get()),
    cfg: () => (cfgP ??= waSetup(c, c.var.tenant.org)),
    budget: { left: FREE_SUBREQUESTS },
  };
  let first: { err: unknown } | null = null;
  for (const step of [saleBill, saleRating, salePush]) {
    try {
      await step(c, sale, x);
    } catch (err) {
      first ??= { err };
    }
  }
  if (first) throw first.err;
}

/** An admin changed or deleted another barber's sale and the org wants barbers told (FM notify_barber_changes). */
async function barberChangeSettings(c: Context<AppEnv>, sale: Sale, known?: Settings): Promise<Settings | null> {
  const me = c.var.tenant.user;
  if (!isAdmin(me) || sale.barber_id === me.id) return null;
  const s = known ?? (await settingsRepo(c.env.DB, c.var.tenant.org.id).get());
  return s.notify_barber_changes ? s : null;
}

/** Devices per barber-change push: one send (tokens + OAuth) plus the email, within the request's FREE_SUBREQUESTS. */
const CHANGE_MAX_TOKENS = FREE_SUBREQUESTS - 2;

/** Runs in waitUntil after an edit took effect (never after a 409 stale). `before` is the version the edit replaced; `s` the route's settings. */
export async function afterSaleEdit(c: Context<AppEnv>, before: Sale, after: Sale, s?: Settings): Promise<void> {
  const set = await barberChangeSettings(c, before, s);
  if (!set) return;
  const moved = after.barber_id !== before.barber_id ? " · moved to another barber" : "";
  const detail = `${moneyText(before.amount, set)} → ${moneyText(after.amount, set)}${moved}`;
  await emailStaff(c, set, [before.barber_id], (b) =>
    staffSaleChangedEmail({ ...b, admin: c.var.tenant.user.name, billNo: before.bill_no, action: "changed", detail }),
  );
  if (!hasFeature(c, "push")) return;
  await notifyUsers(
    c,
    c.var.tenant.org.id,
    [before.barber_id],
    {
      title: "Your sale was changed",
      body: `${before.bill_no} · ${moneyText(before.amount, set)} → ${moneyText(after.amount, set)}${moved} · by the admin`,
      path: "/history/",
      tag: `sale-${before.id}`,
    },
    { maxTokens: CHANGE_MAX_TOKENS },
  );
}

/** Runs in waitUntil after a delete took effect (never after a 409 stale). */
export async function afterSaleDelete(c: Context<AppEnv>, sale: Sale): Promise<void> {
  const s = await barberChangeSettings(c, sale);
  if (!s) return;
  await emailStaff(c, s, [sale.barber_id], (b) =>
    staffSaleChangedEmail({ ...b, admin: c.var.tenant.user.name, billNo: sale.bill_no, action: "deleted", detail: `${moneyText(sale.amount, s)} · ${sale.customer_label}` }),
  );
  if (!hasFeature(c, "push")) return;
  await notifyUsers(
    c,
    c.var.tenant.org.id,
    [sale.barber_id],
    { title: "Your sale was deleted", body: `${sale.bill_no} · ${moneyText(sale.amount, s)} · ${sale.customer_label} · by the admin`, path: "/history/", tag: `sale-${sale.id}` },
    { maxTokens: CHANGE_MAX_TOKENS },
  );
}

/** The seam the sales routes call through, so Plan 2b (and tests) can replace the defaults. */
export const hooks: {
  afterSale: (c: Context<AppEnv>, sale: Sale, s?: Settings) => Promise<void>;
  afterSaleEdit: (c: Context<AppEnv>, before: Sale, after: Sale, s?: Settings) => Promise<void>;
  afterSaleDelete: (c: Context<AppEnv>, sale: Sale) => Promise<void>;
} = { afterSale, afterSaleEdit, afterSaleDelete };

/**
 * Schedules a hook in waitUntil. Promise.resolve().then: even a hook that throws synchronously can never fail
 * a committed write; errors are only logged.
 */
export function runHook(c: Context<AppEnv>, name: string, fn: () => Promise<void>): void {
  c.executionCtx.waitUntil(Promise.resolve().then(fn).catch((err) => console.error(`${name} hook failed`, err)));
}
