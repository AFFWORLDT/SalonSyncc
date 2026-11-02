"use client";

import { useSyncExternalStore } from "react";

// One coarse shared clock (30s) so many <RelativeTime> instances stay cheap and
// no impure Date.now() read happens during render.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let tick = 0;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    // Labels may be stale after a remount: refresh before the first tick.
    tick = Date.now();
    timer = setInterval(() => {
      tick = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// The snapshot must be stable between ticks; refresh it when first read.
function getSnapshot() {
  if (tick === 0) tick = Date.now();
  return tick;
}

const getServerSnapshot = () => 0;

export function formatRelative(then: number, now: number): string {
  const diff = Math.round((now - then) / 1000);
  if (diff < 45) return "just now";
  const m = Math.round(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "5m ago" text for an epoch-ms timestamp; renders empty on the server, full date on hover. */
export function RelativeTime({ ms, className }: { ms: number | null | undefined; className?: string }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!ms) return <span className={className}>-</span>;
  const then = ms;
  return (
    <time dateTime={new Date(then).toISOString()} title={new Date(then).toLocaleString()} className={className} suppressHydrationWarning>
      {now === 0 ? "" : formatRelative(then, now)}
    </time>
  );
}
