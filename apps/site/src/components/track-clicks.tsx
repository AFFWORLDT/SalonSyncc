"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/** One listener for the whole site: every link to /signup/ sends trial_click with where on the page it was. */
export function TrackClicks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/signup")) return;
      const where = a.closest("header") ? "nav" : a.closest("footer") ? "footer" : a.closest("[role=dialog]") ? "feature_details" : (a.closest("section[id]")?.id ?? "page");
      void track("trial_click", { location: where, page: window.location.pathname });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
