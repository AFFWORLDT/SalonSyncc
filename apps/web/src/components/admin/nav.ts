import {
  BarChart3,
  CalendarCheck,
  Bot,
  BookOpen,
  CalendarDays,
  Contact,
  History,
  Home,
  Megaphone,
  Receipt,
  ReceiptText,
  Scissors,
  ListChecks,
  Settings,
  Sheet,
  Star,
  UserRound,
  Wallet,
  Crown,
  type LucideIcon,
} from "lucide-react";
import type { FeatureKey } from "@ss/features";
import type { MeResponse } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar. */
  tab?: boolean;
  /** Hidden unless the salon's plan includes it (the page itself shows the Upgrade card if opened directly). */
  feature?: FeatureKey;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ADMIN: NavGroup[] = [
  {
    label: "Today",
    items: [
      { href: "/", label: "Dashboard", icon: Home, tab: true },
      { href: "/sales", label: "Sales", icon: Receipt, tab: true },
      { href: "/bookings", label: "Bookings", icon: CalendarCheck, feature: "online_bookings" },
      { href: "/bills", label: "Bills", icon: ReceiptText },
      { href: "/expenses", label: "Expenses", icon: Wallet, feature: "expenses" },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/sheet", label: "Daily sheet", icon: Sheet, tab: true, feature: "daily_sheet" },
      { href: "/monthly", label: "Monthly", icon: BarChart3, feature: "reports_advanced" },
      { href: "/ledger", label: "Ledger", icon: BookOpen, feature: "ledger" },
      { href: "/ratings", label: "Ratings", icon: Star, feature: "ratings" },
      { href: "/audit", label: "Audit log", icon: History, feature: "audit_log" },
    ],
  },
  {
    label: "Shop",
    items: [
      { href: "/barbers", label: "Staff", icon: Scissors },
      { href: "/services", label: "Services", icon: ListChecks },
      { href: "/customers", label: "Customers", icon: Contact, feature: "customers_crm" },
      { href: "/announcements", label: "Announcements", icon: Megaphone, feature: "announcements" },
      { href: "/ai-connect", label: "AI connect", icon: Bot, feature: "mcp_api" },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/plan", label: "Plan", icon: Crown },
      { href: "/account", label: "My account", icon: UserRound },
    ],
  },
];

const BARBER: NavGroup[] = [
  {
    label: "Me",
    items: [
      { href: "/", label: "Today", icon: Home, tab: true },
      { href: "/bookings", label: "My bookings", icon: CalendarCheck, feature: "online_bookings" },
      { href: "/history", label: "My history", icon: CalendarDays, tab: true },
      { href: "/bills", label: "My bills", icon: ReceiptText, tab: true },
      { href: "/account", label: "My account", icon: UserRound },
    ],
  },
];

/** The menu for the signed-in user: owners and admins get the admin menu; items the plan lacks are left out. */
export function navFor(me: Pick<MeResponse, "user" | "features"> | null): NavGroup[] {
  if (!me) return [];
  const role = me.user.role;
  const groups = role === "owner" || role === "admin" ? ADMIN : BARBER;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || me.features.includes(i.feature)) }))
    .filter((g) => g.items.length > 0);
}

/** Static export serves routes with a trailing slash; compare without it. */
export function cleanPath(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function isActive(pathname: string, href: string) {
  const p = cleanPath(pathname);
  if (p === href) return true;
  return href !== "/" && p.startsWith(href + "/");
}

export function titleForPath(me: Pick<MeResponse, "user" | "features"> | null, pathname: string, fallback = ""): string {
  const hits = navFor(me)
    .flatMap((g) => g.items)
    .filter((i) => isActive(pathname, i.href));
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0]?.label ?? fallback;
}

