/** Same-origin JSON client for the SalonKit Worker. */

export class ApiError extends Error {
  status: number;
  /** The API's machine-readable code: feature_disabled, subscription_inactive, stale, staff_limit, wrong_org… */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** App-wide reactions to API answers (AuthProvider listens): plan or subscription changed under us, or the session is for another salon. */
export type ApiEventKind = "subscription_inactive" | "feature_disabled" | "signed_out";
const listeners = new Set<(k: ApiEventKind) => void>();
export function onApiEvent(fn: (k: ApiEventKind) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(k: ApiEventKind) {
  for (const fn of listeners) fn(k);
}

export const SESSION_CACHE_PREFIX = "ss_session_cache:";
/** Drops every cached /api/me answer (all salons this browser has signed in to). */
export function clearSessionCaches() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(SESSION_CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
}

/** True when `err` is the API's 409 "changed by someone else" (reload and retry). */
export function isStale(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.code === "stale";
}

type Body = Record<string, unknown> | unknown[] | FormData;

export async function api<T>(
  path: string,
  opts: { method?: string; body?: Body; redirectOn401?: boolean } = {}
): Promise<T> {
  const { method = opts.body ? "POST" : "GET", body, redirectOn401 = true } = opts;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const field = (k: "error" | "code") =>
    data && typeof data === "object" && k in data && typeof (data as Record<string, unknown>)[k] === "string" ? ((data as Record<string, string>)[k] as string) : undefined;
  const code = field("code");

  if (res.status === 401 && typeof window !== "undefined") {
    // Signed in to another salon (or the session ended): stale cached screens must not survive.
    if (code === "wrong_org") clearSessionCaches();
    if (redirectOn401 && !window.location.pathname.startsWith("/login")) {
      emit("signed_out");
      // A full reload drops any in-memory state from the expired session.
      window.location.href = "/login/";
    }
  }
  if (res.status === 402 && code === "subscription_inactive") emit("subscription_inactive");
  if (res.status === 403 && code === "feature_disabled") emit("feature_disabled");

  if (!res.ok) throw new ApiError(field("error") ?? `Request failed (${res.status})`, res.status, code);
  return data as T;
}

/** Message for a caught error, for toasts. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
