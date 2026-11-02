"use client";

import { FeatureGate } from "@/components/app/feature-gate";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { qs } from "@/lib/api";
import { dateTimeLabel, businessToday } from "@/lib/format";
import type { AuditEntry, Paged, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/admin/states";
import { DateInput } from "@/components/app/date-input";
import { SimpleSelect } from "@/components/app/simple-select";
import { actionVerb, AuditDiff, fieldLabel } from "@/components/app/audit-diff";

const TYPES = [
  { value: "all", label: "Everything" },
  { value: "sale", label: "Bills" },
  { value: "expense", label: "Barber expenses" },
  { value: "company_expense", label: "Company expenses" },
  { value: "payout", label: "Barber payouts" },
  { value: "transfer", label: "Money moves" },
  { value: "opening", label: "Opening balances" },
  { value: "user", label: "Staff & users" },
  { value: "service", label: "Services" },
  { value: "settings", label: "Settings" },
  { value: "whatsapp", label: "WhatsApp connection" },
];
const TYPE_NOUN: Record<string, string> = {
  sale: "bill",
  expense: "barber expense",
  company_expense: "company expense",
  payout: "payout",
  transfer: "money move",
  opening: "opening balance",
  user: "user",
  service: "service",
  settings: "settings",
  whatsapp: "WhatsApp connection",
};

/** "edited bill", "reset the password of" … (the ref follows). */
function summary(e: AuditEntry): string {
  if (e.action === "password_reset") return "reset the password of";
  return `${actionVerb(e.action).toLowerCase()} ${TYPE_NOUN[e.entity] ?? e.entity}`;
}

/** Every change anyone made, newest first (admin only). */
function AuditPageInner() {
  const today = businessToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [entity, setEntity] = useState("all");
  const [actor, setActor] = useState("all");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [pages, setPages] = useState(1);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPages(1);
    }, 250);
    return () => clearTimeout(t);
  }, [text]);

  const users = useApi<User[]>("/api/users");
  const people = useMemo(
    () => [{ value: "all", label: "Everyone" }, ...(users.data ?? []).map((u) => ({ value: String(u.id), label: u.name }))],
    [users.data]
  );
  const { data, stale, error, reload } = useApi<Paged<AuditEntry>>(
    `/api/audit${qs({
      from: q ? null : from,
      to: q ? null : to,
      entity: entity === "all" ? null : entity,
      actor_id: actor === "all" ? null : actor,
      q: q || null,
      page_size: 50 * pages,
    })}`
  );
  const shown = data ?? stale;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every bill, expense and setting change: who did it, when, and what changed. Nothing here can be edited.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Bill no. or name" value={text} onChange={(e) => setText(e.target.value)} className="h-9 pl-9" />
        </div>
        {!q && (
          <div className="flex items-center gap-2">
            <DateInput aria-label="From" max={to} value={from} onChange={(e) => e.target.value && (setFrom(e.target.value), setPages(1))} className="h-9 w-36" />
            <span className="text-sm text-muted-foreground">to</span>
            <DateInput aria-label="To" min={from} max={today} value={to} onChange={(e) => e.target.value && (setTo(e.target.value), setPages(1))} className="h-9 w-36" />
          </div>
        )}
        <SimpleSelect label="Type" value={entity} onChange={(v) => (setEntity(v), setPages(1))} options={TYPES} className="h-9 w-44" />
        <SimpleSelect label="Person" value={actor} onChange={(v) => (setActor(v), setPages(1))} options={people} className="h-9 w-40" />
      </div>

      <Card className="gap-0 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">{shown ? `${shown.total} change${shown.total === 1 ? "" : "s"}` : "Changes"}</div>
        {error && !shown ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !shown ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : shown.items.length ? (
          <ul className="divide-y">
            {shown.items.map((e) => (
              <li key={e.id}>
                <button type="button" className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 active:bg-muted" onClick={() => setOpen(e)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium">{e.actor_name}</span> {summary(e)} <span className="font-medium">{e.ref}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dateTimeLabel(e.at)}
                      {e.action === "update" && e.changed.length ? ` · ${e.changed.filter((k) => k !== "barber_id").map(fieldLabel).join(", ")}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No changes for this filter.</p>
        )}
        {shown && shown.items.length < shown.total && (
          <div className="border-t p-3 text-center">
            <Button variant="outline" onClick={() => setPages((p) => p + 1)}>
              Show more
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {open.action === "password_reset" ? "Password reset for" : `${actionVerb(open.action)} ${TYPE_NOUN[open.entity] ?? open.entity}`} {open.ref}
                </DialogTitle>
                <DialogDescription>
                  by {open.actor_name} · {dateTimeLabel(open.at)}
                </DialogDescription>
              </DialogHeader>
              <AuditDiff entry={open} className="text-sm" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Gated by the salon's plan: without "audit_log" the page shows the Upgrade card and makes no API calls. */
export default function AuditPage() {
  return (
    <FeatureGate feature="audit_log">
      <AuditPageInner />
    </FeatureGate>
  );
}
