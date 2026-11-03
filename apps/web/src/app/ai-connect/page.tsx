"use client";

import { useState } from "react";
import { Bot, Check, Copy, KeyRound, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { dateTimeLabel } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/states";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/app/field";
import { SimpleSelect } from "@/components/app/simple-select";

interface McpConnection {
  connection_id: string;
  kind: "key" | "oauth";
  name: string;
  scopes: ("read" | "write")[];
  last4: string;
  user_name: string;
  created_at: number;
  expires_at: number | null;
  last_used_at: number | null;
}
interface McpCall {
  id: number;
  name: string | null;
  tool: string;
  ok: 0 | 1;
  error: string | null;
  ms: number;
  at: number;
}
type McpPage = { enabled: false } | { enabled: true; server_url: string; max_connections: number; connections: McpConnection[]; calls: McpCall[] };
interface NewKey {
  secret: string;
  command: string;
}

/** Copies `text` and flips the icon to a tick for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

/** AI connect: connect Claude (or any MCP app) to this salon. On only when SalonKit support switched it on. */
export default function AiConnectPage() {
  const { isAdmin, me } = useAuth();
  const { data, error, reload } = useApi<McpPage>(isAdmin ? "/api/mcp" : null);
  const [creating, setCreating] = useState(false);
  const [revoke, setRevoke] = useState<McpConnection | null>(null);
  const support = !!me?.support;

  if (!isAdmin) return <p className="py-10 text-center text-sm text-muted-foreground">AI connect is for owners and admins.</p>;
  if (error) return <ErrorState message="Couldn’t load AI connect." onRetry={reload} />;
  if (!data) return <Skeleton className="h-64 w-full" />;
  if (!data.enabled) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="AI connect" description="Ask Claude about your salon: today's sales, top customers, expenses and more." />
        <Card className="items-center gap-3 p-8 text-center">
          <Bot className="size-8 text-muted-foreground" />
          <p className="font-medium">AI connect isn’t switched on for your salon</p>
          <p className="max-w-md text-sm text-muted-foreground">It’s a premium feature that SalonKit support switches on per salon. Contact us and we’ll set it up.</p>
        </Card>
      </div>
    );
  }

  const full = data.connections.length >= data.max_connections;
  const setScope = async (c: McpConnection, scope: "read" | "write") => {
    try {
      await api(`/api/mcp/connections/${encodeURIComponent(c.connection_id)}`, { method: "PUT", body: { scope } });
      toast.success("Access updated");
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI connect"
        description="Connect Claude to your salon and ask about sales, customers, expenses and staff in plain words."
        actions={
          <Button onClick={() => setCreating(true)} disabled={full || support} title={support ? "Not in support mode" : full ? `Up to ${data.max_connections} connections` : undefined}>
            <KeyRound className="size-4" />
            New API key
          </Button>
        }
      />

      <Card className="gap-3 p-5">
        <p className="text-sm font-semibold">Your server address</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm" data-testid="mcp-url">
            {data.server_url}
          </code>
          <CopyButton text={data.server_url} label="Copy server address" />
        </div>
        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <div className="text-sm">
            <p className="font-medium">Claude (web or desktop)</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
              <li>Settings → Connectors → Add custom connector</li>
              <li>Paste the address above and click Add</li>
              <li>Sign in to your salon and approve</li>
            </ol>
          </div>
          <div className="text-sm">
            <p className="font-medium">Claude Code</p>
            <p className="mt-1 text-muted-foreground">Create an API key: it comes with the ready command to paste in your terminal.</p>
          </div>
        </div>
      </Card>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Connections</p>
          <p className="text-xs text-muted-foreground">
            {data.connections.length} of {data.max_connections}
          </p>
        </div>
        {data.connections.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing connected yet.</p>
        ) : (
          <ul className="divide-y">
            {data.connections.map((c) => (
              <li key={c.connection_id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="mcp-connection">
                <Plug className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {c.name}
                    <Badge variant="outline">{c.kind === "key" ? `Key …${c.last4}` : "Claude connector"}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    By {c.user_name} · added {dateTimeLabel(c.created_at)} · {c.last_used_at ? `last used ${dateTimeLabel(c.last_used_at)}` : "never used"}
                    {c.kind === "key" ? ` · ${c.expires_at ? `expires ${dateTimeLabel(c.expires_at)}` : "never expires"}` : ""}
                  </p>
                </div>
                <SimpleSelect
                  label={`${c.name} access`}
                  value={c.scopes.includes("write") ? "write" : "read"}
                  disabled={support}
                  onChange={(v) => void setScope(c, v as "read" | "write")}
                  options={[
                    { value: "read", label: "Read only" },
                    { value: "write", label: "Read and write" },
                  ]}
                  size="sm"
                  className="w-40"
                />
                <Button size="sm" variant="ghost" aria-label={`Revoke ${c.name}`} onClick={() => setRevoke(c)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="gap-0 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Recent activity</p>
        </div>
        {data.calls.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No AI requests yet.</p>
        ) : (
          <ul className="divide-y">
            {data.calls.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className={c.ok ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-destructive"} aria-label={c.ok ? "OK" : "Failed"} />
                <code className="text-xs">{c.tool}</code>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {c.name ?? "Removed connection"}
                  {c.error ? ` · ${c.error}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{dateTimeLabel(c.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NewKeyDialog open={creating} onOpenChange={setCreating} onCreated={reload} />
      <ConfirmDialog
        open={!!revoke}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={`Revoke ${revoke?.name ?? ""}?`}
        description="The AI app loses access at once. You can connect it again later."
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          if (!revoke) return;
          try {
            await api(`/api/mcp/connections/${encodeURIComponent(revoke.connection_id)}`, { method: "DELETE" });
            toast.success("Revoked");
            setRevoke(null);
            reload();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function NewKeyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [expiry, setExpiry] = useState("90");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<NewKey | null>(null);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setMade(null);
      setName("");
      setScope("read");
      setExpiry("90");
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<NewKey>("/api/mcp/keys", { method: "POST", body: { name: name.trim(), scope, expires_days: expiry === "never" ? null : Number(expiry) } });
      setMade(r);
      onCreated();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {made ? (
          <>
            <DialogHeader>
              <DialogTitle>Your API key</DialogTitle>
              <DialogDescription>Copy it now: it’s shown only once. Anyone with it can use your salon’s data, so keep it private.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs" data-testid="mcp-secret">
                  {made.secret}
                </code>
                <CopyButton text={made.secret} label="Copy key" />
              </div>
              <p className="text-sm font-medium">Claude Code</p>
              <div className="flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{made.command}</code>
                <CopyButton text={made.command} label="Copy command" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>For Claude Code and other MCP apps that use a key.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Field label="Name">
                <Input value={name} maxLength={60} placeholder="e.g. Claude on my laptop" onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Access">
                <SimpleSelect
                  label="Access"
                  value={scope}
                  onChange={(v) => setScope(v as "read" | "write")}
                  options={[
                    { value: "read", label: "Read only" },
                    { value: "write", label: "Read and write (add expenses, send announcements)" },
                  ]}
                />
              </Field>
              <Field label="Expires">
                <SimpleSelect
                  label="Expires"
                  value={expiry}
                  onChange={setExpiry}
                  options={[
                    { value: "7", label: "In 7 days" },
                    { value: "30", label: "In 30 days" },
                    { value: "90", label: "In 90 days" },
                    { value: "365", label: "In a year" },
                    { value: "never", label: "Never" },
                  ]}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button disabled={!name.trim() || busy} onClick={() => void create()}>
                {busy ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

