"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FEATURE_LABELS, type FeatureKey } from "@ss/features";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";
import { papi, type AdminBundle } from "@/lib/platform";

type Change = { key: FeatureKey; from: boolean; to: boolean };
const onOff = (v: boolean) => (v ? "on" : "off");

/** "Apply bundle" on a salon: pick a bundle, see exactly what will change, then apply it (as salon overrides). */
export function ApplyBundle({ orgId, onApplied, disabled = false }: { orgId: string; onApplied: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [bundles, setBundles] = useState<AdminBundle[] | null>(null);
  const [pick, setPick] = useState<AdminBundle | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPick(null);
    setChanges(null);
    setError(null);
  }

  async function start() {
    reset();
    setOpen(true);
    try {
      setBundles(await papi<AdminBundle[]>("/bundles"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function choose(b: AdminBundle) {
    setPick(b);
    setChanges(null);
    setError(null);
    try {
      setChanges((await papi<{ changes: Change[] }>(`/orgs/${encodeURIComponent(orgId)}/bundles/${b.id}/preview`)).changes);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function apply() {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await papi<{ changed: number }>(`/orgs/${encodeURIComponent(orgId)}/bundles/${pick.id}/apply`, { method: "POST" });
      toast.success(`${pick.name} applied · ${r.changed} change${r.changed === 1 ? "" : "s"}`);
      setOpen(false);
      onApplied();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={start}>
        Apply bundle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pick ? pick.name : "Apply a bundle"}</DialogTitle>
            <DialogDescription>{pick ? "What changes on this salon:" : "Pick a bundle. You'll see what changes before anything is saved."}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!pick ? (
            <div className="flex flex-col gap-2">
              {bundles === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
              {bundles?.length === 0 && <p className="text-sm text-muted-foreground">No bundles yet. Make one on the Bundles page.</p>}
              {bundles?.map((b) => (
                <button key={b.id} type="button" onClick={() => choose(b)} className="rounded-lg border border-border p-3 text-left hover:bg-muted">
                  <p className="font-medium">{b.name}</p>
                  {b.description && <p className="text-sm text-muted-foreground">{b.description}</p>}
                </button>
              ))}
            </div>
          ) : changes === null ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : changes.length === 0 ? (
            <p className="text-sm">This salon already matches the bundle.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                {changes.length} change{changes.length === 1 ? "" : "s"}
              </p>
              <ul className="list-disc pl-5 text-sm">
                {changes.map((c) => (
                  <li key={c.key}>{`${FEATURE_LABELS[c.key]}: ${onOff(c.from)} → ${onOff(c.to)}`}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            {pick && (
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
            )}
            {pick && changes && changes.length > 0 && (
              <Button disabled={busy} onClick={apply}>
                Apply
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
