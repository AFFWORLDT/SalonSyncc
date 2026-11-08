"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Send, UserRound, Users, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/admin/states";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { RelativeTime } from "@/components/admin/relative-time";
import { useCanEdit } from "@/components/platform/shell";
import { papi, usePapi } from "@/lib/platform";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Stats {
  devices: number;
  people: number;
  ios: number;
  android: number;
  web: number;
  configured: boolean;
}
interface Broadcast {
  id: number;
  title: string;
  body: string;
  target_label: string;
  recipients: number;
  sent: number;
  failed: number;
  done: number;
  sent_by: string;
  created_at: number;
}
type Target = "all" | "org" | "user";
type Pick = { org_id: string; label: string; user_id?: number };

/** Push notifications to salon staff (phone app and browsers): everyone, one salon, or one person. */
export default function NotificationsPage() {
  const canEdit = useCanEdit();
  const stats = usePapi<Stats>("/notifications/stats");
  const history = usePapi<{ broadcasts: Broadcast[] }>("/notifications/history");
  const [target, setTarget] = useState<Target>("all");
  const [pick, setPick] = useState<Pick | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState<Broadcast | null>(null);

  const ready = title.trim().length >= 2 && body.trim().length >= 2 && (target === "all" || (pick && (target === "org" || pick.user_id)));

  async function send() {
    try {
      let b = await papi<Broadcast>("/notifications", {
        method: "POST",
        body: { title: title.trim(), body: body.trim(), target, org_id: pick?.org_id, user_id: pick?.user_id },
      });
      setSending(b);
      // One slice per request (the free plan's limit on outgoing calls); keep going until done.
      while (!b.done) {
        b = await papi<Broadcast>(`/notifications/${b.id}/continue`, { method: "POST" });
        setSending(b);
      }
      toast.success(`Sent to ${b.sent} device${b.sent === 1 ? "" : "s"}${b.failed ? ` · ${b.failed} not reachable` : ""}`);
      setTitle("");
      setBody("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(null);
      history.reload();
      stats.reload();
    }
  }

  const s = stats.data;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Notifications" description="Send a push notification to salon staff on their phones and browsers." />
      {stats.error && !s ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Devices with push" value={s?.devices ?? 0} />
          <StatCard label="People reachable" value={s?.people ?? 0} />
          <StatCard label="iOS · Android" value={s?.ios ?? 0} format={(n) => `${n} · ${s?.android ?? 0}`} />
          <StatCard label="Browsers" value={s?.web ?? 0} />
        </div>
      )}

      <Card className="gap-4 p-5">
        <p className="text-sm font-semibold">New notification</p>
        {s && !s.configured && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">Push isn&apos;t set up on the server (FCM_SERVICE_ACCOUNT), so nothing can be sent.</p>}
        <div className="grid gap-2">
          <Label>Send to</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Send to">
            {(
              [
                ["all", "Everyone", Users],
                ["org", "One salon", Building2],
                ["user", "One person", UserRound],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={target === v}
                disabled={!canEdit}
                onClick={() => (setTarget(v), setPick(null))}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors duration-150",
                  target === v ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
          {target !== "all" && <Picker kind={target} value={pick} onChange={setPick} disabled={!canEdit} />}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="n-title">Title</Label>
          <Input id="n-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} placeholder="New in SalonKit" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="n-body">Message</Label>
          <Textarea id="n-body" maxLength={300} rows={3} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canEdit} placeholder="What do you want them to know?" />
          <p className="text-right text-xs text-muted-foreground">{body.length}/300</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{canEdit ? "Tapping it opens the person's salon in SalonKit." : "Only a portal owner can send notifications."}</p>
          <Button disabled={!canEdit || !ready || !!sending || (s ? !s.configured : true)} onClick={() => setConfirm(true)}>
            <Send className="size-4" />
            {sending ? `Sending… ${sending.sent + sending.failed}/${sending.recipients}` : "Send"}
          </Button>
        </div>
      </Card>

      <Card className="gap-0 p-0">
        <p className="border-b px-4 py-3 text-sm font-semibold">History</p>
        {history.error && !history.data ? (
          <div className="p-4">
            <ErrorState message={history.error} onRetry={history.reload} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Notification</TableHead>
                  <TableHead>Sent to</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history.data?.broadcasts ?? []).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="max-w-72">
                      <p className="truncate font-medium">{b.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{b.body}</p>
                    </TableCell>
                    <TableCell>{b.target_label}</TableCell>
                    <TableCell className="num text-right">
                      {b.sent}/{b.recipients}
                      {!b.done && <span className="ml-1 text-xs text-muted-foreground">(stopped)</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.sent_by}</TableCell>
                    <TableCell className="text-sm">
                      <RelativeTime ms={b.created_at} />
                    </TableCell>
                  </TableRow>
                ))}
                {history.data && !history.data.broadcasts.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Nothing sent yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Send this notification?"
        description={
          <>
            <span className="font-medium">{title}</span> goes to {target === "all" ? "everyone in every live salon" : pick?.label} who has notifications switched on. It can&apos;t be taken back.
          </>
        }
        confirmLabel="Send"
        onConfirm={() => {
          setConfirm(false);
          void send();
        }}
      />
    </div>
  );
}

/** Search a salon (or a person, which also sets the salon) by name. */
function Picker({ kind, value, onChange, disabled }: { kind: "org" | "user"; value: Pick | null; onChange: (p: Pick | null) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Pick[]>([]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      papi<{ salons: { id: string; name: string; slug: string }[]; people: { id: number; name: string; org_id: string; salon: string; role: string }[] }>(`/search?q=${encodeURIComponent(t)}`)
        .then((r) => live && setHits(kind === "org" ? r.salons.map((s) => ({ org_id: s.id, label: `${s.name} (${s.slug})` })) : r.people.map((p) => ({ org_id: p.org_id, user_id: p.id, label: `${p.name} · ${p.salon}` }))))
        .catch(() => {});
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, kind]);

  if (value)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        {kind === "org" ? <Building2 className="size-4" /> : <UserRound className="size-4" />}
        <span className="flex-1 truncate">{value.label}</span>
        {!disabled && (
          <button type="button" aria-label="Change" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  return (
    <div className="grid gap-1">
      <Input value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled} placeholder={kind === "org" ? "Search a salon by name or ID" : "Search a person by name or email"} />
      {hits.length > 0 && (
        <ul className="rounded-lg border border-border bg-popover p-1">
          {hits.map((h) => (
            <li key={`${h.org_id}-${h.user_id ?? ""}`}>
              <button type="button" onClick={() => (onChange(h), setQ(""))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                {kind === "org" ? <Building2 className="size-4 text-muted-foreground" /> : <UserRound className="size-4 text-muted-foreground" />}
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

