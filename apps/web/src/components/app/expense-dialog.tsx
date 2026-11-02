"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { notifyDataChanged } from "@/hooks/use-api";
import { dayLabel, toInput } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "./field";
import { haptic } from "@/lib/haptics";

/** Today's expense (one per barber per day). Admin can pass `day` and `barberId` to edit any. */
export function ExpenseDialog({
  open,
  onOpenChange,
  current,
  day,
  barberId,
  barberName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: { amount: number; note: string | null } | null;
  day?: string;
  barberId?: number;
  barberName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <ExpenseForm current={current} day={day} barberId={barberId} barberName={barberName} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  current,
  day,
  barberId,
  barberName,
  onDone,
}: {
  current: { amount: number; note: string | null } | null;
  day?: string;
  barberId?: number;
  barberName?: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(current ? toInput(current.amount) : "");
  const [note, setNote] = useState(current?.note ?? "");
  const [saving, setSaving] = useState(false);

  async function save(value: string) {
    setSaving(true);
    try {
      await api("/api/expenses", { method: "PUT", body: { amount: value, note: note || null, day, barber_id: barberId } });
      notifyDataChanged();
      haptic("success");
      toast.success(value === "0" ? "Expense removed" : "Expense saved");
      onDone();
    } catch (err) {
      haptic("error");
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(amount);
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{current ? "Edit expense" : "Add expense"}</DialogTitle>
        <DialogDescription>
          {barberName ? `${barberName} · ` : ""}
          {day ? dayLabel(day) : "Today"} — one entry per day. Enter the total.
        </DialogDescription>
      </DialogHeader>
      <Field label="Amount (AED)" htmlFor="exp-amount">
        <Input
          id="exp-amount"
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
      <Field label="What for? (optional)" htmlFor="exp-note">
        <Input id="exp-note" autoComplete="off" placeholder="e.g. food, transport" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" />
      </Field>
      <DialogFooter className="gap-2">
        {current && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => save("0")}>
            Remove
          </Button>
        )}
        <Button type="submit" disabled={saving || !amount} className="h-11 sm:h-9">
          {saving ? "Saving…" : "Save expense"}
        </Button>
      </DialogFooter>
    </form>
  );
}
