"use client";

import { useState } from "react";
import { ArrowLeft, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { notifyDataChanged, useApi } from "@/hooks/use-api";
import { api, errorMessage, qs } from "@/lib/api";
import { money, dayLabel, businessToday, num, timeLabel, toInput } from "@/lib/format";
import type { BarberBalance, BarberLedger, LedgerLine, MoneyAccount, Payout } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/admin/states";
import { DateInput } from "./date-input";
import { Field } from "./field";
import { MoneyTile } from "./money-tile";
import { SimpleSelect } from "./simple-select";
import { ACCOUNT_OPTIONS } from "./ledger-dialogs";

/** What the shop owes each barber: commission earned minus payouts. Tap one for their statement. */
export function LedgerBarbers() {
  const { data, error, reload } = useApi<BarberBalance[]>("/api/ledger/barbers");
  const [open, setOpen] = useState<BarberBalance | null>(null);
  const [paying, setPaying] = useState<{ barberId: number | null; current: Payout | null } | null>(null);
  const owed = (data ?? []).reduce((a, b) => a + b.balance, 0);

  if (open) return <Statement barber={open} onBack={() => setOpen(null)} onPay={(current) => setPaying({ barberId: open.id, current })} paying={paying} setPaying={setPaying} barbers={data ?? []} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <MoneyTile label="Owed to barbers" value={data ? owed : null} hint="Commission earned minus payouts" className="bg-primary/5" />
        <Card className="justify-center p-4">
          <Button onClick={() => setPaying({ barberId: null, current: null })} disabled={!data?.length}>
            <HandCoins />
            Pay barber
          </Button>
        </Card>
      </div>
      <Card className="gap-0 p-0">
        <div className="grid grid-cols-[1fr_5rem] sm:grid-cols-[1fr_repeat(3,minmax(0,5rem))] gap-2 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>Barber</span>
          <span className="hidden text-right sm:block">Earned</span>
          <span className="hidden text-right sm:block">Paid</span>
          <span className="text-right">Owed</span>
        </div>
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <ul className="divide-y">
            {data.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setOpen(b)}
                  className={cn(
                    "grid w-full grid-cols-[1fr_5rem] sm:grid-cols-[1fr_repeat(3,minmax(0,5rem))] items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 active:bg-muted",
                    !b.active && "opacity-60"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarImage src={b.avatar_url ?? "/default-avatar.webp"} alt="" />
                      <AvatarFallback>{b.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{b.name}</span>
                  </span>
                  <span className="num hidden text-right text-sm text-muted-foreground sm:block">{num(b.earned, true)}</span>
                  <span className="num hidden text-right text-sm text-muted-foreground sm:block">{num(b.paid, true)}</span>
                  <span className={cn("num text-right text-sm font-semibold", b.balance < 0 && "text-destructive")}>{num(b.balance, true)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Amounts in AED. A negative &quot;owed&quot; means the barber was paid ahead (an advance).</p>
      <PayoutDialog state={paying} barbers={data ?? []} onClose={() => setPaying(null)} />
    </div>
  );
}

function Statement({
  barber,
  onBack,
  onPay,
  paying,
  setPaying,
  barbers,
}: {
  barber: BarberBalance;
  onBack: () => void;
  onPay: (current: Payout | null) => void;
  paying: { barberId: number | null; current: Payout | null } | null;
  setPaying: (p: null) => void;
  barbers: BarberBalance[];
}) {
  const today = businessToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const { data, error, reload } = useApi<BarberLedger>(`/api/ledger/barbers/${barber.id}${qs({ from, to })}`);
  const b = data?.barber ?? barber;

  async function openPayout(line: LedgerLine) {
    try {
      const list = await api<Payout[]>(`/api/payouts${qs({ month: line.day.slice(0, 7), barber_id: barber.id })}`);
      const p = list.find((x) => x.id === line.source_id);
      if (p) onPay(p);
      else toast.error("This payout was removed");
    } catch {
      toast.error("Couldn't open this payout");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="All barbers">
          <ArrowLeft />
        </Button>
        <h2 className="text-lg font-semibold">{b.name}</h2>
        <Button className="ml-auto" onClick={() => onPay(null)}>
          <HandCoins />
          Pay {b.name}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MoneyTile label="Earned" value={b.earned} />
        <MoneyTile label="Paid" value={b.paid} />
        <MoneyTile label="Owed now" value={b.balance} tone={b.balance < 0 ? "destructive" : "success"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DateInput aria-label="From" max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 w-36" />
        <span className="text-sm text-muted-foreground">to</span>
        <DateInput aria-label="To" min={from} max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 w-36" />
      </div>
      <Card className="gap-0 p-0">
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between bg-muted/40 px-4 py-3 text-sm font-semibold">
              <span>Owed on {dayLabel(data.from)}</span>
              <span className="num">{money(data.opening)}</span>
            </div>
            {data.lines.length ? (
              <ul className="divide-y border-y">
                {data.lines.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      disabled={l.source !== "payout" || l.kind === "reversal" || l.reversed}
                      onClick={() => openPayout(l)}
                      className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-left enabled:hover:bg-muted/40 enabled:active:bg-muted"
                    >
                      <span className={cn("min-w-0", (l.reversed || l.kind === "reversal") && "text-muted-foreground")}>
                        <span className={cn("block truncate text-sm", l.reversed && "line-through")}>{l.memo}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {dayLabel(l.day)} · {timeLabel(l.at)}
                          {l.actor_name ? ` · ${l.actor_name}` : ""}
                        </span>
                      </span>
                      <span className={cn("num text-sm font-semibold", l.amount < 0 ? "text-destructive" : "text-success", l.reversed && "line-through opacity-60")}>
                        {l.amount > 0 ? "+" : "−"}
                        {num(Math.abs(l.amount))}
                      </span>
                      <span className="num w-20 text-right text-sm text-muted-foreground">{num(l.balance)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-y px-4 py-8 text-center text-sm text-muted-foreground">Nothing in these days.</p>
            )}
          </>
        )}
      </Card>
      <PayoutDialog state={paying} barbers={barbers} onClose={() => setPaying(null)} />
    </div>
  );
}

function PayoutDialog({ state, barbers, onClose }: { state: { barberId: number | null; current: Payout | null } | null; barbers: BarberBalance[]; onClose: () => void }) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{state && <PayoutForm barberId={state.barberId} current={state.current} barbers={barbers} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}

function PayoutForm({ barberId, current, barbers, onDone }: { barberId: number | null; current: Payout | null; barbers: BarberBalance[]; onDone: () => void }) {
  const [who, setWho] = useState(String(current?.barber_id ?? barberId ?? ""));
  const [amount, setAmount] = useState(current ? toInput(current.amount) : "");
  const [paidFrom, setPaidFrom] = useState<MoneyAccount>(current?.paid_from ?? "cash");
  const [day, setDay] = useState(current?.day ?? businessToday());
  const [note, setNote] = useState(current?.note ?? "");
  const [saving, setSaving] = useState(false);
  const owed = barbers.find((b) => String(b.id) === who)?.balance;

  async function run(work: () => Promise<unknown>, done: string) {
    setSaving(true);
    try {
      await work();
      notifyDataChanged();
      haptic("success");
      toast.success(done);
      onDone();
    } catch (err) {
      haptic("error");
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const body = { barber_id: Number(who), amount, paid_from: paidFrom, day, note: note || null };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => (current ? api(`/api/payouts/${current.id}`, { method: "PUT", body }) : api("/api/payouts", { method: "POST", body })), "Payout saved");
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{current ? "Edit payout" : "Pay barber"}</DialogTitle>
        <DialogDescription>Money given to a barber: commission, salary or an advance. It comes out of the cash drawer or the bank.</DialogDescription>
      </DialogHeader>
      <Field label="Barber" htmlFor="po-barber" hint={owed !== undefined ? `Owed now: ${money(owed)}` : undefined}>
        <SimpleSelect
          id="po-barber"
          label="Barber"
          value={who}
          onChange={setWho}
          placeholder="Choose…"
          options={barbers.map((b) => ({ value: String(b.id), label: b.name }))}
          className="h-11 w-full"
        />
      </Field>
      <Field label="Amount (AED)" htmlFor="po-amount">
        <Input
          id="po-amount"
          inputMode="decimal"
          autoComplete="off"
          required
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          className="num h-12 text-center !text-2xl font-semibold"
        />
      </Field>
      <Field label="Paid from" htmlFor="po-from">
        <SimpleSelect id="po-from" label="Paid from" value={paidFrom} onChange={(v) => setPaidFrom(v as MoneyAccount)} options={ACCOUNT_OPTIONS} className="h-11 w-full" />
      </Field>
      <Field label="Day" htmlFor="po-day">
        <DateInput id="po-day" max={businessToday()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-11" />
      </Field>
      <Field label="Note (optional)" htmlFor="po-note">
        <Input id="po-note" autoComplete="off" placeholder="e.g. October commission" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" />
      </Field>
      <DialogFooter className="gap-2">
        {current && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => run(() => api(`/api/payouts/${current.id}`, { method: "DELETE" }), "Payout removed")}>
            Remove
          </Button>
        )}
        <Button type="submit" disabled={saving || !amount || !who} className="h-11 sm:h-9">
          {saving ? "Saving…" : "Save payout"}
        </Button>
      </DialogFooter>
    </form>
  );
}
