"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@ss/features";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/admin/states";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SimpleSelect } from "@/components/app/simple-select";
import { PLAN_LABEL } from "@/components/platform/org-table";
import { McpCard } from "@/components/platform/mcp-card";
import { usePlatformMe } from "@/components/platform/shell";
import { errorMessage } from "@/lib/api";
import { ROOT_DOMAIN } from "@/lib/brand";
import { actionLabel, type AdminOrg, type AuditItem, papi, pDate, pDateTime, relDays, STATUS_LABEL, statusClass, usePapi } from "@/lib/platform";
import { cn } from "@/lib/utils";

interface Detail {
  org: AdminOrg;
  profile: {
    id: number | null;
    name: string | null;
    username: string | null;
    display_name: string | null;
    contact_phone: string | null;
    address: string | null;
    currency: string | null;
    timezone: string | null;
    provider: string | null;
    current_period_end: number | null;
  } | null;
  overrides: { feature_key: string; enabled: 0 | 1; reason: string | null; set_at: number }[];
  emails: { kind: string; to: string; status: string; sent_at: number | null }[];
  audit: AuditItem[];
  plan_features: string[];
  plan_limits: { max_staff: number | null };
  features: string[];
  limits: { max_staff: number | null };
}

const PLANS = Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }));

/** One salon (/platform/salons/view/?id=…). */
export default function SalonDetailPage() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(new URLSearchParams(window.location.search).get("id") ?? "");
  }, []);
  if (id === null) return <Skeleton className="h-64 rounded-xl" />;
  if (!id) return <ErrorState message="This salon link is incomplete." />;
  return <Detail id={id} />;
}

function Detail({ id }: { id: string }) {
  const me = usePlatformMe();
  const owner = me.role === "owner";
  const { data, error, reload } = usePapi<Detail>(`/orgs/${encodeURIComponent(id)}`);
  const [plan, setPlan] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState("7");
  const [paidUntil, setPaidUntil] = useState("");
  const [staffLimit, setStaffLimit] = useState("");
  const [feature, setFeature] = useState<{ key: FeatureKey; enabled: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96 rounded-xl" />;
  const o = data.org;
  const p = data.profile;
  const chosenPlan = plan ?? o.plan_id;

  async function act(path: string, body: Record<string, unknown> | undefined, ok: string, method = "POST") {
    setBusy(true);
    try {
      await papi(`/orgs/${encodeURIComponent(o.id)}${path}`, { method, body });
      toast.success(ok);
      reload();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function support() {
    // Open the tab inside the click (popup blockers allow that), then point it at the link once it arrives.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const r = await papi<{ url: string }>(`/orgs/${encodeURIComponent(o.id)}/support`, { method: "POST" });
      if (tab) tab.location.href = r.url;
      else window.location.href = r.url;
      toast.success("Signed in as the salon in a new tab (the link works once, for 60 seconds)");
      reload();
    } catch (e) {
      tab?.close();
      toast.error(errorMessage(e));
    }
  }

  const override = (k: string) => data.overrides.find((x) => x.feature_key === k);
  const live = o.status !== "deleted" && o.status !== "deactivated";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/platform/salons/" className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Salons
      </Link>

      <Card className="flex-row flex-wrap items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl">{o.name}</h1>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusClass(o.status))}>{STATUS_LABEL[o.status] ?? o.status}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{PLAN_LABEL[o.plan_id] ?? o.plan_id}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {o.slug} · created {pDate(o.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={ROOT_DOMAIN ? `https://${o.slug}.${ROOT_DOMAIN}/` : `/login/?org=${encodeURIComponent(o.slug)}`} target="_blank" rel="noopener noreferrer" />}>
            <ExternalLink className="size-4" /> Open site
          </Button>
          <Button size="sm" variant="destructive" disabled={!live} onClick={support}>
            <LifeBuoy className="size-4" /> Log in as salon
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-4">
          <p className="text-sm font-semibold">Profile</p>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Row k="Owner" v={p?.name ? `${p.name} (${p.username})` : "—"} />
            <Row k="Email" v={o.owner_email ? <a className="underline" href={`mailto:${o.owner_email}`}>{o.owner_email}</a> : "—"} />
            <Row k="Phone" v={o.owner_phone ?? p?.contact_phone ?? "—"} />
            <Row k="Address" v={p?.address || "—"} />
            <Row k="Country" v={`${o.country} · ${p?.currency ?? ""} · ${p?.timezone ?? ""}`} />
            <Row k="Trial ends" v={o.trial_ends_at ? `${pDate(o.trial_ends_at)} (${relDays(o.trial_ends_at)})` : "—"} />
            <Row k="Grace ends" v={o.grace_ends_at ? `${pDate(o.grace_ends_at)} (${relDays(o.grace_ends_at)})` : "—"} />
            <Row k="Payment" v={p?.provider === "manual" ? `Paid by hand${p.current_period_end ? ` until ${pDate(p.current_period_end)}` : ""}` : p?.provider === "stripe" ? "Stripe" : "None yet"} />
            <Row k="Staff" v={`${o.staff} active · limit ${data.limits.max_staff ?? "unlimited"}`} />
            <Row k="Sales (30 days)" v={`${o.sales_30d} · last ${o.last_sale_at ? relDays(o.last_sale_at) : "never"}`} />
          </dl>
        </Card>

        <Card className="gap-4 p-4">
          <p className="text-sm font-semibold">Subscription</p>
          {!owner && <p className="text-sm text-muted-foreground">Only a platform owner can change this.</p>}
          <fieldset disabled={!owner || busy || o.status === "deleted"} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>Plan</Label>
                <SimpleSelect label="Plan" value={chosenPlan} onChange={setPlan} options={PLANS} className="h-9 w-36" />
              </div>
              <Button size="sm" variant="outline" disabled={chosenPlan === o.plan_id} onClick={() => act("/plan", { plan_id: chosenPlan }, "Plan changed").then(() => setPlan(null))}>
                Change plan
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ext-days">Extend by (days)</Label>
                <Input id="ext-days" type="number" min={1} max={365} value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="h-9 w-24" />
              </div>
              <Button size="sm" variant="outline" onClick={() => act("/extend", { kind: "trial", days: Number(extendDays) }, "Trial extended")}>
                Extend trial
              </Button>
              <Button size="sm" variant="outline" onClick={() => act("/extend", { kind: "grace", days: Number(extendDays) }, "Grace extended")}>
                Extend grace
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paid-until">Paid until (optional)</Label>
                <Input id="paid-until" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} className="h-9 w-40" />
              </div>
              <Button
                size="sm"
                onClick={() => act("/activate", { plan_id: chosenPlan, until: paidUntil ? Date.parse(`${paidUntil}T23:59:59+04:00`) : null }, `Marked as paid on ${PLAN_LABEL[chosenPlan]}`)}
              >
                Mark as paid
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {o.status === "deactivated" ? (
                <Button size="sm" variant="outline" onClick={() => act("/reactivate", undefined, "Salon reactivated")}>
                  Reactivate
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmDeactivate(true)}>
                  Deactivate
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={() => (setTyped(""), setDeleting(true))}>
                Delete salon
              </Button>
            </div>
          </fieldset>
        </Card>
      </div>

      <Card className="gap-0 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Features</p>
          <p className="text-xs text-muted-foreground">
            {o.status === "trial" ? "On trial the salon gets Pro Max (without WhatsApp). " : ""}Overrides win over the plan for this salon only.
          </p>
        </div>
        <ul className="divide-y">
          {FEATURE_KEYS.map((k) => {
            const ov = override(k);
            const inPlan = data.plan_features.includes(k);
            const on = data.features.includes(k);
            return (
              <li key={k} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{FEATURE_LABELS[k]}</p>
                  <p className="text-xs text-muted-foreground">
                    Plan: {inPlan ? "included" : "not included"}
                    {ov ? ` · override ${ov.enabled ? "ON" : "OFF"}${ov.reason ? ` — ${ov.reason}` : ""}` : ""}
                  </p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", on ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{on ? "On" : "Off"}</span>
                <SimpleSelect
                  label={`${FEATURE_LABELS[k]} override`}
                  disabled={!owner || k === "core_sales"}
                  value={ov ? (ov.enabled ? "on" : "off") : "plan"}
                  onChange={(v) => {
                    if (v === "plan") void act(`/features/${k}`, { enabled: null }, "Back to the plan's setting", "PUT");
                    else {
                      setReason("");
                      setFeature({ key: k, enabled: v === "on" });
                    }
                  }}
                  options={[
                    { value: "plan", label: "Follow plan" },
                    { value: "on", label: "Force on" },
                    { value: "off", label: "Force off" },
                  ]}
                  size="sm"
                  className="w-32"
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <McpCard orgId={o.id} on={data.features.includes("mcp_api")} owner={owner} />

      <Card className="flex-row flex-wrap items-end gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Staff limit</p>
          <p className="text-xs text-muted-foreground">
            Plan allows {data.plan_limits.max_staff ?? "unlimited"}.{o.limits_override ? ` Override: ${o.limits_override.max_staff ?? "unlimited"}.` : ""}
          </p>
        </div>
        <fieldset disabled={!owner || busy} className="flex flex-wrap items-end gap-2">
          <Input aria-label="Staff limit" type="number" min={1} max={1000} placeholder="e.g. 15" value={staffLimit} onChange={(e) => setStaffLimit(e.target.value)} className="h-9 w-24" />
          <Button size="sm" variant="outline" disabled={!staffLimit} onClick={() => act("/limits", { max_staff: Number(staffLimit) }, "Staff limit set", "PUT").then(() => setStaffLimit(""))}>
            Set
          </Button>
          <Button size="sm" variant="outline" onClick={() => act("/limits", { max_staff: null }, "Unlimited staff", "PUT")}>
            Unlimited
          </Button>
          <Button size="sm" variant="ghost" disabled={!o.limits_override} onClick={() => act("/limits", { reset: true }, "Back to the plan's limit", "PUT")}>
            Use plan
          </Button>
        </fieldset>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 p-0">
          <p className="border-b px-4 py-3 text-sm font-semibold">Emails</p>
          {data.emails.length ? (
            <ul className="divide-y">
              {data.emails.map((e) => (
                <li key={e.kind} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>
                    {e.kind.replace(/_/g, " ")} <span className="text-muted-foreground">→ {e.to}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.status}
                    {e.sent_at ? ` · ${pDateTime(e.sent_at)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No emails yet.</p>
          )}
        </Card>
        <Card className="gap-0 p-0">
          <p className="border-b px-4 py-3 text-sm font-semibold">Admin changes</p>
          {data.audit.length ? (
            <ul className="divide-y">
              {data.audit.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <span className="font-medium">{a.who}</span> {actionLabel(a.action)}
                  <span className="block text-xs text-muted-foreground">{pDateTime(a.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No admin changes yet.</p>
          )}
        </Card>
      </div>

      <Dialog open={!!feature} onOpenChange={(v) => !v && setFeature(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Force {feature ? FEATURE_LABELS[feature.key] : ""} {feature?.enabled ? "on" : "off"}
            </DialogTitle>
            <DialogDescription>Only for {o.name}. Say why; it stays in the audit trail.</DialogDescription>
          </DialogHeader>
          <Input autoFocus placeholder="e.g. Pilot for WhatsApp bills" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeature(null)}>
              Cancel
            </Button>
            <Button
              disabled={!reason.trim() || busy}
              onClick={async () => {
                if (feature && (await act(`/features/${feature.key}`, { enabled: feature.enabled, reason: reason.trim() }, "Override saved", "PUT"))) setFeature(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title={`Deactivate ${o.name}?`}
        description="Nobody at this salon can sign in until you reactivate it. Its data is kept."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => void act("/deactivate", undefined, "Salon deactivated")}
      />

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {o.name}?</DialogTitle>
            <DialogDescription>
              Nobody can sign in, and the owner&apos;s email becomes free for a new signup. Rows are kept for export. Type <b>{o.slug}</b> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={o.slug} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={typed !== o.slug || busy} onClick={async () => (await act("/delete", { confirm: typed }, "Salon deleted")) && setDeleting(false)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </>
  );
}
