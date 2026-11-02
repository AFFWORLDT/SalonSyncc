"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { notifyDataChanged, useApi } from "@/hooks/use-api";
import { aed, dayLabel, businessToday, toInput } from "@/lib/format";
import type { CompanyExpense } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/admin/states";
import { DateInput } from "./date-input";
import { Field } from "./field";
import { SimpleSelect } from "./simple-select";
import { ACCOUNT_OPTIONS } from "./ledger-dialogs";
import type { MoneyAccount } from "@/lib/types";

/** The shop's own expenses for a month (rent, electricity, supplies…). They come off the shop profit. */
export function CompanyExpenses({ month, adding, onAddingChange }: { month: string; adding: boolean; onAddingChange: (o: boolean) => void }) {
  const { data, error, reload } = useApi<CompanyExpense[]>(`/api/company-expenses?month=${month}`);
  const [edit, setEdit] = useState<CompanyExpense | null>(null);
  const total = (data ?? []).reduce((a, e) => a + e.amount, 0);

  return (
    <>
      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Company expenses</p>
          {data && <p className="num text-sm font-semibold">{aed(total)}</p>}
        </div>
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data.length ? (
          <ul className="divide-y">
            {data.map((e) => (
              <li key={e.id}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted" onClick={() => setEdit(e)}>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Building2 className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.note}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dayLabel(e.day)} · {e.paid_from === "bank" ? "Bank" : "Cash"}
                    </p>
                  </div>
                  <p className="num text-sm font-semibold">{aed(e.amount)}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No company expenses this month. Add rent, bills or supplies here.</p>
        )}
      </Card>

      <Dialog open={adding || !!edit} onOpenChange={(o) => !o && (onAddingChange(false), setEdit(null))}>
        <DialogContent className="sm:max-w-md">
          {(adding || edit) && (
            <CompanyExpenseForm
              current={edit}
              onDone={() => {
                onAddingChange(false);
                setEdit(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Add company expense" on its own, e.g. from the dashboard's Expense tile. */
export function CompanyExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <CompanyExpenseForm current={null} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function CompanyExpenseForm({ current, onDone }: { current: CompanyExpense | null; onDone: () => void }) {
  const [amount, setAmount] = useState(current ? toInput(current.amount) : "");
  const [note, setNote] = useState(current?.note ?? "");
  const [day, setDay] = useState(current?.day ?? businessToday());
  const [paidFrom, setPaidFrom] = useState<MoneyAccount>(current?.paid_from ?? "cash");
  const [saving, setSaving] = useState(false);

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

  const body = { amount, note: note.trim(), day, paid_from: paidFrom };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => (current ? api(`/api/company-expenses/${current.id}`, { method: "PUT", body }) : api("/api/company-expenses", { method: "POST", body })),
          "Expense saved"
        );
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{current ? "Edit company expense" : "Add company expense"}</DialogTitle>
        <DialogDescription>Shop costs like rent, electricity or supplies. They come off the shop profit.</DialogDescription>
      </DialogHeader>
      <Field label="Amount (AED)" htmlFor="cexp-amount">
        <Input
          id="cexp-amount"
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
      <Field label="What for?" htmlFor="cexp-note">
        <Input id="cexp-note" autoComplete="off" required placeholder="e.g. rent, DEWA bill, towels" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" />
      </Field>
      <Field label="Paid from" htmlFor="cexp-from">
        <SimpleSelect id="cexp-from" label="Paid from" value={paidFrom} onChange={(v) => setPaidFrom(v as MoneyAccount)} options={ACCOUNT_OPTIONS} className="h-11 w-full" />
      </Field>
      <Field label="Day" htmlFor="cexp-day">
        <DateInput id="cexp-day" max={businessToday()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-11" />
      </Field>
      <DialogFooter className="gap-2">
        {current && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => run(() => api(`/api/company-expenses/${current.id}`, { method: "DELETE" }), "Expense removed")}
          >
            Remove
          </Button>
        )}
        <Button type="submit" disabled={saving || !amount || !note.trim()} className="h-11 sm:h-9">
          {saving ? "Saving…" : "Save expense"}
        </Button>
      </DialogFooter>
    </form>
  );
}
