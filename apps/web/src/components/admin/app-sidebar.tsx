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
  const { me, settings } = useAuth();
  return (
    <div className="flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <div className={cn("flex h-16 shrink-0 items-center gap-3 border-b border-border px-4", collapsed && "justify-center px-0")}>
        <LogoMark size={30} src={settings?.logo_url} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold leading-tight tracking-tight">{settings?.display_name}</p>
            {settings?.tagline && <p className="font-mono truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{settings.tagline}</p>}
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {navFor(me).map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {collapsed ? (
              <div className="mx-3 mb-1 h-px bg-border" />
            ) : (
              <p className="px-3 pb-1.5 text-xs font-semibold text-muted-foreground">{group.label}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      data-tour={`nav-${item.href.replace(/\//g, "") || "home"}`}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-semibold transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-primary bg-linear-to-r from-primary to-[color-mix(in_oklab,var(--primary),black_30%)] text-primary-foreground shadow-[0_6px_14px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
                          : "text-foreground/75 hover:bg-primary/8 hover:text-foreground active:bg-muted"
                      )}
                    >
                      <Icon className="size-[18px] shrink-0" />
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
