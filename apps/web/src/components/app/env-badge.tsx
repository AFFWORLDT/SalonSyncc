"use client";

import { useEffect, useState } from "react";

/** Staging (or a local copy) is told apart by its address, so production never shows the badge. */
const isTestHost = (host: string) => host.includes("staging") || host === "localhost" || host === "127.0.0.1";

/**
 * A yellow "TEST ENVIRONMENT" pill and stripe on every screen of staging, and "[TEST]" in the tab title,
 * so nobody rings up a real bill on the test copy by mistake.
 */
export function EnvBadge() {
  const [test, setTest] = useState(false);
  useEffect(() => {
    if (!isTestHost(window.location.hostname)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTest(true);
    const tag = () => {
      if (!document.title.startsWith("[TEST]")) document.title = `[TEST] ${document.title}`;
    };
    tag();
    const head = document.querySelector("head");
    const mo = head ? new MutationObserver(tag) : null;
    if (head) mo!.observe(head, { subtree: true, childList: true, characterData: true });
    return () => mo?.disconnect();
  }, []);
  if (!test) return null;
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-yellow-400" />
      <div
        role="status"
        className="pointer-events-none fixed top-[env(safe-area-inset-top)] left-1/2 z-[100] -translate-x-1/2 rounded-b-lg bg-yellow-400 px-2.5 pt-px pb-0.5 text-[9.5px] leading-tight font-bold tracking-[0.14em] text-black shadow-sm"
      >
        TEST ENVIRONMENT
      </div>
    </>
  );
}
