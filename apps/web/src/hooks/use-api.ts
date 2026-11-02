"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";

/** Last answer per path for this tab: revisiting a screen paints at once, then revalidates. */
const cache = new Map<string, unknown>();

/** Event fired after any change (sale, expense, user, settings); open screens refetch. */
export const DATA_CHANGED = "fm:data-changed";

export function notifyDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED));
}

/**
 * GET `path` and keep the result. `null` skips the request. `reload()` refetches
 * without clearing what is on screen; `setData` allows optimistic edits.
 * Cached data shows immediately (`loading` false) while a fresh copy loads.
 */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>(() => ({
    path,
    data: path ? ((cache.get(path) as T | undefined) ?? null) : null,
    error: null,
  }));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const hit = cache.get(path) as T | undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hit !== undefined) setState((s) => (s.path === path && s.data === hit ? s : { path, data: hit, error: null }));
    api<T>(path)
      .then((data) => {
        cache.set(path, data);
        if (!cancelled) setState({ path, data, error: null });
      })
      .catch((err) => !cancelled && setState((s) => ({ path, data: s.path === path ? s.data : null, error: errorMessage(err) })));
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  useEffect(() => {
    const on = () => setVersion((v) => v + 1);
    window.addEventListener(DATA_CHANGED, on);
    return () => window.removeEventListener(DATA_CHANGED, on);
  }, []);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((fn: (d: T | null) => T | null) => setState((s) => ({ ...s, data: fn(s.data) })), []);

  const fresh = state.path === path;
  return {
    data: fresh ? state.data : null,
    stale: state.data,
    error: fresh ? state.error : null,
    loading: !!path && (!fresh || (state.data === null && state.error === null)),
    reload,
    setData,
  };
}

/** Forget cached answers (on logout, so the next user never sees them). */
export function clearApiCache() {
  cache.clear();
}
