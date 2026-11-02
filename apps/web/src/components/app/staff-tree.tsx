"use client";

import type { ReactNode } from "react";
import type { User } from "@/lib/types";

/** Staff in their levels: the owner, then admins, then barbers (inactive last within each level). */
export function staffLevels(users: User[]): { title: string; users: User[] }[] {
  const by = (role: string) => users.filter((u) => u.role === role).sort((a, b) => Number(b.active) - Number(a.active) || a.sort_order - b.sort_order);
  return [
    { title: "Owner", users: by("owner") },
    { title: "Admins", users: by("admin") },
    { title: "Barbers", users: by("barber") },
  ].filter((l) => l.users.length > 0);
}

/**
 * An org chart of the salon team: one row per level joined by connector lines (pure CSS, no chart library).
 * Each person is drawn by `node`, so the cards keep their own menu (edit, reset password, deactivate).
 */
export function StaffTree({ users, node }: { users: User[]; node: (u: User) => ReactNode }) {
  const levels = staffLevels(users);
  return (
    <div data-testid="staff-tree" className="overflow-x-auto pb-2">
      <div className="mx-auto flex min-w-fit flex-col items-center">
        {levels.map((level, i) => (
          <div key={level.title} className="flex flex-col items-center">
            {i > 0 && <div aria-hidden className="h-6 w-0.5 bg-primary/45" />}
            <p className="font-mono mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{level.title}</p>
            <ul className="relative flex justify-center gap-x-4 px-2 pt-4">
              {level.users.map((u, j) => (
                <li key={u.id} className="relative flex w-80 shrink-0 flex-col items-center">
                  {i > 0 && (
                    <>
                      {/* the shared bar the level hangs from, drawn in pieces between neighbours */}
                      {level.users.length > 1 && (
                        <span aria-hidden className="absolute -top-4 h-0.5 bg-primary/45" style={{ left: j === 0 ? "50%" : "-0.5rem", right: j === level.users.length - 1 ? "50%" : "-0.5rem" }} />
                      )}
                      <span aria-hidden className="absolute -top-4 h-4 w-0.5 bg-primary/45" />
                    </>
                  )}
                  <div className="w-full">{node(u)}</div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
