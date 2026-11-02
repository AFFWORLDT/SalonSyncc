"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { notifyDataChanged } from "@/hooks/use-api";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** How far (px) the finger must pull, after resistance, before letting go refreshes. */
const TRIGGER = 70;
const MAX = 110;

/**
 * Swipe down at the top of the page to refresh (phones). The page body never scrolls, only `<main>`
 * does, so the browser's own pull-to-refresh can't fire; this replaces it. Refreshing refetches every
 * open screen's data (no full reload), with a haptic tick when the pull is far enough.
 */
export function PullToRefresh({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const state = useRef({ startY: 0, startX: 0, active: false, armed: false, pull: 0, refreshing: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !matchMedia("(pointer: coarse)").matches) return;
    const s = state.current;

    const onStart = (e: TouchEvent) => {
      if (s.refreshing || e.touches.length !== 1 || el.scrollTop > 0) return;
      s.startY = e.touches[0].clientY;
      s.startX = e.touches[0].clientX;
      s.active = true;
      s.armed = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!s.active) return;
      const dy = e.touches[0].clientY - s.startY;
      const dx = e.touches[0].clientX - s.startX;
      // Only a downward, mostly vertical drag from the very top counts (not table side-scrolls).
      if (dy <= 0 || Math.abs(dx) > dy || el.scrollTop > 0) {
        if (s.pull) setPull((s.pull = 0));
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) s.active = false;
        return;
      }
      e.preventDefault();
      if (!s.pull) setDragging(true);
      s.pull = Math.min(MAX, dy * 0.5);
      setPull(s.pull);
      const armed = s.pull >= TRIGGER;
      if (armed && !s.armed) haptic("select");
      s.armed = armed;
    };
    const onEnd = () => {
      if (!s.active) return;
      s.active = false;
      setDragging(false);
      if (s.armed) {
        s.refreshing = true;
        setRefreshing(true);
        setPull(TRIGGER);
        notifyDataChanged();
        // Spin briefly so the refresh is visible even when the data comes back at once.
        setTimeout(() => {
          s.refreshing = false;
          setRefreshing(false);
          setPull((s.pull = 0));
          haptic("tap");
        }, 700);
      } else {
        setPull((s.pull = 0));
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollRef]);

  const shown = pull > 4 || refreshing;
  return (
    <div
      aria-hidden={!refreshing}
      role="status"
      aria-label={refreshing ? "Refreshing" : undefined}
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center",
        !dragging && "transition-transform duration-200 ease-out"
      )}
      style={{ transform: `translateY(${shown ? pull - 28 : -48}px)` }}
    >
      <div className="flex size-10 items-center justify-center rounded-full border bg-background text-primary shadow-md">
        <RefreshCw
          className={cn("size-5", refreshing && "animate-spin")}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / TRIGGER) }}
        />
      </div>
    </div>
  );
}
