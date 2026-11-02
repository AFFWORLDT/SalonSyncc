"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const HINT: Record<PushState, string> = {
  unsupported: "This browser can't show notifications. On Android use Chrome; on iPhone add the app to the Home Screen first.",
  "needs-install": "On iPhone: tap Share → Add to Home Screen, open FM Salon from there, then turn this on.",
  blocked: "Notifications are blocked for this site. Allow them in the browser or phone settings, then come back.",
  off: "Off on this device.",
  on: "On for this device.",
};

/** My account → turn push notifications on/off for this phone or browser. */
export function NotificationsCard() {
  const { isAdmin } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then(setState, () => setState("unsupported"));
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      if (on) await enablePush();
      else await disablePush();
      setState(await pushState());
      toast.success(on ? "Notifications on for this device" : "Notifications off for this device");
    } catch (err) {
      setState(await pushState().catch(() => "unsupported" as const));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const usable = state === "on" || state === "off";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-5" /> Notifications
        </CardTitle>
        <CardDescription>
          {isAdmin
            ? "New bills and the end-of-day summary. Choose what is sent in Settings."
            : "When the admin changes or deletes one of your sales, and a reminder if you have not logged a sale yet that day."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="push-on" className="text-sm font-medium">
              Notify me on this device
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">{state ? HINT[state] : "Checking…"}</p>
          </div>
          <Switch id="push-on" checked={state === "on"} disabled={!usable || busy} onCheckedChange={toggle} />
        </div>
      </CardContent>
    </Card>
  );
}
