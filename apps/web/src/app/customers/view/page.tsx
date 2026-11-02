"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Phone, Scissors, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { notifyDataChanged, useApi } from "@/hooks/use-api";
import { api, errorMessage, qs } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { aed, businessDay, dateLabel, dateTimeLabel, phoneLabel, whatsappDigits } from "@/lib/format";
import type { CustomerDetail, Paged, Sale } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { MoneyTile } from "@/components/app/money-tile";
import { SaleListSkeleton, SaleRow } from "@/components/app/sale-row";
import { WhatsAppIcon } from "@/components/app/whatsapp-icon";

const PAGE = 30;

/** One customer's profile and every visit (/customers/view/?id=…). Static export, so the id is a query param. */
export default function CustomerPage() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);
  if (id === null) return <ProfileSkeleton />;
  if (!/^\d+$/.test(id)) return <ErrorState message="This customer link is incomplete." />;
  return <Profile id={id} />;
}

function Profile({ id }: { id: string }) {
  const [pages, setPages] = useState(1);
  const detail = useApi<CustomerDetail>(`/api/customers/${id}`);
  const visits = useApi<Paged<Sale>>(`/api/sales${qs({ customer_id: id, page_size: PAGE * pages })}`);
  const c = detail.data;
  const list = visits.data ?? visits.stale;

  if (detail.error && !c) return <ErrorState message={detail.error} onRetry={detail.reload} />;
  if (!c) return <ProfileSkeleton />;
  const since = c.first_visit_at ? dateLabel(businessDay(c.first_visit_at)) : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/customers/" className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>

      <Card className="flex-row items-center gap-4 p-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRound className="size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl">{c.name || "No name"}</h1>
          <p className="num text-sm text-muted-foreground">
            {c.phone ? phoneLabel(c.phone) : "No mobile"}
            {since ? ` · customer since ${since}` : ""}
          </p>
        </div>
        {c.phone && (
          <div className="flex shrink-0 gap-1">
            <a href={`tel:${c.phone}`} aria-label={`Call ${c.name ?? c.phone}`} className="flex size-10 items-center justify-center rounded-full border text-muted-foreground active:bg-muted">
              <Phone className="size-5" />
            </a>
            <a
              href={`https://wa.me/${whatsappDigits(c.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp ${c.name ?? c.phone}`}
              className="flex size-10 items-center justify-center rounded-full active:bg-muted"
            >
              <WhatsAppIcon className="size-8" />
            </a>
          </div>
        )}
      </Card>

      {c.phone && (
        <Card className="flex-row items-center justify-between gap-4 p-4">
          <div>
            <Label htmlFor="c-wa" className="text-sm font-medium">
              WhatsApp reminders and announcements
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Turn off if the customer asked not to get messages. Bills still go out.</p>
          </div>
          <Switch
            id="c-wa"
            checked={!c.wa_opt_out}
            onCheckedChange={async (on) => {
              try {
                await api(`/api/customers/${c.id}/whatsapp`, { method: "PUT", body: { opt_out: !on } });
                detail.reload();
                notifyDataChanged();
                toast.success(on ? "WhatsApp messages on" : "No more WhatsApp reminders or announcements");
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="gap-1.5 p-4">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">Visits</p>
          <p className="num text-xl leading-none font-semibold sm:text-2xl">{c.visits}</p>
          <p className="text-xs text-muted-foreground">
            {c.cash_visits} cash · {c.card_visits} card
          </p>
        </Card>
        <MoneyTile label="Total spent" value={c.spent} tone="success" />
        <MoneyTile label="Average bill" value={c.avg_bill} />
        <Card className="gap-1.5 p-4">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">Last visit</p>
          <p className="text-base leading-tight font-semibold">{c.last_visit_at ? dateTimeLabel(c.last_visit_at) : "—"}</p>
          {c.last_visit_at && <p className="text-xs text-muted-foreground">{daysAgo(c.last_visit_at)}</p>}
        </Card>
      </div>

      {(c.barbers.length > 0 || c.services.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Chips icon={<Scissors className="size-4" />} title="Barbers" items={c.barbers.map((b) => ({ key: String(b.id), label: b.name, count: b.visits }))} />
          <Chips icon={<Sparkles className="size-4" />} title="Favourite services" items={c.services.map((s) => ({ key: s.name, label: s.name, count: s.qty }))} />
        </div>
      )}

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Visit history</p>
          {list && <p className="num text-sm text-muted-foreground">{list.total} bills · {aed(list.sum ?? 0)}</p>}
        </div>
        {visits.error && !list ? (
          <ErrorState message={visits.error} onRetry={visits.reload} />
        ) : !list ? (
          <SaleListSkeleton rows={6} />
        ) : list.items.length ? (
          <ul className="flex flex-col divide-y p-1">
            {list.items.map((s) => (
              <SaleRow key={s.id} sale={s} editable showBarber showDay />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No visits yet.</p>
        )}
        {list && list.items.length < list.total && (
          <div className="border-t p-3 text-center">
            <Button variant="outline" onClick={() => setPages((p) => p + 1)}>
              Show more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function daysAgo(ms: number) {
  const days = Math.round((Date.parse(businessDay(Date.now())) - Date.parse(businessDay(ms))) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function Chips({ icon, title, items }: { icon: React.ReactNode; title: string; items: { key: string; label: string; count: number }[] }) {
  return (
    <Card className="gap-3 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </p>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((i) => (
            <span key={i.key} className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-sm">
              {i.label}
              <span className="num text-xs text-muted-foreground">×{i.count}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
