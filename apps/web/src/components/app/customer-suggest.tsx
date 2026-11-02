"use client";

import { useEffect, useState } from "react";
import { UserPlus, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { phoneLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CustomerHit {
  id: number;
  name: string | null;
  phone: string;
}

/**
 * Saved customers matching what is typed in the sale's name or mobile field.
 * Picking one fills both fields; with no match it says the customer will be saved with the sale.
 * Arrow keys / Enter / Escape are handled by the focused field (see sale-sheet `lookupKeys`).
 */
export function useCustomerSuggest(query: string, open: boolean) {
  const q = query.trim();
  const [recent, setRecent] = useState<CustomerHit[] | null>(null);
  const [hits, setHits] = useState<{ q: string; items: CustomerHit[] }>({ q: "", items: [] });
  const [active, setActive] = useState(-1);
  // From 3 characters the server searches every customer; below that we filter the recent list.
  const search = open && q.length >= 3;

  // Recent customers, fetched once when the field is first focused.
  useEffect(() => {
    if (!open || recent) return;
    api<{ items: CustomerHit[] }>("/api/customers?page_size=8")
      .then((d) => setRecent(d.items.slice(0, 8)))
      .catch(() => setRecent([]));
  }, [open, recent]);

  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => {
      api<{ items: CustomerHit[] }>(`/api/customers?q=${encodeURIComponent(q)}&page_size=6`)
        .then((d) => setHits({ q, items: d.items.slice(0, 6) }))
        .catch(() => setHits({ q, items: [] }));
    }, 200);
    return () => clearTimeout(t);
  }, [q, search]);

  const lower = q.toLowerCase();
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  const items = !open
    ? []
    : search
      ? hits.q === q
        ? hits.items
        : []
      : (recent ?? []).filter((c) => !q || (c.name ?? "").toLowerCase().includes(lower) || (!!digits && c.phone.includes(digits))).slice(0, 6);
  const loaded = open && (search ? hits.q === q : recent !== null);

  // A new list starts with nothing highlighted.
  const key = `${q}|${items.map((c) => c.id).join(",")}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setActive(-1);
  }
  return { items, loaded, active, setActive, typed: q.length > 0 };
}

export function CustomerSuggest({
  items,
  loaded,
  active,
  hasPhone,
  typed,
  onPick,
}: {
  items: CustomerHit[];
  loaded: boolean;
  typed: boolean;
  active: number;
  hasPhone: boolean;
  onPick: (c: CustomerHit) => void;
}) {
  if (!loaded || (!typed && !items.length)) return null;
  return (
    <div role="listbox" aria-label="Saved customers" className="-mt-2 overflow-hidden rounded-lg border bg-popover shadow-md">
      {!typed && <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">Recent customers</p>}
      {items.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected={i === active}
          // Keep focus in the field so the list doesn't close before the tap lands.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
          className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted", i === active && "bg-muted")}
        >
          <UserRound className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name || "No name"}</span>
          <span className="num shrink-0 text-xs text-muted-foreground">{phoneLabel(c.phone)}</span>
        </button>
      ))}
      {!items.length && (
        <p className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground">
          <UserPlus className="size-4 shrink-0" />
          {hasPhone ? "New customer · saved with this sale" : "New customer · add a mobile to save them"}
        </p>
      )}
    </div>
  );
}
