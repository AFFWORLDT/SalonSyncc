"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { BottomBar } from "@/components/admin/bottom-bar";
import { TopBar } from "@/components/admin/top-bar";
import { SaleSheetProvider } from "@/components/app/sale-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { watchKeyboard } from "@/lib/keyboard";
import { PullToRefresh } from "@/components/app/pull-to-refresh";
import { startPush } from "@/lib/push";
import { toast } from "sonner";
import { SubscriptionBanner, ExpiredScreen } from "@/components/app/subscription";

/** Pages an expired salon can still open (read-only: reports, exports, its account and plan). */
const READONLY_OK = ["/sheet", "/monthly", "/ledger", "/bills", "/history", "/account", "/plan"];

const COLLAPSE_KEY = "ss_sidebar_collapsed";
const COLLAPSE_EVENT = "ss-sidebar-collapsed";

function subscribeCollapsed(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(COLLAPSE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(COLLAPSE_EVENT, cb);
  };
}
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Pages that render without sign-in or the app frame. */
const PUBLIC_PATHS = ["/login", "/r", "/rate"];
/** Pages only the admin may open (barbers are sent home). */
const ADMIN_PATHS = ["/services", "/sales", "/expenses", "/sheet", "/monthly", "/audit", "/ledger", "/barbers", "/customers", "/settings", "/ratings", "/plan"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useEffect(() => watchKeyboard(), []);
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return <div className="h-full overflow-y-auto">{children}</div>;
  return <Frame>{children}</Frame>;
}

/** Frame-shaped placeholder while the session loads (first visit only; later visits use the cached session). */
function FrameSkeleton() {
  return (
    <div className="fixed inset-0 flex flex-col bg-background" aria-busy="true" aria-label="Loading">
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading, has, readOnly } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  // Devices that allowed notifications re-register after sign-in; pushes that land while the app is open show as toasts.
  const userId = user?.id;
  const push = has("push");
  useEffect(() => {
    if (!userId || !push) return;
    let stop = () => {};
    startPush((title, body) => toast(title, { description: body }))
      .then((s) => (stop = s))
      .catch(() => {});
    return () => stop();
  }, [userId, push]);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const blocked = !!user && !isAdmin && ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const toggleCollapsed = useCallback(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, readCollapsed() ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
    else if (blocked) router.replace("/");
  }, [loading, user, blocked, router]);

  if (loading || !user || blocked) return <FrameSkeleton />;

  return (
    <TooltipProvider>
      <SaleSheetProvider>
        <div className="flex h-full overflow-hidden bg-background text-foreground">
          <aside className={`hidden h-full shrink-0 border-r border-border transition-[width] duration-200 ease-out lg:block ${collapsed ? "w-16" : "w-64"}`}>
            <AppSidebar collapsed={collapsed} />
          </aside>

          {isAdmin && (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetContent side="left" showCloseButton={false} className="gap-0 p-0 data-[side=left]:w-72 lg:hidden">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SheetDescription className="sr-only">Pages</SheetDescription>
                <AppSidebar onNavigate={() => setMobileOpen(false)} key={pathname} />
              </SheetContent>
            </Sheet>
          )}

          <div className="flex h-full min-w-0 flex-1 flex-col">
            <TopBar onOpenMobileNav={() => setMobileOpen(true)} onToggleCollapsed={toggleCollapsed} />
            <SubscriptionBanner />
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <PullToRefresh scrollRef={mainRef} />
              <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6 sm:p-6 lg:p-8">
                <div className="mx-auto w-full max-w-6xl">{readOnly && !READONLY_OK.some((p) => pathname === p || pathname.startsWith(p + "/")) ? <ExpiredScreen /> : children}</div>
              </main>
            </div>
            <BottomBar />
          </div>
        </div>
      </SaleSheetProvider>
    </TooltipProvider>
  );
}
