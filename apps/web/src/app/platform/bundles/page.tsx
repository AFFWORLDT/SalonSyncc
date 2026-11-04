"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@ss/features";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { useCanEdit } from "@/components/platform/shell";
import { errorMessage } from "@/lib/api";
import { type AdminBundle, papi, usePapi } from "@/lib/platform";
import { cn } from "@/lib/utils";

type Choice = "leave" | "on" | "off";
const KEYS = FEATURE_KEYS.filter((k) => k !== "core_sales");

interface Draft {
  id: number | null;
  name: string;
  description: string;
  choice: Record<string, Choice>;
}
const empty = (): Draft => ({ id: null, name: "", description: "", choice: {} });
const toDraft = (b: AdminBundle): Draft => ({
  id: b.id,
  name: b.name,
  description: b.description ?? "",
  choice: Object.fromEntries(Object.entries(b.features).map(([k, v]) => [k, v ? "on" : "off"])),
});
const summary = (b: AdminBundle) =>
  KEYS.filter((k) => k in b.features)
    .map((k) => `${FEATURE_LABELS[k]} ${b.features[k] ? "on" : "off"}`)
    .join(" · ");

/** Feature bundles: named sets of switches applied to a salon in one go (from the salon's page). */
export default function BundlesPage() {
  const canEdit = useCanEdit();
  const { data, error, reload } = usePapi<AdminBundle[]>("/bundles");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function save() {
    if (!draft) return;
    const features = Object.fromEntries(
      KEYS.filter((k) => (draft.choice[k] ?? "leave") !== "leave").map((k) => [k, draft.choice[k] === "on"]),
    );
    setSaving(true);
    setFormError(null);
    try {
      const body = { name: draft.name.trim(), description: draft.description.trim(), features };
      await papi(draft.id === null ? "/bundles" : `/bundles/${draft.id}`, { method: draft.id === null ? "POST" : "PUT", body });
      toast.success(`${body.name} saved`);
      setDraft(null);
      reload();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(b: AdminBundle) {
    if (!window.confirm(`Delete ${b.name}? Salons it was applied to keep their switches.`)) return;
    try {
      await papi(`/bundles/${b.id}`, { method: "DELETE" });
      toast.success(`${b.name} deleted`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bundles</h1>
          <p className="text-sm text-muted-foreground">Named sets of feature switches. Apply one on a salon&apos;s page; you see what changes before it is saved.</p>
        </div>
        {canEdit && !draft && (
          <Button
            onClick={() => {
              setFormError(null);
              setDraft(empty());
            }}
          >
            New bundle
          </Button>
        )}
      </div>

      {draft && (
        <Card className="gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <Input aria-label="Name" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Description (optional)
              <Input aria-label="Description" value={draft.description} maxLength={200} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {KEYS.map((k: FeatureKey) => {
              const v = draft.choice[k] ?? "leave";
              return (
                <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{FEATURE_LABELS[k]}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={FEATURE_LABELS[k]}>
                    {(["leave", "on", "off"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={v === c}
                        aria-label={`${FEATURE_LABELS[k]}: ${c}`}
                        onClick={() => setDraft({ ...draft, choice: { ...draft.choice, [k]: c } })}
                        className={cn("rounded-md border px-2 py-1 text-xs", v === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
                      >
                        {c === "leave" ? "Leave" : c === "on" ? "On" : "Off"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={save}>
              Save bundle
            </Button>
          </div>
        </Card>
      )}

      {!data ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : data.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No bundles yet.</Card>
      ) : (
        data.map((b) => (
          <Card key={b.id} className="gap-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{b.name}</p>
                {b.description && <p className="text-sm text-muted-foreground">{b.description}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFormError(null);
                      setDraft(toDraft(b));
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(b)}>
                    Delete
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{summary(b)}</p>
          </Card>
        ))
      )}
    </div>
  );
}
