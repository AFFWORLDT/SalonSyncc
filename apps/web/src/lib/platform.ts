"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "./api";

/** Super admin panel client: same-origin /api/platform/*, its own session (ss_platform); 401 goes to the panel's login. */
export async function papi<T>(path: string, opts: { method?: string; body?: Record<string, unknown> } = {}): Promise<T> {
  try {
    return await api<T>(`/api/platform${path}`, { ...opts, redirectOn401: false });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/platform/login")) {
      window.location.href = "/platform/login/";
    }
    throw e;
  }
}

/** GET a panel path; `reload()` refetches in place. */
export function usePapi<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!path) return;
    let off = false;
    papi<T>(path)
      .then((data) => !off && setState({ data, error: null }))
      .catch((e) => !off && setState((s) => ({ data: s.data, error: errorMessage(e) })));
    return () => {
      off = true;
    };
  }, [path, v]);
  const reload = useCallback(() => setV((x) => x + 1), []);
  return { ...state, reload };
}

export interface PlatformMe {
  id: number;
  email: string;
  role: "owner" | "support";
  brand: string;
}

export interface AdminOrg {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan_id: string;
  trial_ends_at: number | null;
  grace_ends_at: number | null;
  created_at: number;
  deactivated_at: number | null;
  deleted_at: number | null;
  owner_email: string | null;
  owner_phone: string | null;
  country: string;
  limits_override: { max_staff: number | null } | null;
  staff: number;
  sales_30d: number;
  last_sale_at: number | null;
}

export interface AdminPlan {
  id: string;
  name: string;
  price_monthly: number;
  currency: string;
  stripe_price_id: string | null;
  limits: { max_staff: number | null };
  active: boolean;
  sort: number;
  features: string[];
  orgs: number;
}

export interface AuditItem {
  id: number;
  who: string;
  action: string;
  org_id?: string | null;
  slug?: string | null;
  before_json: string | null;
  after_json: string | null;
  at: number;
}

export const STATUS_OPTIONS = ["trial", "active", "grace", "past_due", "expired", "deactivated", "deleted"] as const;

export const STATUS_LABEL: Record<string, string> = {
  trial: "Trial",
  active: "Paid",
  grace: "Grace",
  past_due: "Payment due",
  expired: "Expired",
  deactivated: "Deactivated",
  deleted: "Deleted",
};

/** Pill colours for a salon status. */
export function statusClass(status: string): string {
  if (status === "active") return "bg-success/15 text-success";
  if (status === "trial") return "bg-primary/12 text-primary";
  if (status === "grace" || status === "past_due") return "bg-warning/15 text-warning";
  if (status === "expired" || status === "deleted") return "bg-destructive/12 text-destructive";
  return "bg-muted text-muted-foreground";
}

/** "3 Nov 2026" (or "—"). */
export function pDate(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
export function pDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "in 3 days", "today", "2 days ago". */
export function relDays(ms: number | null, now = Date.now()): string {
  if (!ms) return "—";
  const d = Math.round((ms - now) / 86_400_000);
  if (d === 0) return "today";
  return d > 0 ? `in ${d} day${d === 1 ? "" : "s"}` : `${-d} day${d === -1 ? "" : "s"} ago`;
}

/** What a salon's current period ends on, for the table: trial end, grace end, or nothing. */
export function periodEnd(o: Pick<AdminOrg, "status" | "trial_ends_at" | "grace_ends_at">): number | null {
  if (o.status === "trial") return o.trial_ends_at;
  if (o.status === "grace" || o.status === "past_due") return o.grace_ends_at;
  return null;
}

const ACTIONS: Record<string, string> = {
  plan_change: "changed the plan",
  extend_trial: "extended the trial",
  extend_grace: "extended grace",
  activate: "marked as paid",
  deactivate: "deactivated",
  reactivate: "reactivated",
  delete: "deleted",
  feature_override: "overrode a feature",
  limits_override: "changed the staff limit",
  support_code: "opened a support link",
  support_login: "signed in as the salon",
  plan_edit: "edited a plan",
  user_create: "added a platform user",
  user_delete: "removed a platform user",
  password_change: "changed their password",
};
export const actionLabel = (a: string) => ACTIONS[a] ?? a.replace(/_/g, " ");

/** Signups per day for the last `n` days (oldest first), zero-filled. */
export function signupSeries(byDay: Record<string, number>, n = 30, now = Date.now()): { day: string; count: number }[] {
  const out: { day: string; count: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day, count: byDay[day] ?? 0 });
  }
  return out;
}
