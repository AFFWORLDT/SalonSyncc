import {
  BarChart3,
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
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar. */
  tab?: boolean;
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
      { href: "/bills", label: "Bills", icon: ReceiptText },
      { href: "/expenses", label: "Expenses", icon: Wallet },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/sheet", label: "Daily sheet", icon: Sheet, tab: true },
      { href: "/monthly", label: "Monthly", icon: BarChart3 },
      { href: "/ledger", label: "Ledger", icon: BookOpen },
      { href: "/ratings", label: "Ratings", icon: Star },
      { href: "/audit", label: "Audit log", icon: History },
    ],
  },
  {
    label: "Shop",
    items: [
      { href: "/barbers", label: "Barbers", icon: Scissors },
      { href: "/services", label: "Services", icon: ListChecks },
      { href: "/customers", label: "Customers", icon: Contact },
      { href: "/announcements", label: "Announcements", icon: Megaphone },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/account", label: "My account", icon: UserRound },
    ],
  },
];

const BARBER: NavGroup[] = [
  {
    label: "Me",
    items: [
      { href: "/", label: "Today", icon: Home, tab: true },
      { href: "/history", label: "My history", icon: CalendarDays, tab: true },
      { href: "/bills", label: "My bills", icon: ReceiptText, tab: true },
      { href: "/account", label: "My account", icon: UserRound },
    ],
  },
];

export function navFor(role: Role | undefined): NavGroup[] {
  return role === "admin" ? ADMIN : BARBER;
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

export function titleForPath(role: Role | undefined, pathname: string): string {
  const hits = navFor(role)
    .flatMap((g) => g.items)
    .filter((i) => isActive(pathname, i.href));
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0]?.label ?? "FM Salon";
}

