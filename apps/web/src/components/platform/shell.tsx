"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Bell,
  Boxes,
  Building2,
  ClipboardList,
  Hourglass,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  PanelLeft,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  UserRound,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppTheme } from "@/components/theme/theme-provider";
import { api } from "@/lib/api";
import { papi, type PlatformMe } from "@/lib/platform";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };
/** The deHertz admin's layout, for salons: grouped like Overview / People / Activity / Commerce / Engagement / Settings. */
export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ href: "/platform/", label: "Overview", icon: LayoutDashboard }] },
  {
    title: "Salons",
    items: [
      { href: "/platform/salons/", label: "Salons", icon: Building2 },
      { href: "/platform/people/", label: "People", icon: UserRound },
      { href: "/platform/expired/", label: "Expired queue", icon: Hourglass },
    ],
  },
  {
    title: "Activity",
    items: [
      { href: "/platform/usage/", label: "App usage", icon: BarChart3 },
      { href: "/platform/ai/", label: "AI connect", icon: Sparkles },
      { href: "/platform/whatsapp/", label: "WhatsApp", icon: MessageCircle },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/platform/plans/", label: "Plans", icon: ClipboardList },
      { href: "/platform/bundles/", label: "Bundles", icon: Boxes },
    ],
  },
  { title: "Engagement", items: [{ href: "/platform/notifications/", label: "Notifications", icon: Bell }] },
  {
    title: "Settings",
    items: [
      { href: "/platform/app/", label: "App versions", icon: Smartphone },
      { href: "/platform/users/", label: "Team", icon: Users },
      { href: "/platform/audit/", label: "Audit", icon: ShieldCheck },
      { href: "/platform/settings/", label: "Appearance", icon: Settings },
    ],
  },
];
const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));

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
  return href === "/platform/" ? p === href : p.startsWith(href);
}

const COLLAPSE_KEY = "atlantic_sidebar_collapsed";

/** The super admin panel's frame: grouped sidebar (collapsible), top bar with ⌘K search and light/dark, sign-in check. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname.startsWith("/platform/login");
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searching, setSearching] = useState(false);
  const { resolved, setAppearance } = useAppTheme();

  useEffect(() => {
    if (bare) return;
    papi<PlatformMe>("/me").then(setMe).catch(() => {});
  }, [bare]);
  useEffect(() => {
    document.title = "Atlantic Portal";
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (bare) return <div className="h-full overflow-y-auto">{children}</div>;
  if (!me)
    return (
      <div className="flex flex-col gap-3 p-6" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };
  const title = [...ALL_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(pathname, i.href))?.label ?? "Atlantic Portal";

  const nav = (mini: boolean) => (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
      {NAV_GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          {!mini && <p className="px-3 pb-1 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">{g.title}</p>}
          {g.items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={mini ? label : undefined}
              aria-label={mini ? label : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
                mini && "justify-center px-0",
                isActive(pathname, href) && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!mini && label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const brand = (mini: boolean) => (
    <div className={cn("flex h-14 shrink-0 items-center gap-3 border-b border-border px-4", mini && "justify-center px-0")}>
      <LogoMark size={30} />
      {!mini && (
        <div>
          <p className="text-base leading-tight font-semibold">Atlantic Portal</p>
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Super admin</p>
        </div>
      )}
    </div>
  );

  return (
    <MeContext.Provider value={me}>
      <div className="flex h-full overflow-hidden text-foreground">
        <aside className={cn("hidden h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex", collapsed ? "w-16" : "w-60")}>
          {brand(collapsed)}
          {nav(collapsed)}
        </aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
              {brand(false)}
              {nav(false)}
            </div>
          </div>
        )}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/70 px-3 backdrop-blur sm:px-4">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleCollapsed}>
              <PanelLeft className="size-4" />
            </Button>
            <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground md:flex"
            >
              <Search className="size-4" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border border-border px-1.5 font-mono text-[10px]">⌘K</kbd>
            </button>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setSearching(true)}>
              <Search className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={resolved === "dark" ? "Light mode" : "Dark mode"}
              onClick={() => setAppearance(resolved === "dark" ? "light" : "dark")}
            >
              {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <span className="hidden text-sm text-muted-foreground xl:inline">
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
              <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
      <CommandSearch open={searching} onOpenChange={setSearching} />
    </MeContext.Provider>
  );
}

type Hit = { key: string; label: string; sub: string; href: string; icon: LucideIcon };

/** ⌘K: the portal's pages (matched here) plus salons and people (GET /api/platform/search). */
function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ("");
    setRemote([]);
    setSel(0);
  }, [open]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemote([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      papi<{ salons: { id: string; name: string; slug: string; status: string }[]; people: { id: number; name: string; email: string | null; role: string; org_id: string; salon: string }[] }>(
        `/search?q=${encodeURIComponent(t)}`,
      )
        .then((r) => {
          if (!live) return;
          setRemote([
            ...r.salons.map((s) => ({ key: `s${s.id}`, label: s.name, sub: `Salon · ${s.slug}`, href: `/platform/salons/view/?id=${encodeURIComponent(s.id)}`, icon: Building2 })),
            ...r.people.map((p) => ({ key: `p${p.id}`, label: p.name, sub: `${p.role} · ${p.salon}${p.email ? ` · ${p.email}` : ""}`, href: `/platform/salons/view/?id=${encodeURIComponent(p.org_id)}`, icon: UserRound })),
          ]);
        })
        .catch(() => {});
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const t = q.trim().toLowerCase();
  const pages: Hit[] = ALL_ITEMS.filter((i) => !t || i.label.toLowerCase().includes(t) || i.group.toLowerCase().includes(t)).map((i) => ({
    key: i.href,
    label: i.label,
    sub: i.group,
    href: i.href,
    icon: i.icon,
  }));
  const hits = [...pages.slice(0, t ? 6 : 8), ...remote];
  const go = (h: Hit | undefined) => {
    if (!h) return;
    onOpenChange(false);
    router.push(h.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false} initialFocus={input}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => (setQ(e.target.value), setSel(0))}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(hits.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(hits[sel]);
              }
            }}
            placeholder="Pages, salons, people…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search pages, salons and people"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
          {hits.length ? (
            hits.map((h, i) => (
              <li key={h.key} role="option" aria-selected={i === sel}>
                <button
                  type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(h)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", i === sel && "bg-muted")}
                >
                  <h.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{h.label}</span>
                  <span className="max-w-[50%] shrink-0 truncate text-xs text-muted-foreground">{h.sub}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing found</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
