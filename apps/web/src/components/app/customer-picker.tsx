"use client";

import { useState } from "react";
import { ChevronDown, Plus, Search, UserPlus, UserRound, X } from "lucide-react";
import { phoneLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { PhoneField } from "@/components/app/phone-field";
import { useCustomerSuggest, type CustomerHit } from "@/components/app/customer-suggest";
import { haptic } from "@/lib/haptics";

/** Phone for the trigger label: UAE shows the familiar 05x grouping, others +code national. */
function phoneDisplay(cc: string, local: string): string {
  const l = local.replace(/\D/g, "");
  if (!l) return "";
  if (cc === "971") return phoneLabel("0" + l);
  return `+${cc} ${l}`;
}

/**
 * One "Choose customer" control for the sale sheet: a dropdown that shows recent customers,
 * a search to find any saved customer, and a ＋ to add a new one on the way (name + mobile).
 * It drives the sale form's name / cc / phone state.
 */
export function CustomerPicker({
  id,
  name,
  cc,
  local,
  setName,
  setCc,
  setLocal,
  phoneError,
  onPick,
  onClear,
}: {
  id?: string;
  name: string;
  cc: string;
  local: string;
  setName: (v: string) => void;
  setCc: (v: string) => void;
  setLocal: (v: string) => void;
  phoneError: string | null;
  onPick: (c: CustomerHit) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const suggest = useCustomerSuggest(q, open && !adding);
  const hasValue = !!(name.trim() || local.replace(/\D/g, ""));
  const phoneDisp = phoneDisplay(cc, local);

  function reset() {
    setOpen(false);
    setQ("");
    setAdding(false);
  }
  function choose(c: CustomerHit) {
    haptic("select");
    onPick(c);
    reset();
  }
  function startAdd() {
    haptic("select");
    // Prefill from whatever was typed in the search: digits → mobile, text → name.
    const t = q.trim();
    const digits = t.replace(/\D/g, "");
    if (t && digits.length >= 4 && digits.length >= t.replace(/\s/g, "").length - 1) {
      if (!local.replace(/\D/g, "")) setLocal(digits);
    } else if (t && !name.trim()) {
      setName(t);
    }
    setAdding(true);
  }
  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    haptic("select");
    onClear();
  }

  return (
    <div className="relative">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setQ("");
            setAdding(false);
          }
        }}
      >
        <PopoverTrigger
          id={id}
          className={cn(
            "flex h-11 w-full items-center gap-2.5 rounded-lg border border-input bg-transparent px-3 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            !hasValue && "text-muted-foreground"
          )}
        >
          <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {hasValue ? (
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate font-medium text-foreground">{name.trim() || "No name"}</span>
              {phoneDisp && <span className="num shrink-0 text-xs text-muted-foreground">{phoneDisp}</span>}
            </span>
          ) : (
            <span className="flex-1">Choose customer</span>
          )}
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", hasValue && "invisible", open && "rotate-180")} aria-hidden />
        </PopoverTrigger>

        <PopoverContent align="start" sideOffset={6} className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
          {adding ? (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setAdding(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Back">
                  <ChevronDown className="size-4 rotate-90" />
                </button>
                <p className="text-sm font-medium">New customer</p>
              </div>
              <Input autoFocus placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
              <PhoneField id="new-customer-phone" cc={cc} local={local} onChange={(c, l) => { setCc(c); setLocal(l); }} error={phoneError} />
              <button
                type="button"
                onClick={reset}
                disabled={!!phoneError || !(name.trim() || local.replace(/\D/g, ""))}
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                <UserPlus className="size-4" />
                Add customer
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name or mobile"
                  className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  aria-label="Search customers"
                />
              </div>

              <button
                type="button"
                onClick={startAdd}
                className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-muted"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Plus className="size-4" />
                </span>
                {q.trim() ? `Add “${q.trim()}”` : "Add new customer"}
              </button>

              <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
                {!suggest.loaded ? (
                  <div className="flex flex-col gap-1 p-2">
                    {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-md bg-muted skeleton" />)}
                  </div>
                ) : suggest.items.length ? (
                  <>
                    {!suggest.typed && <p className="px-3 pt-1 pb-1 text-xs font-medium text-muted-foreground">Recent customers</p>}
                    {suggest.items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => choose(c)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted"
                      >
                        <UserRound className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name || "No name"}</span>
                        <span className="num shrink-0 text-xs text-muted-foreground">{phoneLabel(c.phone)}</span>
                      </button>
                    ))}
                  </>
                ) : (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">No saved customer found.</p>
                )}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {hasValue && (
        <button
          type="button"
          onClick={clear}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label="Clear customer"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
