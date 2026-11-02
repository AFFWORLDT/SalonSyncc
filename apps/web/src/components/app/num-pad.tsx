"use client";

import { Delete } from "lucide-react";
import type { PadKey } from "@/lib/numpad";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const ROWS: PadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "00"],
];

/**
 * The till's number pad: always on screen while a bill is made, so the phone keyboard never opens for
 * numbers and the screen never jumps. Every key vibrates. `action` is the big key on the right (Save).
 * Keys never take focus, so a field being typed with the phone keyboard keeps it.
 */
export function NumPad({ onKey, dotDisabled, action }: { onKey: (k: PadKey) => void; dotDisabled?: boolean; action: React.ReactNode }) {
  const press = (k: PadKey) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault(); // keep focus where it is
      haptic("tap");
    },
    onClick: () => onKey(k),
  });
  const key = "num flex h-13 items-center justify-center rounded-xl bg-muted text-2xl font-semibold select-none active:scale-[0.97] active:bg-muted/60 disabled:opacity-30";
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Number pad">
      {ROWS.map((row, r) => (
        <div key={r} className="contents">
          {row.map((k) => (
            <button key={k} type="button" className={key} disabled={k === "." && dotDisabled} aria-label={k === "." ? "Point" : k} {...press(k)}>
              {k}
            </button>
          ))}
          {r === 0 && (
            <button type="button" className={cn(key, "text-muted-foreground")} aria-label="Backspace" {...press("⌫")}>
              <Delete className="size-6" />
            </button>
          )}
          {r === 1 && (
            <button type="button" className={cn(key, "text-lg text-muted-foreground")} aria-label="Clear" {...press("C")}>
              C
            </button>
          )}
          {r === 2 && <div className="row-span-2 flex">{action}</div>}
        </div>
      ))}
    </div>
  );
}
