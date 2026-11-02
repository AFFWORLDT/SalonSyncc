"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { enablePush, ensurePushEnabled, pushState, type PushState } from "@/lib/push";
import { Button } from "@/components/ui/button";

/**
 * Home-screen notification setup. On every visit it makes sure this device is registered
 * (asking permission by default), and shows a short banner only when a step is still needed —
 * the browser wants a tap, it's blocked, or the app isn't installed on iPhone yet.
 * It never re-asks a user who turned notifications off from My account.
 */
export function HomePushPrompt() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    ensurePushEnabled()
      .catch(() => pushState().catch(() => "unsupported" as const))
      .then((s) => {
        if (alive) setState(s as PushState);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      await enablePush();
      setState(await pushState());
      toast.success("Notifications on for this device");
    } catch (err) {
      setState(await pushState().catch(() => "unsupported" as const));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Quiet when it's on, still checking, or this browser can never show notifications.
  if (!state || state === "on" || state === "unsupported") return null;

  const text =
    state === "blocked"
      ? "Notifications are blocked for this site. Allow them in your browser settings to get new-sale alerts."
      : state === "needs-install"
        ? "Add FM Salon to your Home Screen, then turn on notifications to get alerts."
        : "Turn on notifications to get alerted about new sales and the day’s summary.";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <BellRing className="size-4.5" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-foreground">{text}</p>
      {state === "off" && (
        <Button size="sm" onClick={enable} disabled={busy} className="shrink-0">
          {busy ? "…" : "Turn on"}
        </Button>
      )}
    </div>
  );
}
