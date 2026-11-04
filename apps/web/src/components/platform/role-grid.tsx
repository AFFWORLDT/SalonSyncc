"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@ss/features";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api";
import { papi, usePapi } from "@/lib/platform";

type Grid = { barber: Record<string, boolean>; admin: Record<string, boolean> };
const ROLES = [
  ["barber", "Barbers"],
  ["admin", "Admins"],
] as const;

/**
 * Per-role switches for one salon: hide a feature the salon has from its barbers or its admins (owner + admin). The
 * phone app and the web follow them; switching one back on only removes the hide, it never adds a feature the plan lacks.
 */
export function RoleGrid({ orgId, features, canEdit }: { orgId: string; features: string[]; canEdit: boolean }) {
  const { data, error, reload } = usePapi<Grid>(`/orgs/${encodeURIComponent(orgId)}/role-features`);
  const [busy, setBusy] = useState<string | null>(null);
  const keys = FEATURE_KEYS.filter((k) => k !== "core_sales" && features.includes(k));

  async function flip(role: string, key: FeatureKey, enabled: boolean) {
    setBusy(`${role}:${key}`);
    try {
      await papi(`/orgs/${encodeURIComponent(orgId)}/role-features/${role}/${key}`, { method: "PUT", body: { enabled } });
      toast.success(`${FEATURE_LABELS[key]} ${enabled ? "shown to" : "hidden from"} ${role === "barber" ? "barbers" : "admins"}`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div>
        <h3 className="font-semibold">By role</h3>
        <p className="text-sm text-muted-foreground">Hide a feature from this salon&apos;s barbers or admins. The phone app and the web follow it.</p>
      </div>
      {error && !data ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">Only sales are on for this salon.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-medium">Feature</th>
                {ROLES.map(([, label]) => (
                  <th key={label} className="w-24 py-1 text-center font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-2">{FEATURE_LABELS[k]}</td>
                  {ROLES.map(([role, label]) => {
                    const on = data[role][k] !== false;
                    return (
                      <td key={role} className="py-2 text-center">
                        <Switch
                          aria-label={`${FEATURE_LABELS[k]} for ${label.toLowerCase()}`}
                          checked={on}
                          disabled={!canEdit || busy !== null}
                          onCheckedChange={(v) => flip(role, k, v)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
