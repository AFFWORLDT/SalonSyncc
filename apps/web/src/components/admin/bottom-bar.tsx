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

/** Phone navigation, as in the phone app: a floating frosted-glass pill with tabs on both sides of a big "+" (new sale). Hidden on desktop. */
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
        data-tour={`tab-${item.href.replace(/\//g, "") || "home"}`}
        onClick={() => haptic("tap")}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-semibold transition-colors",
          active ? "text-primary" : "text-muted-foreground active:text-foreground"
        )}
      >
        <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary/12")}>
          <Icon className="size-5" />
        </span>
        <span className="max-w-full truncate">{SHORT[item.label] ?? item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Tabs"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden [html[data-kb=open]_&]:hidden"
    >
      <div className="pointer-events-auto flex h-16 items-stretch rounded-full border border-white/50 bg-linear-to-b from-card/80 to-card/60 px-1.5 shadow-[0_12px_30px_-10px_rgb(10_62_50/0.35)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10">
      {all.slice(0, half).map(tab)}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => {
            haptic("select");
            openNew();
          }}
          aria-label="New sale"
          data-tour="tab-new-sale"
          className="flex size-12 items-center justify-center rounded-full bg-primary bg-linear-to-br from-primary to-[color-mix(in_oklab,var(--primary),black_30%)] text-primary-foreground shadow-[0_8px_18px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)] transition-transform active:scale-95"
        >
          <Plus className="size-6" />
        </button>
      </div>
      {all.slice(half).map(tab)}
      </div>
    </nav>
  );
}
