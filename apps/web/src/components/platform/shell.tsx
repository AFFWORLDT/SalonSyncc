"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, Building2, ClipboardList, Hourglass, LayoutDashboard, LogOut, Menu, ShieldCheck, Smartphone, Users } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { papi, type PlatformMe } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { createContext, useContext } from "react";

const NAV = [
  { href: "/platform/", label: "Overview", icon: LayoutDashboard },
  { href: "/platform/salons/", label: "Salons", icon: Building2 },
  { href: "/platform/expired/", label: "Expired queue", icon: Hourglass },
  { href: "/platform/plans/", label: "Plans", icon: ClipboardList },
  { href: "/platform/bundles/", label: "Bundles", icon: Boxes },
  { href: "/platform/app/", label: "App", icon: Smartphone },
  { href: "/platform/users/", label: "Team", icon: Users },
  { href: "/platform/audit/", label: "Audit", icon: ShieldCheck },
];

const MeContext = createContext<PlatformMe | null>(null);
/** Whether the signed-in super admin can change things (owner); true outside the shell (tests). The server enforces it. */
export function useCanEdit(): boolean {
  const me = useContext(MeContext);
  return !me || me.role === "owner";
}

/** The signed-in super admin (inside the panel shell). */
export function usePlatformMe(): PlatformMe {
  const me = useContext(MeContext);
  if (!me) throw new Error("usePlatformMe outside PlatformShell");
  return me;
}

function isActive(pathname: string, href: string) {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return href === "/platform/" ? p === href : p.startsWith(href) || (href === "/platform/salons/" && p.startsWith("/platform/salons"));
}

/** The super admin panel's frame: sidebar, top bar and the signed-in check. The login page renders bare. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname.startsWith("/platform/login");
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (bare) return;
    papi<PlatformMe>("/me").then(setMe).catch(() => {});
  }, [bare]);
  useEffect(() => {
    document.title = "Atlantic Portal";
  }, []);
  if (bare) return <div className="h-full overflow-y-auto">{children}</div>;
  if (!me)
    return (
      <div className="flex flex-col gap-3 p-6" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
            isActive(pathname, href) && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <MeContext.Provider value={me}>
      <div className="flex h-full overflow-hidden text-foreground">
        <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
          <div className="flex h-14 items-center gap-3 border-b border-border px-4">
            <LogoMark size={30} />
            <div>
              <p className="text-base leading-tight font-semibold">Atlantic Portal</p>
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Super admin</p>
            </div>
          </div>
          {nav}
        </aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-y-0 left-0 w-64 bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex h-14 items-center gap-3 border-b border-border px-4">
                <LogoMark size={28} />
                <p className="font-semibold">Atlantic Portal</p>
              </div>
              {nav}
            </div>
          </div>
        )}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/70 px-4 backdrop-blur">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <div className="flex-1" />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {me.email} · {me.role === "owner" ? "Owner" : "Support"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api("/api/platform/logout", { method: "POST", redirectOn401: false }).catch(() => {});
                window.location.href = "/platform/login/";
              }}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </MeContext.Provider>
  );
}
