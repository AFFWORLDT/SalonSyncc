"use client";

import { useApi } from "@/hooks/use-api";
import { money, dateTimeLabel, dayLabel, pctLabel, phoneLabel } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  amount: "Amount",
  barber_name: "Barber",
  customer_label: "Customer",
  customer_phone: "Phone",
  payment_mode: "Payment",
  note: "Note",
  commission_pct: "Commission %",
  commission: "Commission",
  vat_rate: "VAT rate",
  vat_amount: "VAT",
  items: "Services",
  day: "Day",
  name: "Name",
  username: "Username",
  phone: "Phone",
  role: "Role",
  sort_order: "Order",
  active: "Active",
  can_add_expense: "Can add expenses",
  category: "Group",
  description: "Description",
  price: "Price",
  default_commission_pct: "Default commission %",
  quick_amounts: "Quick amounts",
};

/** Ids that have a readable twin (barber_id → barber_name) are not shown on their own. */
const HIDDEN = new Set(["barber_id"]);
const MONEY = new Set(["amount", "commission", "vat_amount", "price", "notify_sale_min"]);

export function fieldLabel(key: string): string {
  return LABELS[key] ?? key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (MONEY.has(key) && typeof v === "number") return money(v);
  if (key === "commission_pct" || key === "default_commission_pct") return pctLabel(Number(v));
  if (key === "vat_rate") return `${Math.round(Number(v) * 100)}%`;
  if (key === "day" && typeof v === "string") return dayLabel(v);
  if ((key === "customer_phone" || key === "phone") && typeof v === "string") return phoneLabel(v);
  if (key === "payment_mode") return String(v).toUpperCase();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (key === "items" && Array.isArray(v)) {
    return v.length ? v.map((i: { name: string; qty: number; price: number }) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""} ${money(i.price)}`).join(", ") : "—";
  }
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

const VERB: Record<string, string> = { create: "Created", update: "Edited", delete: "Deleted", password_reset: "Password reset" };
export const actionVerb = (a: string) => VERB[a] ?? a;

/** Edits show old → new per changed field; creates and deletes show the record itself. */
export function AuditDiff({ entry, className }: { entry: AuditEntry; className?: string }) {
  const edit = entry.action === "update";
  const snap = entry.after ?? entry.before;
  const keys = (edit ? entry.changed : Object.keys(snap ?? {})).filter((k) => !HIDDEN.has(k));
  if (!keys.length) return null;
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs", className)}>
      {keys.map((k) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{fieldLabel(k)}</dt>
          <dd className="min-w-0 break-words">
            {edit ? (
              <>
                <span className="text-muted-foreground line-through">{show(k, entry.before?.[k])}</span>
                {" → "}
                <span className="font-medium">{show(k, entry.after?.[k])}</span>
              </>
            ) : (
              <span className={cn(entry.action === "delete" && "line-through")}>{show(k, snap?.[k])}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A bill's journey, oldest first (admin only). */
export function BillHistory({ saleId }: { saleId: number }) {
  const { data, error } = useApi<AuditEntry[]>(`/api/sales/${saleId}/history`);
  return (
    <section className="mt-4">
      <p className="mb-2 text-sm font-semibold">History</p>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !data ? (
        <Skeleton className="h-16" />
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Created before the audit log started.</p>
      ) : (
        <ol className="relative space-y-3 border-l pl-4">
          {data.map((e) => (
            <li key={e.id} className="relative">
              <span
                className={cn(
                  "absolute top-1 -left-[1.3rem] size-2.5 rounded-full ring-2 ring-background",
                  e.action === "delete" ? "bg-destructive" : e.action === "create" ? "bg-success" : "bg-primary"
                )}
              />
              <p className="text-xs">
                <span className="font-medium">{actionVerb(e.action)}</span> by {e.actor_name} · {dateTimeLabel(e.at)}
              </p>
              {e.action === "update" && <AuditDiff entry={e} className="mt-1" />}
              {e.action === "create" && e.after && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {show("amount", e.after.amount)} · {show("payment_mode", e.after.payment_mode)} · {String(e.after.barber_name ?? "")}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
