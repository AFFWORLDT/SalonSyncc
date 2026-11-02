"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import type { NotificationFeed } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Short relative time: "now", "5m", "3h", "2d", else a date. */
function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Top-bar bell: unread count, a list of recent notifications, and mark-all-read on open. */
export function NotificationBell() {
  const { data: feed, setData } = useApi<NotificationFeed>("/api/notifications");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // No polling (Workers free plan): the feed loads with the page and again on ss:data-changed (useApi).

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && (feed?.unread ?? 0) > 0) {
      const t = Date.now();
      setData((d) => (d ? { ...d, unread: 0, items: d.items.map((n) => (n.read_at ? n : { ...n, read_at: t })) } : d));
      try {
        await api("/api/notifications/read", { method: "POST", redirectOn401: false });
      } catch {
        /* optimistic — the next poll corrects it if the write failed */
      }
    }
  }

  const unread = feed?.unread ?? 0;
  const items = feed?.items ?? [];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} />}
      >
        <span className="relative inline-flex">
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-3.5 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && <span className="text-xs text-muted-foreground">{unread} new</span>}
        </div>

        <div className="max-h-[22rem] overflow-y-auto overscroll-contain">
          {items.length ? (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (n.path) router.push(n.path);
                }}
                className={cn(
                  "flex w-full items-start gap-3 border-b px-3.5 py-3 text-left last:border-b-0 hover:bg-muted",
                  !n.read_at && "bg-primary/[0.04]"
                )}
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Megaphone className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{ago(n.created_at)}</span>
                  </span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                </span>
                {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
              </button>
            ))
          ) : (
            <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
              <Bell className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">You’re all caught up</p>
              <p className="text-xs text-muted-foreground">New bills and announcements show up here.</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
