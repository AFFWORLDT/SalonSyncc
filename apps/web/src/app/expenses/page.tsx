"use client";

import { FeatureGate } from "@/components/app/feature-gate";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { money, dayLabel, businessToday } from "@/lib/format";
import type { Expense, User } from "@/lib/types";
import { qs } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/app/date-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/admin/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyExpenses } from "@/components/app/company-expenses";
import { ExpenseDialog } from "@/components/app/expense-dialog";
import { Field } from "@/components/app/field";
import { MonthPicker } from "@/components/app/month-picker";
import { SimpleSelect } from "@/components/app/simple-select";

function ExpensesPageInner() {
  const [month, setMonth] = useState(businessToday().slice(0, 7));
  const [barber, setBarber] = useState("all");
  const users = useApi<User[]>("/api/users");
  const { data, error, reload } = useApi<Expense[]>(`/api/expenses${qs({ month, barber_id: barber === "all" ? null : barber })}`);
  const [edit, setEdit] = useState<{
    barberId: number;
    barberName: string;
    day: string;
    current: Expense | null;
  } | null>(null);
  const [pick, setPick] = useState(false);
  const [kind, setKind] = useState<"barber" | "company">("barber");
  const [companyAdd, setCompanyAdd] = useState(false);

  const options = useMemo(
    () => [
      { value: "all", label: "All barbers" },
      ...(users.data ?? []).map((u) => ({
        value: String(u.id),
        label: u.name,
      })),
    ],
    [users.data]
  );
  const total = (data ?? []).reduce((a, e) => a + e.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Expenses</h1>
        <Button onClick={() => (kind === "company" ? setCompanyAdd(true) : setPick(true))}>
          <Plus />
          {kind === "company" ? "Add company expense" : "Add expense"}
        </Button>
      </div>
      <Tabs value={kind} onValueChange={(v) => setKind(v as "barber" | "company")}>
        <TabsList>
          <TabsTrigger value="barber">Barbers</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} onChange={setMonth} />
        {kind === "barber" && <SimpleSelect label="Barber" value={barber} onChange={setBarber} options={options} className="h-9 w-44" />}
      </div>

      {kind === "company" ? (
        <CompanyExpenses month={month} adding={companyAdd} onAddingChange={setCompanyAdd} />
      ) : (
        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Expenses</p>
            {data && <p className="num text-sm font-semibold">{money(total)}</p>}
          </div>
          {error && !data ? (
            <ErrorState message={error} onRetry={reload} />
          ) : !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : data.length ? (
            <ul className="divide-y">
              {data.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
                    onClick={() =>
                      setEdit({
                        barberId: e.barber_id,
                        barberName: e.barber_name,
                        day: e.day,
                        current: e,
                      })
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.barber_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {dayLabel(e.day)}
                        {e.note ? ` · ${e.note}` : ""}
                      </p>
                    </div>
                    <p className="num text-sm font-semibold">{money(e.amount)}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No expenses this month.</p>
          )}
        </Card>
      )}

      <PickDialog
        open={pick}
        onOpenChange={setPick}
        users={users.data ?? []}
        onPick={(u, day) => {
          setPick(false);
          const current = (data ?? []).find((e) => e.barber_id === u.id && e.day === day) ?? null;
          setEdit({ barberId: u.id, barberName: u.name, day, current });
        }}
      />
      <ExpenseDialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        current={edit?.current ? { amount: edit.current.amount, note: edit.current.note } : null}
        day={edit?.day}
        barberId={edit?.barberId}
        barberName={edit?.barberName}
      />
    </div>
  );
}

function PickDialog({
  open,
  onOpenChange,
  users,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: User[];
  onPick: (u: User, day: string) => void;
}) {
  const active = users.filter((u) => u.active);
  const [id, setId] = useState("");
  const [day, setDay] = useState(businessToday());
  const user = active.find((u) => String(u.id) === id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add expense for</DialogTitle>
          <DialogDescription>Pick the barber and the day.</DialogDescription>
        </DialogHeader>
        <Field label="Barber" htmlFor="pick-barber">
          <SimpleSelect
            id="pick-barber"
            label="Barber"
            value={id}
            onChange={setId}
            placeholder="Choose…"
            options={active.map((u) => ({
              value: String(u.id),
              label: u.name,
            }))}
            className="h-11 w-full"
          />
        </Field>
        <Field label="Day" htmlFor="pick-day">
          <DateInput id="pick-day" max={businessToday()} value={day} onChange={(e) => setDay(e.target.value)} className="h-11" />
        </Field>
        <DialogFooter>
          <Button disabled={!user || !day} onClick={() => user && onPick(user, day)}>
            Next
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Gated by the salon's plan: without "expenses" the page shows the Upgrade card and makes no API calls. */
export default function ExpensesPage() {
  return (
    <FeatureGate feature="expenses">
      <ExpensesPageInner />
    </FeatureGate>
  );
}
