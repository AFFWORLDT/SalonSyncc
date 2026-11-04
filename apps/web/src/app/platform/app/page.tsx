"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { useCanEdit } from "@/components/platform/shell";
import { errorMessage } from "@/lib/api";
import { papi, pDateTime, usePapi } from "@/lib/platform";

interface Row {
  platform: "ios" | "android";
  min_version: string;
  latest_version: string;
  store_url: string;
  updated_at: number;
}
interface Config {
  platforms: Row[];
  devices: Record<string, Record<string, number>>;
}
const NAME = { ios: "iPhone", android: "Android" } as const;

/** The phone app's versions per platform: below the minimum the app asks to update before it opens; below the latest it suggests it. */
export default function AppVersionsPage() {
  const canEdit = useCanEdit();
  const { data, error, reload } = usePapi<Config>("/app-config");
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setDraft(Object.fromEntries(data.platforms.map((p) => [p.platform, p])));
  }, [data]);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-64 rounded-xl" />;

  async function save(p: Row["platform"]) {
    const d = draft[p]!;
    setSaving(p);
    setErrors((e) => ({ ...e, [p]: "" }));
    try {
      await papi(`/app-config/${p}`, { method: "PUT", body: { min_version: d.min_version.trim(), latest_version: d.latest_version.trim(), store_url: d.store_url.trim() } });
      toast.success(`${NAME[p]} versions saved`);
      reload();
    } catch (e) {
      setErrors((x) => ({ ...x, [p]: errorMessage(e) }));
    } finally {
      setSaving(null);
    }
  }

  const order: Row["platform"][] = ["ios", "android"];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">App</h1>
        <p className="text-sm text-muted-foreground">
          The SalonKit phone app. Below the minimum version the app asks people to update before it opens; below the latest it suggests updating.
        </p>
      </div>
      {order
        .filter((p) => draft[p])
        .map((p) => {
          const d = draft[p]!;
          const set = (k: keyof Row, v: string) => setDraft((all) => ({ ...all, [p]: { ...all[p]!, [k]: v } }));
          const devices = Object.entries(data.devices[p] ?? {}).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }));
          return (
            <Card key={p} className="gap-3 p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{NAME[p]}</h2>
                <span className="text-xs text-muted-foreground">Updated {pDateTime(d.updated_at)}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  Minimum version
                  <Input aria-label={`${NAME[p]} minimum version`} value={d.min_version} disabled={!canEdit} onChange={(e) => set("min_version", e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Latest version
                  <Input aria-label={`${NAME[p]} latest version`} value={d.latest_version} disabled={!canEdit} onChange={(e) => set("latest_version", e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-1">
                  Store link
                  <Input aria-label={`${NAME[p]} store link`} value={d.store_url} disabled={!canEdit} onChange={(e) => set("store_url", e.target.value)} />
                </label>
              </div>
              {errors[p] && <p className="text-sm text-destructive">{errors[p]}</p>}
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                  {devices.length === 0 ? <span>No signed-in phones yet.</span> : devices.map(([v, n]) => <span key={v}>{`${v} · ${n} device${n === 1 ? "" : "s"}`}</span>)}
                </div>
                {canEdit && (
                  <Button size="sm" disabled={saving === p} onClick={() => save(p)}>
                    Save {NAME[p]}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
    </div>
  );
}
