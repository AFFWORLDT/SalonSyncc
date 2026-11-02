"use client";

import { useState } from "react";
import { Pencil, Plus, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useApi } from "@/hooks/use-api";
import { money, dateLabel, businessToday } from "@/lib/format";
import type { MyReport, Paged, Sale } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/admin/states";
import { MoneyTile } from "./money-tile";
import { UserAvatar } from "./user-avatar";
import { ExpenseDialog } from "./expense-dialog";
import { SaleListSkeleton, SaleRow } from "./sale-row";
import { useSaleSheet } from "./sale-sheet";

export function BarberToday() {
  const { user, has, readOnly } = useAuth();
  // Set per barber on the Barbers page. Off: the barber sees the day's expense but only the admin can add or change it.
  const canAddExpense = has("expenses") && !readOnly && (user?.can_add_expense ?? false);
  const { openNew } = useSaleSheet();
  const today = businessToday();
  const report = useApi<MyReport>(`/api/reports/me?month=${today.slice(0, 7)}`);
  const sales = useApi<Paged<Sale>>(`/api/sales?day=${today}&page_size=200`);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const t = report.data?.today ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {user && <UserAvatar name={user.name} url={user.avatar_url} size={52} />}
        <div>
          <h1 className="text-2xl">Hi {user?.name} 👋</h1>
          <p className="text-sm text-muted-foreground">{dateLabel(today)}</p>
        </div>
      </div>

      {report.error && !report.data ? (
        <ErrorState message={report.error} onRetry={report.reload} />
      ) : (
        <>
          <MoneyTile
            big
            label="My sales today"
            value={t ? t.sales : null}
            hint={t ? `${t.count} customer${t.count === 1 ? "" : "s"}` : undefined}
            className="bg-primary/5"
          />
          <MoneyTile label="Sales − expense" value={t ? t.net : null} tone={t && t.net < 0 ? "destructive" : "success"} />

          <Card className="flex-row items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Today&apos;s expense</p>
              <p className="truncate text-xs text-muted-foreground">
                {t
                  ? t.expense
                    ? `${money(t.expense)}${t.expense_note ? ` · ${t.expense_note}` : ""}`
                    : canAddExpense
                      ? "Not added yet — add it before you leave"
                      : "None — the admin adds expenses"
                  : "…"}
              </p>
            </div>
            {canAddExpense && (
              <Button variant={t?.expense ? "outline" : "default"} size="sm" onClick={() => setExpenseOpen(true)} disabled={!t}>
                {t?.expense ? <Pencil /> : <Plus />}
                {t?.expense ? "Edit" : "Add"}
              </Button>
            )}
          </Card>
        </>
      )}

      <Button size="lg" className="h-14 text-base" onClick={() => openNew()}>
        <Plus className="size-5" />
        New sale
      </Button>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Today&apos;s sales</p>
          {sales.data && <p className="num text-sm text-muted-foreground">{money(sales.data.sum ?? 0)}</p>}
        </div>
        {sales.loading && !sales.data ? (
          <SaleListSkeleton rows={4} />
        ) : sales.data?.items.length ? (
          <ul className="flex flex-col divide-y p-1">
            {sales.data.items.map((s) => (
              <SaleRow key={s.id} sale={s} editable />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No sales yet today. Tap “New sale” after each customer.</p>
        )}
      </Card>

      <ExpenseDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        current={t && t.expense ? { amount: t.expense, note: t.expense_note } : null}
      />
    </div>
  );
}
