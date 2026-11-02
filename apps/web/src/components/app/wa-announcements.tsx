"use client";

import { useState } from "react";
import { FilePlus2, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { dateTimeLabel } from "@/lib/format";
import type {
  WaConfigView,
  WaCampaign,
  WaMessage,
  WaParam,
  WaSlot,
  WaTemplate,
} from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ErrorState } from "@/components/admin/states";
import { Field } from "./field";
import { SimpleSelect } from "./simple-select";
import { WhatsAppIcon } from "./whatsapp-icon";
import { UpgradeCard } from "./upgrade-card";

const SAMPLE_NAME = "Naveed";
type Blank = {
  kind: "text" | "name" | "media";
  text: string;
  preview?: string;
  file?: string;
};

/** Fills {{1}} or {{contact_name}} blanks from a key → value map. */
const fill = (text: string, values: Record<string, string>) =>
  text.replace(
    /\{\{\s*(\d+|[a-z_][a-z0-9_]*)\s*\}\}/g,
    (all, k: string) => values[k] || all,
  );
const slotLabel = (s: WaSlot) =>
  `${s.part === "header" ? "Header " : ""}{{${s.key}}}`;
const STATUS_TONE: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  APPROVED: "default",
  PENDING: "secondary",
  REJECTED: "destructive",
};

/** WhatsApp announcements to customers: pick an approved template, fill its blanks, test, then send to everyone. */
export function WaAnnouncements() {
  const { settings, has } = useAuth();
  // Campaigns need the campaigns feature, WhatsApp itself and a connected number (the API answers 403/409 otherwise).
  const ready = has("whatsapp_campaigns") && has("whatsapp") && !!settings?.wa_ready;
  const templates = useApi<WaTemplate[]>(ready ? "/api/wa/templates" : null);
  const config = useApi<WaConfigView>(ready ? "/api/whatsapp/config" : null);
  const testNumbers = config.data?.test_numbers ?? [];
  const audience = useApi<{ customers: number }>(ready ? "/api/wa/audience" : null);
  const campaigns = useApi<WaCampaign[]>(ready ? "/api/wa/campaigns" : null);
  const [creating, setCreating] = useState(false);

  if (!settings) return <Skeleton className="h-64 rounded-xl" />;
  if (!has("whatsapp_campaigns") || !has("whatsapp")) return <UpgradeCard feature="whatsapp_campaigns" />;
  if (!settings.wa_ready)
    return (
      <Card className="items-center gap-1 p-8 text-center">
        <WhatsAppIcon className="size-8" />
        <p className="text-sm font-medium">Connect WhatsApp in Settings</p>
        <p className="text-xs text-muted-foreground">Add your WhatsApp Business number under Settings → WhatsApp to send announcements.</p>
      </Card>
    );

  return (
    <div className="flex flex-col gap-5">
      {testNumbers.length > 0 && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Test mode: only {testNumbers.join(", ")} gets messages here. Every
          other customer is skipped.
        </p>
      )}

      {templates.error && !templates.data ? (
        <ErrorState message={templates.error} onRetry={templates.reload} />
      ) : !templates.data ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <Compose
          templates={templates.data}
          audience={audience.data?.customers ?? null}
          testDefault={testNumbers[0] ?? ""}
          onSent={() => campaigns.reload()}
        />
      )}

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Templates</p>
            <p className="text-xs text-muted-foreground">
              Meta must approve a template before it can be sent. Approval can
              take minutes to a day.
            </p>
          </div>
          <Button variant="outline" onClick={() => setCreating(true)}>
            <FilePlus2 />
            New
          </Button>
        </div>
        {!templates.data ? (
          <div className="space-y-2 p-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <ul className="divide-y">
            {templates.data.map((t) => (
              <li key={t.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-medium">{t.name}</p>
                  <Badge variant={STATUS_TONE[t.status] ?? "outline"}>
                    {t.status.toLowerCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {t.category.toLowerCase()}
                  </span>
                  {!t.sendable && (
                    <span className="text-xs text-muted-foreground">
                      · can&apos;t be sent from the app
                    </span>
                  )}
                </div>
                {t.header && (
                  <p className="text-xs font-semibold text-muted-foreground">
                    {t.header}
                  </p>
                )}
                <p className="text-xs whitespace-pre-wrap text-muted-foreground">
                  {t.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <History campaigns={campaigns.data} onChange={campaigns.reload} />
      <NewTemplateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={templates.reload}
      />
    </div>
  );
}

function Compose({
  templates,
  audience,
  testDefault,
  onSent,
}: {
  templates: WaTemplate[];
  audience: number | null;
  testDefault: string;
  onSent: () => void;
}) {
  const approved = templates.filter(
    (t) => t.status === "APPROVED" && t.sendable,
  );
  const [name, setName] = useState(approved[0]?.name ?? "");
  const t = approved.find((x) => x.name === name) ?? null;
  const [blanks, setBlanks] = useState<Blank[]>([]);
  const [testTo, setTestTo] = useState(testDefault);
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState<WaCampaign | null>(null);

  // One input per blank (header first); a template change starts them over. The first blank, or one called
  // something like {{contact_name}}, starts as the customer's name.
  const slots = t?.slots ?? [];
  const values: Blank[] = slots.map(
    (s, i) =>
      blanks[i] ?? {
        kind: s.media
          ? "media"
          : i === 0 || (i === 1 && slots[0].media) || s.key.includes("name")
            ? "name"
            : "text",
        text: "",
      },
  );
  const params: WaParam[] = values.map((b) =>
    b.kind === "name" ? { customer_name: true } : { text: b.text },
  );
  const ready = !!t && values.every((b) => b.kind === "name" || b.text.trim());
  const filled = (part: WaSlot["part"]) =>
    Object.fromEntries(
      slots.flatMap((s, i) =>
        s.part === part && !s.media
          ? [
              [
                s.key,
                values[i].kind === "name" ? SAMPLE_NAME : values[i].text.trim(),
              ],
            ]
          : [],
      ),
    );
  const mediaIndex = slots.findIndex((s) => s.media);
  const media = mediaIndex >= 0 ? values[mediaIndex] : null;
  const previewHeader = t?.header ? fill(t.header, filled("header")) : "";
  const preview = t ? fill(t.body, filled("body")) : "";
  const setBlank = (i: number, b: Blank) =>
    setBlanks(values.map((v, k) => (k === i ? b : v)));

  async function sendTest() {
    if (!t) return;
    setBusy("test");
    try {
      const m = await api<WaMessage>("/api/wa/test", {
        body: { template: t.name, params, to: testTo },
      });
      if (m.status === "sent") {
        haptic("success");
        toast.success("Test sent — check that phone's WhatsApp");
      } else toast.error(m.error ?? "Couldn't send the test");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function sendAll() {
    if (!t) return;
    setBusy("send");
    try {
      let k = await api<WaCampaign>("/api/wa/campaigns", {
        body: { template: t.name, params },
      });
      setProgress(k);
      onSent();
      k = await drain(k, setProgress);
      onSent();
      haptic("success");
      toast.success(
        k.queued
          ? "Sending continues in the background"
          : `Done: ${k.sent} sent, ${k.failed} failed, ${k.skipped} skipped`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/15">
          <WhatsAppIcon className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Announcement on WhatsApp</p>
          <p className="text-xs text-muted-foreground">
            {audience === null
              ? "…"
              : `${audience} customer${audience === 1 ? "" : "s"} with a mobile (minus anyone who turned messages off).`}
          </p>
        </div>
      </div>

      {approved.length === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
          No approved templates yet. Create one below; once Meta approves it, it
          shows up here.
        </p>
      ) : (
        <>
          <Field label="Template" htmlFor="wa-tpl">
            <SimpleSelect
              id="wa-tpl"
              label="Template"
              value={name}
              onChange={(v) => {
                setName(v);
                setBlanks([]);
              }}
              options={approved.map((x) => ({ value: x.name, label: x.name }))}
              className="h-11 w-full"
            />
          </Field>
          {values.map((b, i) =>
            slots[i].media ? (
              <MediaPicker
                key={i}
                kind={slots[i].media!}
                value={b}
                onChange={(v) => setBlank(i, v)}
              />
            ) : (
              <Field key={i} label={slotLabel(slots[i])} htmlFor={`wa-p${i}`}>
                <div className="flex gap-2">
                  <SimpleSelect
                    label={slotLabel(slots[i])}
                    value={b.kind}
                    onChange={(v) =>
                      setBlank(i, { ...b, kind: v as Blank["kind"] })
                    }
                    options={[
                      { value: "name", label: "Customer's name" },
                      { value: "text", label: "Text" },
                    ]}
                    className="h-11 w-44 shrink-0"
                  />
                  {b.kind === "text" && (
                    <Input
                      id={`wa-p${i}`}
                      value={b.text}
                      maxLength={300}
                      // WhatsApp rejects new lines inside a filled-in value.
                      onChange={(e) =>
                        setBlank(i, {
                          ...b,
                          text: e.target.value.replace(/[\r\n\t]+/g, " "),
                        })
                      }
                      className="h-11"
                    />
                  )}
                </div>
              </Field>
            ),
          )}
          {t && (
            <div className="rounded-lg bg-[#25D366]/10 p-3 text-sm">
              <p className="mb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Preview
              </p>
              {media?.preview &&
                (slots[mediaIndex].media === "video" ? (
                  <video
                    src={media.preview}
                    className="mb-2 max-h-56 w-full rounded-md bg-black object-contain"
                    controls
                    muted
                    playsInline
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.preview}
                    alt=""
                    className="mb-2 max-h-56 w-full rounded-md object-cover"
                  />
                ))}
              {previewHeader && (
                <p className="mb-1 font-semibold">{previewHeader}</p>
              )}
              <p className="whitespace-pre-wrap">{preview}</p>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Test number" htmlFor="wa-test">
              <Input
                id="wa-test"
                inputMode="tel"
                placeholder="+91 95115 06049"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="h-11 w-52"
              />
            </Field>
            <Button
              variant="outline"
              className="h-11"
              disabled={!ready || !testTo.trim() || !!busy}
              onClick={sendTest}
            >
              <Send />
              {busy === "test" ? "Sending…" : "Send test"}
            </Button>
            <Button
              className="h-11 sm:ml-auto"
              disabled={!ready || !audience || !!busy}
              onClick={() => setConfirm(true)}
            >
              <Users />
              {busy === "send"
                ? "Sending…"
                : `Send to ${audience ?? "…"} customers`}
            </Button>
          </div>
          {progress && <CampaignProgress k={progress} />}
        </>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Send to ${audience ?? 0} customers?`}
        description="Each customer gets this WhatsApp message from the salon's number. This can't be undone. Meta charges per message."
        confirmLabel="Send now"
        onConfirm={sendAll}
      />
    </Card>
  );
}

/** Picks a picture or video for a media header and uploads it to WhatsApp right away; the value is Meta's media id. */
function MediaPicker({
  kind,
  value,
  onChange,
}: {
  kind: "image" | "video" | "document";
  value: Blank;
  onChange: (b: Blank) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const accept =
    kind === "video"
      ? "video/mp4"
      : kind === "image"
        ? "image/jpeg,image/png"
        : "application/pdf";
  const what =
    kind === "video"
      ? "Video (MP4, up to 16 MB)"
      : kind === "image"
        ? "Picture (JPG or PNG, up to 5 MB)"
        : "PDF";
  return (
    <Field
      label={what}
      htmlFor="wa-media"
      hint={
        value.text
          ? `Uploaded: ${value.file}`
          : "It's sent at the top of the message"
      }
    >
      <Input
        id="wa-media"
        type="file"
        accept={accept}
        disabled={uploading}
        className="h-11 py-2"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploading(true);
          onChange({ kind: "media", text: "", file: file.name });
          try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch("/api/wa/media", {
              method: "POST",
              body: form,
              credentials: "include",
            });
            const data = (await res.json().catch(() => ({}))) as {
              id?: string;
              error?: string;
            };
            if (!res.ok || !data.id)
              throw new Error(data.error ?? "Upload failed");
            onChange({
              kind: "media",
              text: data.id,
              file: file.name,
              preview: URL.createObjectURL(file),
            });
            toast.success("Uploaded to WhatsApp");
          } catch (err) {
            toast.error(errorMessage(err));
            e.target.value = "";
          } finally {
            setUploading(false);
          }
        }}
      />
      {uploading && (
        <p className="text-xs text-muted-foreground">
          Uploading… (a video can take a minute)
        </p>
      )}
    </Field>
  );
}

/** Calls /next until nothing is queued; gives up (the hourly job finishes) if three calls in a row make no progress. */
async function drain(
  k: WaCampaign,
  onProgress: (k: WaCampaign) => void,
): Promise<WaCampaign> {
  let stuck = 0;
  while (k.queued > 0 && stuck < 3) {
    const next = await api<WaCampaign>(`/api/wa/campaigns/${k.id}/next`, {
      method: "POST",
    });
    stuck = next.queued < k.queued ? 0 : stuck + 1;
    k = next;
    onProgress(k);
  }
  return k;
}

function CampaignProgress({ k }: { k: WaCampaign }) {
  const done = k.total - k.queued;
  return (
    <div className="flex flex-col gap-1.5">
      <Progress value={k.total ? (done / k.total) * 100 : 100} />
      <p className="text-xs text-muted-foreground">
        {done} of {k.total} · {k.sent} sent · {k.failed} failed · {k.skipped}{" "}
        skipped
      </p>
    </div>
  );
}

function History({
  campaigns,
  onChange,
}: {
  campaigns: WaCampaign[] | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  if (!campaigns?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Sent announcements</p>
      {campaigns.map((k) => (
        <Card key={k.id} className="flex flex-col gap-2 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-sm font-medium">{k.template}</p>
            {k.queued > 0 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy === k.id}
                onClick={async () => {
                  setBusy(k.id);
                  try {
                    await drain(k, () => onChange());
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setBusy(null);
                    onChange();
                  }
                }}
              >
                {busy === k.id ? "Sending…" : "Continue sending"}
              </Button>
            ) : (
              <Badge variant="secondary">done</Badge>
            )}
          </div>
          <CampaignProgress k={k} />
          <p className="text-xs text-muted-foreground">
            {dateTimeLabel(k.created_at)}
            {k.created_by_name ? ` · by ${k.created_by_name}` : ""}
          </p>
        </Card>
      ))}
    </div>
  );
}

function NewTemplateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <NewTemplateForm
            onDone={() => {
              onOpenChange(false);
              onCreated();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewTemplateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY">(
    "MARKETING",
  );
  const [body, setBody] = useState("Hi {{1}}, ");
  const [examples, setExamples] = useState<string[]>([SAMPLE_NAME]);
  const [saving, setSaving] = useState(false);
  const vars = Math.max(
    0,
    ...Array.from(body.matchAll(/\{\{(\d+)\}\}/g), (m) => Number(m[1])),
  );
  const ex = Array.from({ length: vars }, (_, i) => examples[i] ?? "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api("/api/wa/templates", {
            body: { name, category, body, examples: ex },
          });
          toast.success("Sent to Meta for approval");
          onDone();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>New WhatsApp template</DialogTitle>
        <DialogDescription>
          Use {"{{1}}"}, {"{{2}}"}… for the parts you fill in when sending (e.g.
          the customer&apos;s name). A blank can&apos;t be the very first or
          last thing in the message.
        </DialogDescription>
      </DialogHeader>
      <Field
        label="Name"
        htmlFor="nt-name"
        hint="Lower case and _, e.g. eid_offer"
      >
        <Input
          id="nt-name"
          required
          value={name}
          onChange={(e) =>
            setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
          }
          className="h-11"
        />
      </Field>
      <Field
        label="Type"
        htmlFor="nt-cat"
        hint="Offers and news are Marketing. Updates about a visit are Utility."
      >
        <SimpleSelect
          id="nt-cat"
          label="Type"
          value={category}
          onChange={(v) => setCategory(v as "MARKETING" | "UTILITY")}
          options={[
            { value: "MARKETING", label: "Marketing" },
            { value: "UTILITY", label: "Utility" },
          ]}
          className="h-11 w-full"
        />
      </Field>
      <Field label="Message" htmlFor="nt-body">
        <Textarea
          id="nt-body"
          rows={5}
          required
          maxLength={1024}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      {ex.map((v, i) => (
        <Field
          key={i}
          label={`Example for {{${i + 1}}}`}
          htmlFor={`nt-ex${i}`}
          hint="Meta's reviewer sees this"
        >
          <Input
            id={`nt-ex${i}`}
            required
            value={v}
            onChange={(e) =>
              setExamples(ex.map((x, k) => (k === i ? e.target.value : x)))
            }
            className="h-11"
          />
        </Field>
      ))}
      <DialogFooter>
        <Button type="submit" disabled={saving || !name || !body.trim()}>
          {saving ? "Submitting…" : "Submit for approval"}
        </Button>
      </DialogFooter>
    </form>
  );
}
