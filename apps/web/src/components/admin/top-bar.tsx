"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Moon, PanelLeft, Plus, Sun, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAppTheme } from "@/components/theme/theme-provider";
import { UserAvatar } from "@/components/app/user-avatar";
import { NotificationBell } from "@/components/app/notification-bell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogoMark } from "@/components/logo";
import { titleForPath } from "./nav";
import { BRAND_NAME } from "@/lib/brand";
import { useSaleSheet } from "@/components/app/sale-sheet";

export function TopBar({ onOpenMobileNav, onToggleCollapsed }: { onOpenMobileNav: () => void; onToggleCollapsed: () => void }) {
  const { me, user, settings, isAdmin, readOnly, logout, has } = useAuth();
  const { resolved, setAppearance } = useAppTheme();
  const { openNew } = useSaleSheet();
  const router = useRouter();
  const pathname = usePathname();
  const initial = user?.name?.trim()?.[0]?.toUpperCase() || "?";
  const salon = settings?.display_name ?? "";
  const title = titleForPath(me, pathname, salon);

  useEffect(() => {
    document.title = title && title !== salon ? `${title} · ${salon}` : salon || BRAND_NAME;
  }, [title, salon]);

  return (
    <header className="box-content flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 pt-[env(safe-area-inset-top)] sm:px-4 lg:px-6">
      {isAdmin ? (
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
          <Menu />
        </Button>
      ) : (
        <LogoMark size={28} className="lg:hidden" src={settings?.logo_url} />
      )}
      <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={onToggleCollapsed} aria-label="Toggle sidebar">
        <PanelLeft />
      </Button>
      <p className="min-w-0 flex-1 truncate text-base font-semibold">{title}</p>
      <Button size="sm" data-tour="new-sale" className="hidden lg:inline-flex" onClick={() => openNew()} disabled={readOnly}>
        <Plus />
        New sale
      </Button>
      {has("push") && <NotificationBell />}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Account menu" />}>
          <UserAvatar name={user?.name ?? initial} url={user?.avatar_url} size={30} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate text-sm font-medium text-foreground">{user?.name}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                @{user?.username} · {user?.role === "owner" ? "Owner" : isAdmin ? "Admin" : "Barber"}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/account" />}>
            <UserRound />
            My account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAppearance(resolved === "dark" ? "light" : "dark")}>
            {resolved === "dark" ? <Sun /> : <Moon />}
            {resolved === "dark" ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
