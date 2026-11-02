"use client";

import { useEffect, useState } from "react";
import { Check, CheckCheck, Link2, Printer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { money, currencyCode, dateTimeLabel, fillTemplate, fixed, pctLabel, phoneLabel, timeLabel, whatsappDigits } from "@/lib/format";
import type { Sale, Settings, SettingsResponse, WaMessage } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/app/whatsapp-icon";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { BillHistory } from "@/components/app/audit-diff";

/** Public link to the bill: anyone with it can open it, no sign-in (the token is random per sale). */
export function receiptUrl(token: string) {
  return `${window.location.origin}/r/?t=${encodeURIComponent(token)}`;
}

/** wa.me link with the thank-you text filled in, or null when there is no phone. */
export function whatsappLink(sale: Sale, settings: Settings | null): string | null {
  if (!sale.customer_phone || !settings) return null;
  const name = /^Customer \d+$/.test(sale.customer_label) ? "" : sale.customer_label;
  const text = fillTemplate(settings.thank_you_text, {
    name,
    amount: money(sale.amount),
    salon: settings.display_name,
    barber: sale.barber_name,
    link: receiptUrl(sale.token),
  })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
  return `https://wa.me/${whatsappDigits(sale.customer_phone)}?text=${encodeURIComponent(text)}`;
}

/**
 * WhatsApp with the bill link. With a saved number it opens that customer's chat directly (the
 * thank-you text when it is on, otherwise the bill line); without one, WhatsApp asks for a chat.
 */
export function billWhatsappLink(sale: Sale, settings: Settings | null): string {
  const direct = whatsappLink(sale, settings);
  if (direct) return direct;
  const text = `${settings?.display_name ?? ""} bill ${sale.bill_no} · ${money(sale.amount)}\n${receiptUrl(sale.token)}`;
  const to = sale.customer_phone ? whatsappDigits(sale.customer_phone) : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** Phone share sheet when there is one, otherwise copy the bill link. */
export async function shareBill(sale: Sale, settings: Settings | null) {
  const url = receiptUrl(sale.token);
  const title = settings?.display_name ? `Bill ${sale.bill_no} — ${settings.display_name}` : `Bill ${sale.bill_no}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `${title} · ${money(sale.amount)}`, url });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Bill link copied");
  } catch {
    window.prompt("Copy the bill link", url);
  }
}

/**
 * The bill for one sale, laid out as a tax invoice. Salon name, address, phone and TRN
 * come from Settings (editable by the admin); VAT comes from the sale (its rate was fixed when it was saved).
 * Always black on white so it prints the same in dark mode.
 */
/** What the bill shows; the public receipt (/r) passes the same fields, so both look identical. */
export type BillSale = Pick<
  Sale,
  "bill_no" | "created_at" | "barber_name" | "customer_label" | "customer_phone" | "payment_mode" | "items" | "note" | "amount" | "vat_rate" | "vat_amount"
>;
export type BillSettings = Pick<Settings, "display_name" | "salon_name_ar" | "address" | "phone" | "trn" | "receipt_footer" | "logo_url">;

export function Bill({ sale, settings }: { sale: BillSale; settings: BillSettings | null }) {
  const tax = sale.vat_rate > 0;
  const name = settings?.display_name ?? "";
  // Older or amount-only sales have no items: show one line with the note.
  const lines = sale.items.length ? sale.items : [{ service_id: null, name: sale.note || "Salon service", price: sale.amount, qty: 1 }];
  const rate = pctLabel(sale.vat_rate); // a percent (5 = 5%)
  return (
    <div data-print className="font-mono rounded-xl bg-white p-5 text-[13px] leading-snug text-black ring-1 ring-black/10">
      <div className="flex flex-col items-center gap-1 pb-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={settings?.logo_url || "/icon.svg"} alt="" width={64} height={64} className="mb-1 size-16 rounded-full object-contain" />
        <p className="font-sans text-base font-semibold">{name}</p>
        {settings?.salon_name_ar && (
          <p dir="rtl" lang="ar" className="font-sans text-sm">
            {settings.salon_name_ar}
          </p>
        )}
        {settings?.address && <p className="text-xs">{settings.address}</p>}
        {settings?.phone && <p className="text-xs">Phone: {phoneLabel(settings.phone)}</p>}
        {tax && settings?.trn && <p className="text-xs">{/^\d{15}$/.test(settings.trn) ? "TRN" : "Tax no."}: {settings.trn}</p>}
        <p className="mt-2 text-sm font-bold tracking-[0.2em]">{tax ? "TAX INVOICE" : "BILL"}</p>
      </div>

      <div className="flex justify-between gap-3 border-t border-dashed border-black/30 py-3 text-xs">
        <div className="space-y-0.5">
          <p>
            <b>No:</b> {sale.bill_no}
          </p>
          <p>
            <b>Date:</b> {dateTimeLabel(sale.created_at)}
          </p>
          <p>
            <b>Barber:</b> {sale.barber_name}
          </p>
        </div>
        <div className="space-y-0.5 text-right">
          <p>
            <b>Client:</b> {sale.customer_label}
          </p>
          {sale.customer_phone && <p>{phoneLabel(sale.customer_phone)}</p>}
          <p>
            <b>Mode:</b> {sale.payment_mode.toUpperCase()}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1 text-left">Service</th>
            <th className="py-1 pl-2 text-right">Qty</th>
            <th className="py-1 pl-2 text-right">Price</th>
            {tax && <th className="py-1 pl-2 text-right">VAT</th>}
            <th className="py-1 pl-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-dotted border-black/30">
              <td className="py-1.5 pr-2">{l.name}</td>
              <td className="py-1.5 pl-2 text-right">{l.qty}</td>
              <td className="py-1.5 pl-2 text-right whitespace-nowrap">{fixed(l.price)}</td>
              {tax && <td className="py-1.5 pl-2 text-right whitespace-nowrap">{rate}</td>}
              <td className="py-1.5 pl-2 text-right whitespace-nowrap">{fixed(l.price * l.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sale.items.length > 0 && sale.note && <p className="mt-2 text-xs">Note: {sale.note}</p>}

      <div className="mt-3 ml-auto w-full max-w-60 space-y-1 text-xs">
        <div className="flex justify-between border-t border-black pt-2 text-sm font-bold">
          <span>{tax ? "Total (incl. VAT)" : "Total"}</span>
          <span>{money(sale.amount)}</span>
        </div>
        {tax && (
          <>
            <div className="flex justify-between">
              <span>Taxable amount</span>
              <span>{money(sale.amount - sale.vat_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT {rate}</span>
              <span>{money(sale.vat_amount)}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 border-t border-dashed border-black/30 pt-3 text-center text-[11px] text-black/60">
        {tax && <p>Prices include VAT. Amounts in {currencyCode()}.</p>}
        <p>{settings?.receipt_footer || (name ? `Thank you for visiting ${name}!` : "Thank you for visiting!")}</p>
      </div>
    </div>
  );
}

/**
 * Prints the bill on screen. The bill sits inside a scrolling, transformed dialog/sheet that would clip it,
 * so a copy goes into a top-level #print-root and only that is printed (see globals.css).
 */
export function printBill() {
  const bills = document.querySelectorAll<HTMLElement>("[data-print]");
  const bill = bills[bills.length - 1];
  if (!bill) return;
  const root = document.createElement("div");
  root.id = "print-root";
  root.appendChild(bill.cloneNode(true));
  document.body.appendChild(root);
  document.documentElement.classList.add("print-bill");
  const done = () => {
    root.remove();
    document.documentElement.classList.remove("print-bill");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

/** Print, share link and WhatsApp for a saved bill. */
export function BillActions({ sale, settings, disabled }: { sale: Sale; settings: SettingsResponse | null; disabled?: boolean }) {
  const { has } = useAuth();
  // Sending from the salon's own number needs the plan feature and a connected number; otherwise a wa.me link.
  const cloud = has("whatsapp") && !!settings?.wa_ready && !!sale.customer_phone && sale.id > 0;
  return (
    <div className="flex flex-col gap-2">
    <div className="grid grid-cols-3 gap-2">
      <Button variant="outline" className="h-11 gap-1.5 px-2 text-[13px] sm:text-sm" onClick={() => {
          haptic("tap");
          printBill();
        }}
        disabled={disabled}
      >
        <Printer />
        Print
      </Button>
      <Button variant="outline" className="h-11 gap-1.5 px-2 text-[13px] sm:text-sm" onClick={() => {
          haptic("tap");
          shareBill(sale, settings);
        }} disabled={disabled}>
        <Link2 />
        Share link
      </Button>
      {cloud ? (
        <WaSendButton sale={sale} disabled={disabled} />
      ) : (
        <Button
          variant="outline"
          className="h-11 gap-1.5 px-2 text-[13px] sm:text-sm"
          disabled={disabled}
          nativeButton={false}
          render={<a href={billWhatsappLink(sale, settings)} target="_blank" rel="noopener noreferrer" />}
        >
          <WhatsAppIcon className="size-5" />
          WhatsApp
        </Button>
      )}
    </div>
    {cloud && <WaBillStatus saleId={sale.id} />}
    </div>
  );
}

const WA_CHANGED = "ss:wa-bill";

/** Sends the bill from the salon's WhatsApp number (Cloud API). */
function WaSendButton({ sale, disabled }: { sale: Sale; disabled?: boolean }) {
  const [sending, setSending] = useState(false);
  return (
    <Button
      variant="outline"
      className="h-11 gap-1.5 px-2 text-[13px] sm:text-sm"
      disabled={disabled || sending}
      onClick={async () => {
        haptic("tap");
        setSending(true);
        try {
          const m = await api<WaMessage>(`/api/sales/${sale.id}/whatsapp`, { method: "POST" });
          window.dispatchEvent(new Event(WA_CHANGED));
          if (m.status === "sent") {
            haptic("success");
            toast.success("Bill sent on WhatsApp");
          } else toast.error(m.error ?? "Couldn't send on WhatsApp");
        } catch (err) {
          haptic("error");
          toast.error(errorMessage(err));
        } finally {
          setSending(false);
        }
      }}
    >
      <WhatsAppIcon className="size-5" />
      {sending ? "Sending…" : "WhatsApp"}
    </Button>
  );
}

/** The bill's last WhatsApp send. The automatic one runs just after saving, so it looks again shortly. */
function WaBillStatus({ saleId }: { saleId: number }) {
  const { data, reload } = useApi<WaMessage | null>(`/api/sales/${saleId}/whatsapp`);
  useEffect(() => {
    const t = setTimeout(reload, 3500);
    window.addEventListener(WA_CHANGED, reload);
    return () => {
      clearTimeout(t);
      window.removeEventListener(WA_CHANGED, reload);
    };
  }, [reload]);
  if (!data) return null;
  const when = timeLabel(data.created_at);
  return data.status === "sent" ? (
    <p className={cn("flex items-center justify-center gap-1.5 text-xs", data.read_at ? "text-sky-500" : "text-success")}>
      {data.delivered_at ? <CheckCheck className="size-3.5" /> : <Check className="size-3.5" />}
      {data.read_at ? "Read on WhatsApp" : data.delivered_at ? "Delivered on WhatsApp" : "Sent on WhatsApp"} · {when}
    </p>
  ) : (
    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
      <TriangleAlert className="size-3.5 shrink-0" /> {data.status === "skipped" ? "Not sent (test mode)" : `Couldn't send: ${data.error ?? "unknown error"}`}
    </p>
  );
}

/** A sale's bill in a dialog, with print. */
export function BillDialog({ sale, settings, onClose }: { sale: Sale | null; settings: SettingsResponse | null; onClose: () => void }) {
  const { isAdmin, has } = useAuth();
  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      {/* Header and buttons stay put; only the bill scrolls when it is taller than the screen. */}
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-5 pr-12 pb-3">
          <DialogTitle>Bill {sale?.bill_no}</DialogTitle>
          <DialogDescription>{sale ? `${money(sale.amount)} · ${sale.customer_label}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          {sale && <Bill sale={sale} settings={settings} />}
          {sale && isAdmin && has("audit_log") && sale.id > 0 && <BillHistory saleId={sale.id} />}
        </div>
        {sale && (
          <div className="border-t bg-popover px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <BillActions sale={sale} settings={settings} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
