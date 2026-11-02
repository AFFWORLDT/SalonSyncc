"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useSaleSheet } from "@/components/app/sale-sheet";
import { isActive, navFor, type NavItem } from "./nav";
import { haptic } from "@/lib/haptics";

const SHORT: Record<string, string> = { Dashboard: "Home", "Daily sheet": "Sheet", "My history": "History", "My account": "Account", "My bills": "Bills" };

/** Phone navigation: tabs on both sides of a big "+" (new sale) button. Hidden on desktop. */
export function BottomBar() {
  const { me } = useAuth();
  const { openNew } = useSaleSheet();
  const pathname = usePathname();
  const tabs = navFor(me)
    .flatMap((g) => g.items)
    .filter((i) => i.tab);
  const account = navFor(me)
    .flatMap((g) => g.items)
    .find((i) => i.href === "/account");
  const all = account && !tabs.includes(account) ? [...tabs, account] : tabs;
  const half = Math.ceil(all.length / 2);

  const tab = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => haptic("tap")}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground active:text-foreground"
        )}
      >
        <Icon className="size-5" />
        <span className="max-w-full truncate">{SHORT[item.label] ?? item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Tabs"
      className="flex shrink-0 items-stretch border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden [html[data-kb=open]_&]:hidden"
    >
      {all.slice(0, half).map(tab)}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => {
            haptic("select");
            openNew();
          }}
          aria-label="New sale"
          className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95"
        >
          <Plus className="size-7" />
        </button>
      </div>
      {all.slice(half).map(tab)}
    </nav>
  );
}
