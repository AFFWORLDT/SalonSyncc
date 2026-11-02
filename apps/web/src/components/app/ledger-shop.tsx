"use client";

import { useAuth } from "@/lib/auth-context";

import { useState } from "react";
import { ArrowLeftRight, Download, Scale } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import { api, qs } from "@/lib/api";
import { money, dayLabel, businessToday, num, timeLabel, currencyCode } from "@/lib/format";
import { exportShopLedger } from "@/lib/excel";
import type { Balances, LedgerLine, ShopLedger, Transfer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { DateInput } from "./date-input";
import { MoneyTile } from "./money-tile";
import { SimpleSelect } from "./simple-select";
import { BalancesDialog, TransferDialog } from "./ledger-dialogs";

const VIEW = [
  { value: "all", label: "Cash + Bank" },
  { value: "cash", label: "Cash drawer" },
  { value: "bank", label: "Bank" },
];

/** The shop book: balances now, then every line in a range with a running balance. */
export function LedgerShop() {
  const { has, settings, readOnly } = useAuth();
  const today = businessToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [account, setAccount] = useState("all");
  const balances = useApi<Balances>("/api/ledger/balances");
  const { data, error, reload } = useApi<ShopLedger>(`/api/ledger/shop${qs({ from, to, account })}`);
  const [moving, setMoving] = useState<{ current: Transfer | null } | null>(null);
  const [setting, setSetting] = useState(false);
  const b = balances.data;

  async function openTransfer(line: LedgerLine) {
    try {
      const list = await api<Transfer[]>(`/api/transfers?month=${line.day.slice(0, 7)}`);
      const t = list.find((x) => x.id === line.source_id);
      if (t) setMoving({ current: t });
      else toast.error("This money move was removed");
    } catch {
      toast.error("Couldn't open this money move");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MoneyTile label="Cash drawer" value={b ? b.cash : null} hint="Should be in the drawer now" className="bg-primary/5" />
        <MoneyTile label="Bank" value={b ? b.bank : null} hint="Card payments and deposits" />
        <MoneyTile label="Total" value={b ? b.cash + b.bank : null} tone="success" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setMoving({ current: null })} disabled={readOnly}>
          <ArrowLeftRight />
          Move money
        </Button>
        <Button variant="outline" onClick={() => setSetting(true)} disabled={!b || readOnly}>
          <Scale />
          Set balances
        </Button>
        {has("excel_export") && (
          <Button
            variant="outline"
            disabled={!data}
            onClick={() => data && exportShopLedger(data, settings?.display_name ?? "").catch(() => toast.error("Couldn't create the Excel file"))}
          >
            <Download />
            Excel
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateInput aria-label="From" max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 w-36" />
        <span className="text-sm text-muted-foreground">to</span>
        <DateInput aria-label="To" min={from} max={today} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 w-36" />
        <SimpleSelect label="Account" value={account} onChange={setAccount} options={VIEW} className="h-9 w-40" />
      </div>

      <Card className="gap-0 p-0">
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <>
            <Row
              label="Opening balance"
              sub={dayLabel(data.from)}
              balance={data.account === "all" ? data.opening.cash + data.opening.bank : data.opening[data.account]}
              strong
            />
            {data.lines.length ? (
              <ul className="divide-y border-y">
                {data.lines.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      disabled={l.source !== "transfer" || l.kind === "reversal" || l.reversed}
                      onClick={() => openTransfer(l)}
                      className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-left enabled:hover:bg-muted/40 enabled:active:bg-muted"
                    >
                      <span className={cn("min-w-0", (l.reversed || l.kind === "reversal") && "text-muted-foreground")}>
                        <span className={cn("block truncate text-sm", l.reversed && "line-through")}>{l.memo}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {dayLabel(l.day)} · {timeLabel(l.at)} · {l.account === "bank" ? "Bank" : "Cash"}
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
              <p className="border-y px-4 py-8 text-center text-sm text-muted-foreground">No money moved in these days.</p>
            )}
            <Row
              label="Closing balance"
              sub={dayLabel(data.to)}
              balance={data.account === "all" ? data.closing.cash + data.closing.bank : data.closing[data.account]}
              strong
            />
          </>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        Every line stays forever. An edited bill shows its old line struck through, a reversal, then the new line. Amounts in {currencyCode()}; the last column is
        the running balance.
      </p>

      <TransferDialog open={!!moving} current={moving?.current ?? null} onOpenChange={(o) => !o && setMoving(null)} />
      <BalancesDialog open={setting} balances={b} onOpenChange={setSetting} />
    </div>
  );
}

function Row({ label, sub, balance, strong }: { label: string; sub: string; balance: number; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-3", strong && "bg-muted/40")}>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <p className="num text-sm font-semibold">{money(balance)}</p>
    </div>
  );
}
