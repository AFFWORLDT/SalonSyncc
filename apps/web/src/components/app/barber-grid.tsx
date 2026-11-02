"use client";

import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { UserAvatar } from "./user-avatar";

/** Step 1 of a sale (admin): every active barber as a big photo tile; one tap picks and moves on. */
export function BarberGrid({ users, value, onPick }: { users: User[] | null; value: string; onPick: (id: string) => void }) {
  if (!users)
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl bg-muted" />
        ))}
      </div>
    );
  const list = users.filter((u) => u.active || String(u.id) === value);
  return (
    <div role="radiogroup" aria-label="Barber" className="grid grid-cols-3 gap-3">
      {list.map((u) => {
        const on = String(u.id) === value;
        return (
          <button
            key={u.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              haptic("select");
              onPick(String(u.id));
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-sm font-medium transition-colors active:scale-[0.97]",
              on ? "border-primary bg-primary/10 text-primary" : "border-border active:bg-muted"
            )}
          >
            <UserAvatar name={u.name} url={u.avatar_url} size={56} className={cn("ring-2 ring-offset-2 ring-offset-popover", on ? "ring-primary" : "ring-transparent")} />
            <span className="w-full truncate text-center">{u.role === "admin" ? `${u.name} ★` : u.name}</span>
          </button>
        );
      })}
    </div>
  );
}
