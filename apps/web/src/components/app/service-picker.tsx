"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { aed } from "@/lib/format";
import type { Service } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { haptic } from "@/lib/haptics";

/** One line of the bill being built. price is fils per unit. */
export interface Line {
  key: string;
  service_id: number | null;
  name: string;
  price: number;
  qty: number;
}

export const linesTotal = (lines: Line[]) => lines.reduce((s, l) => s + l.price * l.qty, 0);

/**
 * The catalogue as tap-to-add chips, grouped by category, plus the chosen lines with − / + and an
 * "Other item" row for anything not on the list. Each line's price starts at the catalogue price and can be
 * changed for this bill only.
 */
/** Which field the number pad types into: a line's price ("price:<key>"), the other item's price, or something outside. */
export type PadTarget = string;
export const priceTarget = (l: Line) => `price:${l.key}`;

export function ServicePicker({
  services,
  lines,
  onChange,
  target,
  onTarget,
  activeText,
  otherPrice,
  setOtherPrice,
}: {
  services: Service[] | null;
  lines: Line[];
  onChange: (l: Line[]) => void;
  target: PadTarget | null;
  onTarget: (t: PadTarget) => void;
  /** What is being typed into the active price (shown instead of the saved price). */
  activeText: string;
  otherPrice: string;
  setOtherPrice: (v: string) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, Service[]>();
    for (const s of services ?? []) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [services]);
  const [tab, setTab] = useState<string | null>(null);
  const current = tab ?? groups[0]?.[0] ?? null;
  const [otherName, setOtherName] = useState("");

  function add(s: Service) {
    const hit = lines.find((l) => l.service_id === s.id);
    if (hit) onChange(lines.map((l) => (l === hit ? { ...l, qty: Math.min(20, l.qty + 1) } : l)));
    else onChange([...lines, { key: `s${s.id}`, service_id: s.id, name: s.name, price: s.price, qty: 1 }]);
  }
  const padField = (active: boolean) =>
    cn(
      "num flex h-8 min-w-16 items-center rounded-md border px-2 text-sm text-foreground",
      active ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-input bg-background"
    );
  function setQty(line: Line, qty: number) {
    onChange(qty <= 0 ? lines.filter((l) => l !== line) : lines.map((l) => (l === line ? { ...l, qty: Math.min(20, qty) } : l)));
  }
  function addOther() {
    const price = Math.round(Number(otherPrice) * 100);
    if (!otherName.trim() || !(price > 0)) return;
    onChange([...lines, { key: `o${Date.now()}`, service_id: null, name: otherName.trim(), price, qty: 1 }]);
    setOtherName("");
    setOtherPrice("");
  }

  if (!services) return <div className="skeleton h-28 rounded-xl" aria-hidden />;

  return (
    <div className="flex flex-col gap-3">
      {groups.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]" role="tablist" aria-label="Service groups">
          {groups.map(([cat]) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={cat === current}
              onClick={() => {
                haptic("tap");
                setTab(cat);
              }}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                cat === current ? "bg-foreground text-background" : "bg-muted text-muted-foreground active:bg-muted/70"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(groups.find(([c]) => c === current)?.[1] ?? []).map((s) => {
          const qty = lines.find((l) => l.service_id === s.id)?.qty ?? 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                haptic("select");
                add(s);
              }}
              className={cn(
                "relative flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors active:scale-[0.98]",
                qty ? "border-primary bg-primary/10" : "border-border active:bg-muted"
              )}
            >
              <span className="text-sm leading-tight font-medium">{s.name}</span>
              <span className="num text-xs text-muted-foreground">{aed(s.price)}</span>
              {qty > 0 && (
                <span className="num absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {qty}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {lines.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl bg-muted/50" aria-label="On this bill">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <div className="num mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      onTarget(priceTarget(l));
                    }}
                    data-pad={priceTarget(l)}
                    className={padField(target === priceTarget(l))}
                    aria-label={`Price for ${l.name}`}
                  >
                    <span className="mr-1 text-xs text-muted-foreground">AED</span>
                    {target === priceTarget(l) ? activeText || <span className="text-muted-foreground">{l.price / 100}</span> : l.price / 100}
                  </button>
                  {l.qty > 1 ? <span>× {l.qty} = {aed(l.price * l.qty)}</span> : null}
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => {
                  haptic("tap");
                  setQty(l, l.qty - 1);
                }} aria-label={`One less ${l.name}`}>
                {l.qty === 1 ? <X /> : <Minus />}
              </Button>
              <span className="num w-5 text-center text-sm font-semibold">{l.qty}</span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => {
                  haptic("tap");
                  setQty(l, l.qty + 1);
                }} aria-label={`One more ${l.name}`}>
                <Plus />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input placeholder="Other item" value={otherName} onChange={(e) => setOtherName(e.target.value)} className="h-10 min-w-0 flex-1" aria-label="Other item name" />
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            onTarget("other");
          }}
          data-pad="other"
          className={cn(padField(target === "other"), "h-10 w-20 shrink-0")}
          aria-label="Other item price"
        >
          {otherPrice || <span className="text-muted-foreground">AED</span>}
        </button>
        <Button type="button" variant="outline" className="h-10" onClick={addOther} disabled={!otherName.trim() || !(Number(otherPrice) > 0)}>
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}
