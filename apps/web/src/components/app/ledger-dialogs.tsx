"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { notifyDataChanged } from "@/hooks/use-api";
import { money, businessToday, toInput } from "@/lib/format";
import type { Balances, MoneyAccount, Transfer } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "./date-input";
import { Field } from "./field";
import { SimpleSelect } from "./simple-select";

export const ACCOUNT_OPTIONS = [
  { value: "cash", label: "Cash drawer" },
  { value: "bank", label: "Bank" },
];

/** Runs a save: toast, haptic and refresh on success; the error as a toast otherwise. */
async function run(setSaving: (b: boolean) => void, work: () => Promise<unknown>, done: string, onDone: () => void) {
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

/** Move money between the cash drawer and the bank (e.g. depositing the day's cash). */
export function TransferDialog({ open, current, onOpenChange }: { open: boolean; current: Transfer | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <TransferForm current={current} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function TransferForm({ current, onDone }: { current: Transfer | null; onDone: () => void }) {
  const [amount, setAmount] = useState(current ? toInput(current.amount) : "");
  const [from, setFrom] = useState<MoneyAccount>(current?.from_account ?? "cash");
  const [day, setDay] = useState(current?.day ?? businessToday());
  const [note, setNote] = useState(current?.note ?? "");
  const [saving, setSaving] = useState(false);
  const to: MoneyAccount = from === "cash" ? "bank" : "cash";
  const body = { amount, from_account: from, to_account: to, day, note: note || null };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          setSaving,
          () => (current ? api(`/api/transfers/${current.id}`, { method: "PUT", body }) : api("/api/transfers", { method: "POST", body })),
          "Money moved",
          onDone
        );
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{current ? "Edit money move" : "Move money"}</DialogTitle>
        <DialogDescription>For example, depositing drawer cash into the bank. The shop total stays the same.</DialogDescription>
      </DialogHeader>
      <Field label="Amount (AED)" htmlFor="tr-amount">
        <Input
          id="tr-amount"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          required
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          className="num h-12 text-center !text-2xl font-semibold"
        />
      </Field>
      <Field label="From" htmlFor="tr-from" hint={`Goes into the ${to === "cash" ? "cash drawer" : "bank"}`}>
        <SimpleSelect id="tr-from" label="From" value={from} onChange={(v) => setFrom(v as MoneyAccount)} options={ACCOUNT_OPTIONS} className="h-11 w-full" />
      </Field>
      <Field label="Day" htmlFor="tr-day">
        <DateInput id="tr-day" max={businessToday()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-11" />
      </Field>
      <Field label="Note (optional)" htmlFor="tr-note">
        <Input id="tr-note" autoComplete="off" placeholder="e.g. deposit at ENBD" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" />
      </Field>
      <DialogFooter className="gap-2">
        {current && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => run(setSaving, () => api(`/api/transfers/${current.id}`, { method: "DELETE" }), "Money move removed", onDone)}>
            Remove
          </Button>
        )}
        <Button type="submit" disabled={saving || !amount} className="h-11 sm:h-9">
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Set the shop balances to what was counted. The app posts the difference as a "Balance set" line. */
export function BalancesDialog({ open, balances, onOpenChange }: { open: boolean; balances: Balances | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && balances && <BalancesForm balances={balances} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function BalancesForm({ balances, onDone }: { balances: Balances; onDone: () => void }) {
  const [cash, setCash] = useState(toInput(balances.cash));
  const [bank, setBank] = useState(toInput(balances.bank));
  const [saving, setSaving] = useState(false);
  const clean = (v: string) => v.replace(/[^\d.-]/g, "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(setSaving, () => api("/api/ledger/balances", { method: "PUT", body: { cash, bank } }), "Balances set", onDone);
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Set balances</DialogTitle>
        <DialogDescription>
          Count the cash in the drawer and check the bank, then enter what is really there. The difference is recorded as a &quot;Balance set&quot; line.
        </DialogDescription>
      </DialogHeader>
      <Field label="Cash drawer (AED)" htmlFor="bal-cash" hint={`The ledger says ${money(balances.cash)}`}>
        <Input id="bal-cash" inputMode="decimal" autoComplete="off" required value={cash} onChange={(e) => setCash(clean(e.target.value))} className="num h-11" />
      </Field>
      <Field label="Bank (AED)" htmlFor="bal-bank" hint={`The ledger says ${money(balances.bank)}`}>
        <Input id="bal-bank" inputMode="decimal" autoComplete="off" required value={bank} onChange={(e) => setBank(clean(e.target.value))} className="num h-11" />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={saving || cash === "" || bank === ""} className="h-11 sm:h-9">
          {saving ? "Saving…" : "Set balances"}
        </Button>
      </DialogFooter>
    </form>
  );
}
