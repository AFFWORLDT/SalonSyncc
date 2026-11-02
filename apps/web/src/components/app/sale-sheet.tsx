"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertCircle, Banknote, CreditCard, PartyPopper, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useApi, notifyDataChanged } from "@/hooks/use-api";
import { money, checkPhone, businessToday, currencyCode, fromInput, getFormat, includedVat, splitPhone, toInput } from "@/lib/format";
import { isStale } from "@/lib/api";
import type { PaymentMode, Sale, Service, Settings, SettingsResponse, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/app/date-input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field } from "@/components/app/field";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Bill, BillActions, BillDialog } from "@/components/app/bill";
import { CustomerPicker } from "@/components/app/customer-picker";
import { type CustomerHit } from "@/components/app/customer-suggest";
import { BarberGrid } from "@/components/app/barber-grid";
import { linesTotal, priceTarget, ServicePicker, type Line, type PadTarget } from "@/components/app/service-picker";
import { NumPad } from "@/components/app/num-pad";
import { applyKey, type PadKey } from "@/lib/numpad";
import { haptic } from "@/lib/haptics";

interface SaleSheetValue {
  openNew: () => void;
  openEdit: (sale: Sale) => void;
  openBill: (sale: Sale) => void;
}

/** Wall-clock time for the instant bill (called from the save handler, not during render). */
const nowMs = () => Date.now();

const SaleSheetContext = createContext<SaleSheetValue | null>(null);

export function useSaleSheet(): SaleSheetValue {
  const ctx = useContext(SaleSheetContext);
  if (!ctx) throw new Error("useSaleSheet must be used within SaleSheetProvider");
  return ctx;
}

export { receiptUrl, whatsappLink } from "@/components/app/bill";

export function SaleSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [key, setKey] = useState(0);

  const openNew = useCallback(() => {
    setEditing(null);
    setKey((k) => k + 1);
    setOpen(true);
  }, []);
  const openEdit = useCallback((sale: Sale) => {
    setEditing(sale);
    setKey((k) => k + 1);
    setOpen(true);
  }, []);
  const [bill, setBill] = useState<Sale | null>(null);
  const { settings, readOnly } = useAuth();
  // A lapsed subscription is read-only: bills still open, but no new or changed sales (the API would answer 402).
  const value = useMemo(() => {
    const blocked = () => toast.error("Your subscription has ended. Upgrade to add or change sales.");
    return readOnly ? { openNew: blocked, openEdit: blocked, openBill: setBill } : { openNew, openEdit, openBill: setBill };
  }, [openNew, openEdit, readOnly]);

  return (
    <SaleSheetContext.Provider value={value}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto flex h-[96dvh] w-full flex-col gap-0 overflow-clip rounded-t-2xl p-0 sm:max-w-lg">
          <KeyboardOverlays />
          <SaleForm key={key} editing={editing} onClose={() => setOpen(false)} onAnother={openNew} />
        </SheetContent>
      </Sheet>
      <BillDialog sale={bill} settings={settings} onClose={() => setBill(null)} />
    </SaleSheetContext.Provider>
  );
}

/**
 * While the sale sheet is open the phone keyboard (only for the name and note now) covers the page
 * instead of shrinking it, so nothing jumps. The app's default (resizes-content) comes back on close.
 */
function KeyboardOverlays() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const before = meta.content;
    meta.content = before.replace(/interactive-widget=[\w-]+/, "interactive-widget=overlays-content");
    return () => {
      meta.content = before;
    };
  }, []);
  return null;
}

/**
 * Scrolls only the sheet's middle area so `el` shows (centred for fields the phone keyboard covers the
 * bottom of). scrollIntoView would also scroll the sheet itself and push the pad off screen.
 */
function reveal(el: Element | null, center = false) {
  const box = el?.closest("[data-scroller]");
  if (!el || !box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const delta = center ? r.top + r.height / 2 - (b.top + b.height / 3) : r.top < b.top ? r.top - b.top - 8 : r.bottom > b.bottom ? r.bottom - b.bottom + 8 : 0;
  if (Math.abs(delta) > 1) box.scrollBy({ top: delta, behavior: "smooth" });
}

type Step = "barber" | "services" | "customer";

const TARGET_LABEL: Record<string, string> = { amount: "Amount", other: "Other item price" };

function SaleForm({ editing, onClose, onAnother }: { editing: Sale | null; onClose: () => void; onAnother: () => void }) {
  const { user, settings, isAdmin } = useAuth();
  const users = useApi<User[]>(isAdmin ? "/api/users" : null);
  const services = useApi<Service[]>("/api/services");
  const autoLabel = editing && /^Customer \d+$/.test(editing.customer_label);

  const [lines, setLines] = useState<Line[]>(() =>
    (editing?.items ?? []).map((i, n) => ({ key: `e${n}`, service_id: i.service_id, name: i.name, price: i.price, qty: i.qty }))
  );
  const [amount, setAmount] = useState(editing && !editing.items.length ? toInput(editing.amount) : "");
  const total = lines.length ? linesTotal(lines) : fromInput(amount) || 0;
  const [mode, setMode] = useState<PaymentMode>(editing?.payment_mode ?? "cash");
  const [name, setName] = useState(editing && !autoLabel ? editing.customer_label : "");
  const initialPhone = splitPhone(editing?.customer_phone ?? null);
  const [cc, setCc] = useState(initialPhone.cc);
  const [phone, setPhone] = useState(initialPhone.local);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const phoneCheck = checkPhone(cc, phone);
  const [note, setNote] = useState(editing?.note ?? "");
  // Admin picks the barber first (never remembered, so a bill can't land on the wrong barber); barbers sell as themselves.
  const [barberId, setBarberId] = useState(editing ? String(editing.barber_id) : isAdmin ? "" : String(user?.id ?? ""));
  const [step, setStep] = useState<Step>(editing || !isAdmin ? "services" : "barber");
  const [day, setDay] = useState(editing?.day ?? businessToday());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Sale | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [otherPrice, setOtherPrice] = useState("");
  // The number pad types into one field at a time. `fresh`: the next digit replaces the value.
  const [target, setTarget] = useState<PadTarget | null>(lines.length ? null : "amount");
  const [fresh, setFresh] = useState(true);
  const [priceText, setPriceText] = useState("");
  const phoneDigits = phone.replace(/\D/g, "");

  function select(t: PadTarget) {
    setTarget(t);
    setFresh(true);
    const line = lines.find((l) => priceTarget(l) === t);
    if (line) setPriceText(toInput(line.price));
    // The field being typed into stays visible above the pad.
    requestAnimationFrame(() => reveal(document.querySelector(`[data-pad="${t}"]`)));
  }

  function changeLines(next: Line[]) {
    const added = next.find((l) => !lines.some((o) => o.key === l.key));
    setLines(next);
    if (added) {
      // A new service: the pad now changes its price (the catalogue price stays until a key is pressed).
      setTarget(priceTarget(added));
      setFresh(true);
      setPriceText(toInput(added.price));
    } else if (!next.length && target?.startsWith("price:")) {
      setTarget("amount");
      setFresh(true);
    } else if (target?.startsWith("price:") && !next.some((l) => priceTarget(l) === target)) {
      setTarget(null);
    }
  }

  function onKey(k: PadKey) {
    setFormError(null);
    if (!target) return;
    if (target === "amount") setAmount((v) => applyKey(v, k, "money", fresh));
    else if (target === "other") setOtherPrice((v) => applyKey(v, k, "money", fresh));
    else {
      const next = applyKey(priceText, k, "money", fresh);
      setPriceText(next);
      const minor = fromInput(next);
      if (minor > 0) setLines((ls) => ls.map((l) => (priceTarget(l) === target ? { ...l, price: minor } : l)));
    }
    setFresh(false);
  }

  const targetLabel = !target
    ? "Tap a price or amount to type"
    : (TARGET_LABEL[target] ?? `Price · ${lines.find((l) => priceTarget(l) === target)?.name ?? ""}`);

  function pickCustomer(c: CustomerHit) {
    const p = splitPhone(c.phone);
    setName(c.name ?? "");
    setCc(p.cc);
    setPhone(p.local);
    setFormError(null);
  }

  function clearCustomer() {
    setName("");
    setPhone("");
    setCc(getFormat().phoneCountry);
    setFormError(null);
  }


  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setPhoneTouched(true);
    setFormError(null);
    if (phoneCheck.error) return;
    setSaving(true);
    try {
      const body = {
        ...(lines.length
          ? { items: lines.map((l) => (l.service_id ? { service_id: l.service_id, price: l.price / getFormat().minor, qty: l.qty } : { name: l.name, price: l.price / getFormat().minor, qty: l.qty })) }
          : { amount }),
        payment_mode: mode,
        customer_name: name || null,
        customer_phone: phoneCheck.value,
        note: note || null,
        ...(isAdmin ? { barber_id: Number(barberId), day } : {}),
      };
      if (editing) {
        await api<Sale>(`/api/sales/${editing.id}`, { method: "PUT", body });
        notifyDataChanged();
        haptic("success");
        toast.success("Sale updated");
        onClose();
        return;
      }
      // Show the bill at once; the server fills in the bill number a moment later.
      const minorTotal = total;
      const vatRate = settings?.vat_enabled ? settings.vat_rate : 0;
      const barberName = isAdmin ? (users.data?.find((u) => String(u.id) === barberId)?.name ?? user?.name ?? "") : (user?.name ?? "");
      setSaved({
        id: 0,
        bill_no: "…",
        token: "",
        day,
        barber_id: Number(barberId),
        barber_name: barberName,
        customer_id: null,
        customer_label: name.trim() || "Customer",
        customer_phone: phoneCheck.value,
        amount: minorTotal,
        payment_mode: mode,
        note: note.trim() || null,
        commission_pct: 0,
        commission: 0,
        vat_rate: vatRate,
        // VAT is included in the price; vat_rate is a percent (same formula as the API's vatOf).
        vat_amount: includedVat(minorTotal, vatRate),
        created_at: nowMs(),
        items: lines.map((l) => ({ service_id: l.service_id, name: l.name, price: l.price, qty: l.qty })),
      });
      const sale = await api<Sale>("/api/sales", { body });
      setSaved(sale);
      haptic("success");
      notifyDataChanged();
    } catch (err) {
      // Back to the form, with the reason shown inside it (a toast would sit behind the sheet's overlay).
      setSaved(null);
      haptic("error");
      setFormError(errorMessage(err));
      // Someone else changed this sale at the same moment: refresh the lists behind the sheet; the form stays open.
      if (isStale(err)) notifyDataChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    try {
      await api(`/api/sales/${editing.id}`, { method: "DELETE" });
      notifyDataChanged();
      haptic("warning");
      toast.success("Sale deleted");
      onClose();
    } catch (err) {
      haptic("error");
      toast.error(errorMessage(err));
      if (isStale(err)) notifyDataChanged();
    }
  }

  if (saved)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <SavedView sale={saved} settings={settings} onDone={onClose} onAnother={onAnother} />
      </div>
    );

  const quick = settings?.quick_amounts ?? [];
  const padRing = (t: PadTarget) => (target === t ? "border-primary bg-primary/10 ring-3 ring-primary/30" : "border-input");
  const barberName = isAdmin ? (users.data?.find((u) => String(u.id) === barberId)?.name ?? "") : (user?.name ?? "");
  const canServices = !!barberId;
  const canCustomer = canServices && total > 0;
  const steps: { key: Step; label: string; value: string; enabled: boolean }[] = [
    ...(isAdmin ? [{ key: "barber" as const, label: "Barber", value: barberName, enabled: true }] : []),
    { key: "services", label: "Services", value: total ? money(total) : "", enabled: canServices },
    { key: "customer", label: "Customer", value: name.trim() || (phone ? "Mobile added" : ""), enabled: canCustomer },
  ];
  const go = (to: Step) => {
    haptic("tap");
    setFormError(null);
    setStep(to);
  };
  const errorBox = formError && (
    <p role="alert" className="mb-2 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {formError}
    </p>
  );

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="gap-3 border-b px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg">{editing ? `Edit ${editing.bill_no}` : "New sale"}</SheetTitle>
            <SheetDescription className="sr-only">Pick the barber, the services, then the customer.</SheetDescription>
          </div>
          {editing && (
            <Button type="button" variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete sale">
              <Trash2 />
            </Button>
          )}
        </div>
        <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Steps">
          {steps.map((st, i) => {
            const on = st.key === step;
            return (
              <li key={st.key}>
                <button
                  type="button"
                  disabled={!st.enabled || on}
                  onClick={() => go(st.key)}
                  aria-current={on ? "step" : undefined}
                  className={cn(
                    "flex w-full flex-col items-start rounded-lg border-b-2 px-1 pb-1.5 text-left transition-colors",
                    on ? "border-primary" : st.value ? "border-primary/40" : "border-border",
                    !st.enabled && "opacity-40"
                  )}
                >
                  <span className={cn("text-[11px] font-medium tracking-wide uppercase", on ? "text-primary" : "text-muted-foreground")}>
                    {i + 1} · {st.label}
                  </span>
                  <span className="num w-full truncate text-sm font-semibold">{st.value || "—"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </SheetHeader>

      {step === "barber" && (
        <div data-scroller className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <p className="mb-3 text-sm text-muted-foreground">Who did this customer?</p>
          <BarberGrid
            users={users.data}
            value={barberId}
            onPick={(v) => {
              setBarberId(v);
              setFormError(null);
              setStep("services");
            }}
          />
        </div>
      )}

      {step === "services" && (
        <>
          {/* Only this part scrolls; the total and number pad below never move. */}
          <div data-scroller className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-5 p-4">
              <ServicePicker
                services={services.data}
                lines={lines}
                onChange={changeLines}
                target={target}
                onTarget={select}
                activeText={priceText}
                otherPrice={otherPrice}
                setOtherPrice={setOtherPrice}
              />
              {!lines.length && (
                <>
                  <Field label={`Or just the amount (${currencyCode()})`} htmlFor="sale-amount">
                    <button
                      id="sale-amount"
                      data-pad="amount"
                      type="button"
                      onClick={() => {
                        haptic("tap");
                        select("amount");
                      }}
                      className={cn("num flex h-14 w-full items-center justify-center rounded-lg border text-3xl font-semibold", padRing("amount"))}
                    >
                      {amount || <span className="text-muted-foreground">0</span>}
                    </button>
                  </Field>
                  {quick.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="group" aria-label="Quick amounts">
                      {quick.map((q) => (
                        <Button
                          key={q}
                          type="button"
                          variant={Number(amount) === q ? "default" : "outline"}
                          className="num h-11 text-base"
                          onClick={() => {
                            haptic("select");
                            setAmount(String(q));
                            setTarget("amount");
                            setFresh(true);
                          }}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="border-t bg-popover px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {errorBox}
            <div className="mb-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Total</p>
                <p className="num text-2xl leading-tight font-semibold">{money(total)}</p>
              </div>
              <p className="truncate pb-1 text-xs text-primary">{target ? `Typing: ${targetLabel}` : targetLabel}</p>
            </div>
            <NumPad
              onKey={onKey}
              action={
                <button
                  type="button"
                  disabled={!canCustomer}
                  onPointerDown={() => haptic("tap")}
                  onClick={() => go("customer")}
                  className="flex flex-1 flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground active:scale-[0.97] disabled:opacity-40"
                >
                  <span className="text-base font-semibold">Next →</span>
                  {total > 0 && <span className="num text-xs opacity-80">{money(total)}</span>}
                </button>
              }
            />
          </div>
        </>
      )}

      {step === "customer" && (
        <>
          <div data-scroller className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-5 p-4">
              <Field label="Customer (optional)" htmlFor="sale-customer">
                <CustomerPicker
                  id="sale-customer"
                  name={name}
                  cc={cc}
                  local={phone}
                  setName={(v) => {
                    setName(v);
                    setFormError(null);
                  }}
                  setCc={setCc}
                  setLocal={(v) => {
                    setPhone(v);
                    setFormError(null);
                  }}
                  phoneError={phoneTouched || phoneDigits.length >= 9 ? phoneCheck.error : null}
                  onPick={pickCustomer}
                  onClear={clearCustomer}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment">
                {(
                  [
                    ["cash", "Cash", Banknote],
                    ["card", "Card", CreditCard],
                  ] as const
                ).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={mode === v}
                    onClick={() => {
                      haptic("select");
                      setMode(v);
                    }}
                    className={cn(
                      "flex h-14 items-center justify-center gap-2 rounded-xl border text-base font-medium transition-colors",
                      mode === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground active:bg-muted"
                    )}
                  >
                    <Icon className="size-5" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Barber</span>
                  <span className="font-medium">{barberName || "—"}</span>
                </div>
                <ul className="my-2 flex flex-col gap-1 border-y py-2">
                  {lines.length ? (
                    lines.map((l) => (
                      <li key={l.key} className="flex justify-between gap-3">
                        <span className="truncate">
                          {l.name}
                          {l.qty > 1 ? ` × ${l.qty}` : ""}
                        </span>
                        <span className="num">{money(l.price * l.qty)}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-muted-foreground">Amount only</li>
                  )}
                </ul>
                <div className="flex justify-between gap-3 text-base font-semibold">
                  <span>Total</span>
                  <span className="num">{money(total)}</span>
                </div>
              </div>

              <details className="group rounded-xl border px-3 py-2" open={!!note || (isAdmin && day !== businessToday())}>
                <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground">
                  More {isAdmin ? "(day, note)" : "(note)"}
                </summary>
                <div className="mt-3 flex flex-col gap-4 pb-1">
                  {isAdmin && (
                    <Field label="Day" htmlFor="sale-day" hint="Change only to enter a missed sale">
                      <DateInput id="sale-day" max={businessToday()} value={day} onChange={(e) => setDay(e.target.value)} className="h-11" />
                    </Field>
                  )}
                  <Field label="Note on the bill (optional)" htmlFor="sale-note">
                    <Input
                      id="sale-note"
                      autoComplete="off"
                      placeholder="e.g. haircut + beard"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onFocus={(e) => setTimeout(() => reveal(e.target, true), 300)}
                      className="h-11"
                    />
                  </Field>
                </div>
              </details>
            </div>
          </div>
          <div className="border-t bg-popover px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {errorBox}
            <Button
              type="submit"
              size="lg"
              className="h-14 w-full text-base"
              disabled={saving || !total || !barberId || (phoneTouched && !!phoneCheck.error)}
              onPointerDown={() => haptic("tap")}
            >
              {saving ? "Saving…" : `${editing ? "Save changes" : "Save bill"} · ${money(total)}`}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this sale?"
        description="It will be removed from today's totals."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      />
    </form>
  );
}

function SavedView({ sale, settings, onDone, onAnother }: { sale: Sale; settings: SettingsResponse | null; onDone: () => void; onAnother: () => void }) {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center gap-3 rounded-xl bg-success/10 p-3">
        <div className="flex size-11 shrink-0 animate-in items-center justify-center rounded-full bg-success text-white zoom-in-50 duration-300">
          <PartyPopper className="size-5" />
        </div>
        <div className="min-w-0">
          <SheetTitle className="text-base">Congrats! Bill generated</SheetTitle>
          <SheetDescription className="truncate">
            {sale.id ? `${sale.bill_no} · ${money(sale.amount)} · saved under Bills` : `${money(sale.amount)} · saving…`}
          </SheetDescription>
        </div>
      </div>
      <Bill sale={sale} settings={settings} />
      <BillActions sale={sale} settings={settings} disabled={!sale.id} />
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant="outline" className="h-12 text-base" onClick={onDone}>
          Done
        </Button>
        <Button size="lg" className="h-12 text-base" onClick={onAnother} disabled={!sale.id}>
          <Plus />
          New sale
        </Button>
      </div>
    </div>
  );
}
