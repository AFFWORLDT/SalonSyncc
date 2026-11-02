"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FEATURE_LABELS, type FeatureKey } from "@ss/features";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/admin/states";
import { usePlatformMe } from "@/components/platform/shell";
import { errorMessage } from "@/lib/api";
import { type AdminPlan, papi, usePapi } from "@/lib/platform";

interface Draft {
  name: string;
  price: string;
  stripe: string;
  maxStaff: string;
  active: boolean;
  features: Set<string>;
}
const toDraft = (p: AdminPlan): Draft => ({
  name: p.name,
  price: String(p.price_monthly),
  stripe: p.stripe_price_id ?? "",
  maxStaff: p.limits.max_staff === null ? "" : String(p.limits.max_staff),
  active: p.active,
  features: new Set(p.features),
});

/** Plan editor: name, price, Stripe price, staff limit, active, and the feature matrix (rows features, columns plans). */
export default function PlansPage() {
  const me = usePlatformMe();
  const owner = me.role === "owner";
  const { data, error, reload } = usePapi<{ feature_keys: string[]; plans: AdminPlan[] }>("/plans");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setDrafts(Object.fromEntries(data.plans.map((p) => [p.id, toDraft(p)])));
  }, [data]);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !Object.keys(drafts).length) return <Skeleton className="h-96 rounded-xl" />;
  const set = (id: string, fn: (d: Draft) => Draft) => setDrafts((all) => ({ ...all, [id]: fn(all[id]!) }));
  const dirty = (p: AdminPlan) => JSON.stringify({ ...toDraft(p), features: [...toDraft(p).features].sort() }) !== JSON.stringify({ ...drafts[p.id]!, features: [...drafts[p.id]!.features].sort() });

  async function save(p: AdminPlan) {
    const d = drafts[p.id]!;
    setSaving(p.id);
    try {
      await papi(`/plans/${p.id}`, {
        method: "PUT",
        body: { name: d.name, price_monthly: Number(d.price), stripe_price_id: d.stripe || null, max_staff: d.maxStaff ? Number(d.maxStaff) : null, active: d.active, features: [...d.features] },
      });
      toast.success(`${d.name} saved. Salons on it get the change within a minute.`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">Plans</h1>
        <p className="text-sm text-muted-foreground">What each plan costs and includes. Changes apply to every salon on the plan, no deploy needed.</p>
      </div>
      <Card className="gap-0 overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-semibold">Feature</th>
              {data.plans.map((p) => (
                <th key={p.id} className="px-4 py-3 text-center font-semibold">
                  {drafts[p.id]!.name}
                  <span className="block text-xs font-normal text-muted-foreground">{p.orgs} salons</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            <Field label="Name" plans={data.plans} render={(p) => <Input disabled={!owner} value={drafts[p.id]!.name} maxLength={40} onChange={(e) => set(p.id, (d) => ({ ...d, name: e.target.value }))} className="h-8" />} />
            <Field label={`Price / month (${data.plans[0]?.currency ?? ""})`} plans={data.plans} render={(p) => <Input disabled={!owner} type="number" min={0} value={drafts[p.id]!.price} onChange={(e) => set(p.id, (d) => ({ ...d, price: e.target.value }))} className="h-8" />} />
            <Field label="Max staff (empty = unlimited)" plans={data.plans} render={(p) => <Input disabled={!owner} type="number" min={1} value={drafts[p.id]!.maxStaff} onChange={(e) => set(p.id, (d) => ({ ...d, maxStaff: e.target.value }))} className="h-8" />} />
            <Field label="Stripe price ID" plans={data.plans} render={(p) => <Input disabled={!owner} value={drafts[p.id]!.stripe} placeholder="price_…" onChange={(e) => set(p.id, (d) => ({ ...d, stripe: e.target.value }))} className="h-8" />} />
            <Field label="Shown on pricing" plans={data.plans} render={(p) => <Switch disabled={!owner} checked={drafts[p.id]!.active} onCheckedChange={(v) => set(p.id, (d) => ({ ...d, active: v }))} aria-label={`${p.name} active`} />} />
            {data.feature_keys.map((k) => (
              <Field
                key={k}
                label={FEATURE_LABELS[k as FeatureKey] ?? k}
                plans={data.plans}
                render={(p) => (
                  <Switch
                    aria-label={`${FEATURE_LABELS[k as FeatureKey] ?? k} in ${p.name}`}
                    disabled={!owner || k === "core_sales"}
                    checked={drafts[p.id]!.features.has(k)}
                    onCheckedChange={(v) =>
                      set(p.id, (d) => {
                        const f = new Set(d.features);
                        if (v) f.add(k);
                        else f.delete(k);
                        return { ...d, features: f };
                      })
                    }
                  />
                )}
              />
            ))}
            {owner && (
              <tr>
                <td />
                {data.plans.map((p) => (
                  <td key={p.id} className="px-4 py-3 text-center">
                    <Button size="sm" disabled={!dirty(p) || saving === p.id} onClick={() => save(p)}>
                      {saving === p.id ? "Saving…" : "Save"}
                    </Button>
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Field({ label, plans, render }: { label: string; plans: AdminPlan[]; render: (p: AdminPlan) => React.ReactNode }) {
  return (
    <tr>
      <td className="px-4 py-2 text-muted-foreground">{label}</td>
      {plans.map((p) => (
        <td key={p.id} className="px-4 py-2">
          <div className="flex justify-center">{render(p)}</div>
        </td>
      ))}
    </tr>
  );
}
