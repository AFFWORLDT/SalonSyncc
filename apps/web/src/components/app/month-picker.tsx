"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessToday, monthLabel, shiftMonth } from "@/lib/format";

/** ‹ October 2026 › — can't go past the current month. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = businessToday().slice(0, 7);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        <ChevronLeft />
      </Button>
      <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(month)}</span>
      <Button variant="outline" size="icon" disabled={month >= current} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
        <ChevronRight />
      </Button>
    </div>
  );
}
