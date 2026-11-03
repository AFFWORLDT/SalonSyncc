"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Contact, CornerDownLeft, ListChecks, Megaphone, Plus, ReceiptText, Scissors, Search, Sheet, Wallet, type LucideIcon } from "lucide-react";
import type { Customer, MeResponse, Paged, Sale, Service, User } from "@/lib/types";
import { navFor } from "@/components/admin/nav";
import { useAuth } from "@/lib/auth-context";
import { useSaleSheet } from "@/components/app/sale-sheet";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface PaletteItem {
  id: string;
  group: "Quick actions" | "Pages" | "Customers" | "Bills" | "Services" | "Staff";
  label: string;
  hint?: string;
  icon: LucideIcon;
  /** A path to open, or the "new-sale" action. */
  run: { href: string } | { action: "new-sale" };
  keywords?: string;
}

type MeLike = Pick<MeResponse, "user" | "features">;
const isAdminMe = (me: MeLike) => me.user.role === "owner" || me.user.role === "admin";
const matches = (q: string, ...fields: (string | null | undefined)[]) => {
  const n = q.trim().toLowerCase();
  return !n || fields.some((f) => f?.toLowerCase().includes(n));
};

/** Quick actions the signed-in user may take; filtered by the query. */
export function quickActions(me: MeLike, q: string, readOnly = false): PaletteItem[] {
  const admin = isAdminMe(me);
  const all: (PaletteItem & { ok: boolean })[] = [
    { id: "a:new-sale", group: "Quick actions", label: "New sale", hint: "Ring up a bill", icon: Plus, run: { action: "new-sale" }, keywords: "bill sale add create", ok: !readOnly },
    { id: "a:expense", group: "Quick actions", label: "Add expense", hint: "Expenses", icon: Wallet, run: { href: "/expenses/" }, keywords: "expense spend cost", ok: admin && me.features.includes("expenses") && !readOnly },
    { id: "a:sheet", group: "Quick actions", label: "Today's daily sheet", hint: "Reports", icon: Sheet, run: { href: "/sheet/" }, keywords: "daily sheet report profit commission", ok: admin && me.features.includes("daily_sheet") },
    { id: "a:announce", group: "Quick actions", label: "Send an announcement", hint: "Tell the team", icon: Megaphone, run: { href: "/announcements/" }, keywords: "announcement message team push", ok: admin && me.features.includes("announcements") && !readOnly },
  ];
  return all.filter((a) => a.ok && matches(q, a.label, a.hint, a.keywords)).map((a) => ({ id: a.id, group: a.group, label: a.label, hint: a.hint, icon: a.icon, run: a.run, keywords: a.keywords }));
}

/** Every menu page the user can open (role and plan aware); filtered by the query. */
export function pageItems(me: MeLike, q: string): PaletteItem[] {
  return navFor(me)
    .flatMap((g) => g.items.map((i) => ({ i, g: g.label })))
    .filter(({ i, g }) => matches(q, i.label, g, i.href.replace(/\//g, " ")))
    .map(({ i, g }) => ({ id: `p:${i.href}`, group: "Pages" as const, label: i.label, hint: g, icon: i.icon, run: { href: i.href === "/" ? "/" : `${i.href}/` } }));
}

export function customerItems(rows: Pick<Customer, "id" | "name" | "phone">[]): PaletteItem[] {
  return rows.map((c) => ({ id: `c:${c.id}`, group: "Customers", label: c.name || c.phone || `Customer ${c.id}`, hint: c.name ? (c.phone ?? undefined) : undefined, icon: Contact, run: { href: `/customers/view/?id=${c.id}` } }));
}

export function billItems(rows: Pick<Sale, "id" | "bill_no" | "token" | "customer_label" | "barber_name" | "amount">[]): PaletteItem[] {
  return rows.map((s) => ({ id: `b:${s.id}`, group: "Bills", label: `${s.bill_no} · ${s.customer_label}`, hint: `${s.barber_name} · ${money(s.amount)}`, icon: ReceiptText, run: { href: `/r/?t=${encodeURIComponent(s.token)}` } }));
}

const GROUP_ORDER: PaletteItem["group"][] = ["Quick actions", "Pages", "Customers", "Bills", "Services", "Staff"];

/** ⌘K / Ctrl+K search over pages, actions, customers, bills, services and staff, ElevenLabs-style. */
export function CommandPalette() {
  const { me, readOnly, has } = useAuth();
  const { openNew } = useSaleSheet();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<PaletteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const admin = !!me && isAdminMe(me);

  // ⌘K / Ctrl+K anywhere; "/" too when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ("");
      setRemote([]);
    }
  }, [open]);

  // Search the salon's data as the user types (debounced; each list is small).
  useEffect(() => {
    const term = q.trim();
    if (!open || !me || term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemote([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const enc = encodeURIComponent(term);
      const jobs: Promise<PaletteItem[]>[] = [
        api<Paged<Sale>>(`/api/sales?q=${enc}&page_size=5`).then((r) => billItems(r.items)).catch(() => []),
      ];
      if (admin && has("customers_crm")) jobs.push(api<Paged<Customer>>(`/api/customers?q=${enc}&page_size=5`).then((r) => customerItems(r.items)).catch(() => []));
      if (admin) {
        jobs.push(
          api<Service[]>("/api/services")
            .then((rows) => rows.filter((s) => matches(term, s.name, s.category)).slice(0, 5).map((s): PaletteItem => ({ id: `s:${s.id}`, group: "Services", label: s.name, hint: `${s.category} · ${money(s.price)}`, icon: ListChecks, run: { href: "/services/" } })))
            .catch(() => []),
          api<User[]>("/api/users")
            .then((rows) => rows.filter((u) => matches(term, u.name, u.username, u.phone)).slice(0, 5).map((u): PaletteItem => ({ id: `u:${u.id}`, group: "Staff", label: u.name, hint: `@${u.username} · ${u.role === "barber" ? "Barber" : u.role === "owner" ? "Owner" : "Admin"}`, icon: Scissors, run: { href: "/barbers/" } })))
            .catch(() => [])
        );
      }
      const res = (await Promise.all(jobs)).flat();
      if (live) {
        setRemote(res);
        setLoading(false);
      }
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open, me, admin, has]);

  const items = useMemo(() => {
    if (!me) return [];
    const local = [...quickActions(me, q, readOnly), ...(q.trim() ? pageItems(me, q) : [])];
    const all = [...local, ...remote];
    return GROUP_ORDER.flatMap((g) => all.filter((i) => i.group === g));
  }, [me, q, readOnly, remote]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(0);
  }, [q, remote.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      if ("action" in item.run) openNew();
      else router.push(item.run.href);
    },
    [openNew, router]
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active]);
    }
  };

  if (!me) return null;
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  let lastGroup = "";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="search-trigger"
        aria-label="Search everything"
        className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted/60 md:flex"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search everything…</span>
        <kbd className="pointer-events-none flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium">{mac ? "⌘" : "Ctrl"}<span>K</span></kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted md:hidden">
        <Search className="size-[18px]" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" data-testid="command-palette">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Search pages, actions, customers, bills, services and staff</DialogDescription>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onInputKey}
              placeholder={admin ? "Search customers, bills, pages, staff…" : "Search your bills and pages…"}
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={items[active] ? `pi-${items[active].id}` : undefined}
              className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-hidden />}
            <kbd className="rounded border border-border bg-muted px-1.5 text-[11px] text-muted-foreground">Esc</kbd>
          </div>
          <div ref={listRef} id="palette-list" role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">{loading ? "Searching…" : q.trim().length < 2 ? "Type at least 2 letters" : `Nothing found for “${q.trim()}”`}</p>
            ) : (
              items.map((item, idx) => {
                const head = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                const Icon = item.icon;
                const on = idx === active;
                return (
                  <div key={item.id}>
                    {head && <p className="px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground first:pt-1">{head}</p>}
                    <div
                      id={`pi-${item.id}`}
                      role="option"
                      aria-selected={on}
                      data-index={idx}
                      onMouseMove={() => setActive(idx)}
                      onClick={() => go(item)}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", on && "bg-muted")}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        {item.hint && <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>}
                      </span>
                      {on && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          Open <CornerDownLeft className="size-3" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
