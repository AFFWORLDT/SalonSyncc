"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { isActive, navFor } from "./nav";

export function AppSidebar({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  /** Called after a link is chosen (closes the mobile sheet). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <div className="flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <div className={cn("flex h-14 shrink-0 items-center gap-3 border-b border-border px-4", collapsed && "justify-center px-0")}>
        <LogoMark size={30} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight tracking-tight">FM Salon</p>
            <p className="font-mono truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Gents salon · Dubai</p>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {navFor(user?.role).map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {collapsed ? (
              <div className="mx-3 mb-1 h-px bg-border" />
            ) : (
              <p className="font-mono px-3 pb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        collapsed && "justify-center px-0",
                        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
