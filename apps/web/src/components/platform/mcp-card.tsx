"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { errorMessage } from "@/lib/api";
import { papi, pDateTime, usePapi } from "@/lib/platform";

interface McpSummary {
  connections: number;
  last_call_at: number | null;
  calls_30d: number;
  calls: { id: number; tool: string; ok: 0 | 1; error: string | null; at: number; name: string | null }[];
}

/**
 * The salon's AI connect (MCP) state for the super admin: switched on with the "AI connect" feature override above;
 * this card shows live connections and recent calls, and revokes every connection at once.
 */
export function McpCard({ orgId, on, owner }: { orgId: string; on: boolean; owner: boolean }) {
  const { data, error, reload } = usePapi<McpSummary>(`/orgs/${encodeURIComponent(orgId)}/mcp`);
  const [confirm, setConfirm] = useState(false);
  return (
    <Card className="gap-0 p-0" data-testid="mcp-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">AI connect</p>
          <p className="text-xs text-muted-foreground">
            {on ? "On" : "Off"} · switch it with the AI connect feature override above
            {data ? ` · ${data.connections} live connection${data.connections === 1 ? "" : "s"} · ${data.calls_30d} calls in 30 days${data.last_call_at ? ` · last ${pDateTime(data.last_call_at)}` : ""}` : ""}
          </p>
        </div>
        <Button size="sm" variant="destructive" disabled={!owner || !data?.connections} onClick={() => setConfirm(true)}>
          Revoke all connections
        </Button>
      </div>
      {error ? (
        <p className="px-4 py-3 text-sm text-destructive">{error}</p>
      ) : data && data.calls.length > 0 ? (
        <ul className="divide-y">
          {data.calls.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className={c.ok ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-destructive"} />
              <code>{c.tool}</code>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {c.name ?? "Removed connection"}
                {c.error ? ` · ${c.error}` : ""}
              </span>
              <span className="text-muted-foreground">{pDateTime(c.at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Revoke every AI connection?"
        description="All API keys and Claude connectors for this salon stop working at once. The salon can connect again while the feature is on."
        confirmLabel="Revoke all"
        destructive
        onConfirm={async () => {
          try {
            const r = await papi<{ revoked: number }>(`/orgs/${encodeURIComponent(orgId)}/mcp/revoke-all`, { method: "POST" });
            toast.success(`Revoked ${r.revoked} credential${r.revoked === 1 ? "" : "s"}`);
            setConfirm(false);
            reload();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </Card>
  );
}
