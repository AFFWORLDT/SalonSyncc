"use client";

import { useMemo, useState } from "react";
import { Megaphone, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { dateTimeLabel } from "@/lib/format";
import type { Announcement, User } from "@/lib/types";
import { UserAvatar } from "@/components/app/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/app/field";
import { ErrorState } from "@/components/admin/states";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WaAnnouncements } from "@/components/app/wa-announcements";
import { FeatureGate } from "@/components/app/feature-gate";

const TITLE_MAX = 80;
const BODY_MAX = 500;

/** Announcements: app notifications to the team, or WhatsApp messages to customers. */
export default function AnnouncementsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"team" | "customers">("team");
  if (!isAdmin) return <p className="py-10 text-center text-sm text-muted-foreground">Announcements are for admins only.</p>;
  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "team" | "customers")}>
        <TabsList>
          <TabsTrigger value="team">Barbers (app)</TabsTrigger>
          <TabsTrigger value="customers">Customers (WhatsApp)</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "team" ? (
        <FeatureGate feature="announcements">
          <TeamAnnouncements />
        </FeatureGate>
      ) : (
        <WaAnnouncements />
      )}
    </div>
  );
}

/** Admin broadcasts: push a message to everyone or to one barber, with a short history of past sends. */
function TeamAnnouncements() {
  const { isAdmin } = useAuth();
  const users = useApi<User[]>(isAdmin ? "/api/users" : null);
  const log = useApi<Announcement[]>(isAdmin ? "/api/announcements" : null);

  const [audience, setAudience] = useState<"all" | "barber">("all");
  const [barberId, setBarberId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const barbers = useMemo(
    () => (users.data ?? []).filter((u) => u.role === "barber" && u.active),
    [users.data]
  );

  if (!isAdmin) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Announcements are for admins only.</p>;
  }

  const ready = title.trim() && body.trim() && (audience === "all" || barberId);

  async function send() {
    if (!ready || sending) return;
    setSending(true);
    try {
      const made = await api<Announcement>("/api/announcements", {
        body: { title: title.trim(), body: body.trim(), audience, barber_id: audience === "barber" ? barberId : undefined },
      });
      const who = made.audience === "all" ? "everyone" : made.target_name ?? "the barber";
      toast.success(`Sent to ${who} · ${made.recipients} ${made.recipients === 1 ? "person" : "people"}`);
      setTitle("");
      setBody("");
      log.setData((d) => [made, ...(d ?? [])]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Compose */}
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="size-4.5" />
          </span>
          <div>
            <p className="text-sm font-semibold">New announcement</p>
            <p className="text-xs text-muted-foreground">A push notification to your team’s devices.</p>
          </div>
        </div>

        <Field label="Send to">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAudience("all")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                audience === "all" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"
              )}
            >
              <Users className="size-4" />
              Everyone
            </button>
            <button
              type="button"
              onClick={() => setAudience("barber")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                audience === "barber" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"
              )}
            >
              <Megaphone className="size-4" />
              One barber
            </button>
          </div>
        </Field>

        {audience === "barber" && (
          <Field label="Which barber">
            {users.loading && !users.data ? (
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}
              </div>
            ) : barbers.length ? (
              <div className="flex flex-wrap gap-2">
                {barbers.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBarberId(b.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-medium transition-colors",
                      barberId === b.id ? "border-primary bg-primary/10 text-primary" : "border-input text-foreground hover:bg-muted"
                    )}
                  >
                    <UserAvatar name={b.name} url={b.avatar_url} size={28} />
                    {b.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active barbers yet.</p>
            )}
          </Field>
        )}

        <Field label="Title" htmlFor="ann-title" hint={`${title.length}/${TITLE_MAX}`}>
          <Input
            id="ann-title"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Shop closed Friday"
          />
        </Field>

        <Field label="Message" htmlFor="ann-body" hint={`${body.length}/${BODY_MAX}`}>
          <Textarea
            id="ann-body"
            value={body}
            maxLength={BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the message your team will see…"
            className="min-h-24"
          />
        </Field>

        <Button onClick={send} disabled={!ready || sending} className="self-end">
          <Send className="size-4" />
          {sending ? "Sending…" : audience === "all" ? "Send to everyone" : "Send"}
        </Button>
      </Card>

      {/* History */}
      <div className="flex flex-col gap-2">
        <p className="px-1 text-sm font-semibold">Sent</p>
        {log.error ? (
          <ErrorState message="Couldn’t load announcements." onRetry={log.reload} />
        ) : log.loading && !log.data ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : log.data && log.data.length ? (
          <div className="flex flex-col gap-2">
            {log.data.map((a) => (
              <Card key={a.id} className="flex flex-col gap-1.5 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <Badge variant={a.audience === "all" ? "secondary" : "outline"} className="shrink-0">
                    {a.audience === "all" ? "Everyone" : a.target_name ?? "Barber"}
                  </Badge>
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{a.body}</p>
                <p className="text-xs text-muted-foreground">
                  {dateTimeLabel(a.created_at)} · {a.recipients} {a.recipients === 1 ? "person" : "people"} · by {a.sender_name}
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-center gap-1 p-8 text-center">
            <Megaphone className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No announcements yet</p>
            <p className="text-xs text-muted-foreground">Your sent messages will show here.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
