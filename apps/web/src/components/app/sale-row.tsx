"use client";

import { Banknote, CreditCard, ReceiptText } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { money, dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSaleSheet, whatsappLink } from "./sale-sheet";
import { WhatsAppIcon } from "@/components/app/whatsapp-icon";

/** One sale in a list. Tapping opens it for editing when `editable`. */
export function SaleRow({ sale, editable, showBarber, showDay }: { sale: Sale; editable: boolean; showBarber?: boolean; showDay?: boolean }) {
  const { openEdit, openBill } = useSaleSheet();
  const { settings } = useAuth();
  const wa = whatsappLink(sale, settings);
  const cash = sale.payment_mode === "cash";
  const Icon = cash ? Banknote : CreditCard;
  const what = sale.items.length ? sale.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ") : sale.note;
  const body = (
    <>
      <div
        title={cash ? "Cash" : "Card"}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          cash ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-sky-500/15 text-sky-700 dark:text-sky-400"
        )}
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{sale.customer_label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {showDay ? `${dayLabel(sale.day)} · ` : ""}
          {timeLabel(sale.created_at)}
          {showBarber ? ` · ${sale.barber_name}` : ""}
          {sale.customer_phone ? ` · ${phoneLabel(sale.customer_phone)}` : ""}
          {what ? ` · ${what}` : ""}
        </p>
      </div>
      <p className="num shrink-0 text-sm font-semibold">{money(sale.amount)}</p>
    </>
  );
  return (
    <li className="flex items-center gap-1">
      {editable ? (
        <button type="button" onClick={() => openEdit(sale)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left active:bg-muted">
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5">{body}</div>
      )}
      <button
        type="button"
        onClick={() => openBill(sale)}
        aria-label={`View bill ${sale.bill_no}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted hover:text-foreground"
      >
        <ReceiptText className="size-5" />
      </button>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp ${sale.customer_label}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#25D366] active:bg-muted"
        >
          <WhatsAppIcon className="size-6" />
        </a>
      )}
    </li>
  );
}

export function SaleListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="flex flex-col gap-1 p-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-2 py-2.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-4 w-16" />
        </li>
      ))}
    </ul>
  );
}
