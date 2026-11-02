"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { OrgTable } from "@/components/platform/org-table";
import { usePlatformMe } from "@/components/platform/shell";
import { errorMessage } from "@/lib/api";
import { type AdminOrg, papi, usePapi } from "@/lib/platform";

const BULK_MAX = 20;

/** Expired salons: extend their trial or deactivate them, up to 20 at a time. */
export default function ExpiredQueue() {
  const me = usePlatformMe();
  const { data, error, reload } = usePapi<AdminOrg[]>("/orgs?status=expired");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [days, setDays] = useState("7");
  const [confirm, setConfirm] = useState(false);
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < BULK_MAX) n.add(id);
      return n;
    });
  async function run(action: "deactivate" | "extend_trial") {
    try {
      const r = await papi<{ changed: number }>("/orgs/bulk", { body: { ids: [...sel], action, days: Number(days) } });
      toast.success(`${r.changed} salon${r.changed === 1 ? "" : "s"} ${action === "deactivate" ? "deactivated" : "back on trial"}`);
      setSel(new Set());
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const owner = me.role === "owner";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">Expired queue</h1>
        <p className="text-sm text-muted-foreground">Salons whose trial and grace are over. They can still read their data but can't add sales.</p>
      </div>
      {owner && (
        <Card className="flex-row flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-medium">{sel.size} selected</span>
          <div className="flex-1" />
          <Input aria-label="Days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="h-9 w-20" />
          <Button size="sm" variant="outline" disabled={!sel.size} onClick={() => run("extend_trial")}>
            Extend trial
          </Button>
          <Button size="sm" variant="destructive" disabled={!sel.size} onClick={() => setConfirm(true)}>
            Deactivate
          </Button>
        </Card>
      )}
      <Card className="gap-0 p-0">
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        ) : data.length ? (
          <OrgTable orgs={data} selected={owner ? sel : undefined} onToggle={toggle} />
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No expired salons.</p>
        )}
      </Card>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Deactivate ${sel.size} salon${sel.size === 1 ? "" : "s"}?`}
        description="Nobody there can sign in until you reactivate them. Their data is kept."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => run("deactivate")}
      />
    </div>
  );
}
