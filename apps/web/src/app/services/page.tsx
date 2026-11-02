"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { notifyDataChanged, useApi } from "@/hooks/use-api";
import { money, currencyCode, getFormat, toInput } from "@/lib/format";
import type { Service } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ErrorState } from "@/components/admin/states";
import { Field } from "@/components/app/field";
import { cn } from "@/lib/utils";

/** The services catalogue barbers pick from on a new sale (and that prints on the bill). */
export default function ServicesPage() {
  const { data, error, reload, setData } = useApi<Service[]>("/api/services?all=1");
  const [form, setForm] = useState<{ service: Service | null; category?: string } | null>(null);
  const [remove, setRemove] = useState<Service | null>(null);
  const [starting, setStarting] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, Service[]>();
    for (const s of data ?? []) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [data]);

  async function toggle(s: Service) {
    setData((d) => d?.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)) ?? d);
    try {
      await api(`/api/services/${s.id}`, { method: "PUT", body: { ...s, price: s.price / getFormat().minor, active: !s.active } });
      notifyDataChanged();
    } catch (err) {
      toast.error(errorMessage(err));
      reload();
    }
  }

  async function doRemove() {
    if (!remove) return;
    try {
      await api(`/api/services/${remove.id}`, { method: "DELETE" });
      notifyDataChanged();
      toast.success(`${remove.name} deleted. Old bills keep it.`);
      setRemove(null);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Services</h1>
          <p className="text-sm text-muted-foreground">What barbers pick on a new sale, and what prints on the bill.</p>
        </div>
        <Button onClick={() => setForm({ service: null })}>
          <Plus />
          Add service
        </Button>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card data-testid="services-empty" className="items-center gap-3 p-8 text-center">
          <p className="text-base font-semibold">No services yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Start from a ready-made price list (haircuts, beard, colour…) and change the prices, or add your own.</p>
          <Button
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              try {
                await api("/api/services/starter", { method: "POST" });
                notifyDataChanged();
                toast.success("Starter price list added. Edit the prices to match your salon.");
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setStarting(false);
              }
            }}
          >
            {starting ? "Adding…" : "Add starter price list"}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map(([cat, list]) => (
            <Card key={cat} className="gap-0 p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <p className="font-semibold">{cat}</p>
                <Button variant="ghost" size="sm" onClick={() => setForm({ service: null, category: cat })}>
                  <Plus />
                  Add
                </Button>
              </div>
              <ul className="divide-y">
                {list.map((s) => (
                  <li key={s.id} className={cn("flex items-center gap-3 px-4 py-3", !s.active && "opacity-55")}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setForm({ service: s })}>
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {s.name}
                        {!s.active && <Badge variant="outline">Hidden</Badge>}
                      </p>
                      {s.description && <p className="truncate text-xs text-muted-foreground">{s.description}</p>}
                    </button>
                    <p className="num text-sm font-semibold">{money(s.price)}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`} />}>
                        <MoreVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setForm({ service: s })}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggle(s)}>
                          {s.active ? <EyeOff /> : <Eye />}
                          {s.active ? "Hide from new sales" : "Show again"}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setRemove(s)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          {form && <ServiceForm service={form.service} category={form.category} categories={groups.map(([c]) => c)} onDone={() => setForm(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!remove}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete ${remove?.name}?`}
        description="It disappears from new sales. Bills already made keep the name and price they had. To keep it for later, hide it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={doRemove}
      />
    </div>
  );
}

function ServiceForm({ service, category, categories, onDone }: { service: Service | null; category?: string; categories: string[]; onDone: () => void }) {
  const [cat, setCat] = useState(service?.category ?? category ?? categories[0] ?? "");
  const [name, setName] = useState(service?.name ?? "");
  const [desc, setDesc] = useState(service?.description ?? "");
  const [price, setPrice] = useState(service ? toInput(service.price) : "");
  const [order, setOrder] = useState(service ? String(service.sort_order) : "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { category: cat, name, description: desc || null, price, sort_order: order === "" ? undefined : Number(order), active: service?.active ?? true };
      if (service) await api(`/api/services/${service.id}`, { method: "PUT", body });
      else await api("/api/services", { body });
      notifyDataChanged();
      toast.success(service ? "Service saved" : `${name} added`);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{service ? `Edit ${service.name}` : "Add service"}</DialogTitle>
        <DialogDescription>New prices apply to new sales; old bills keep theirs.</DialogDescription>
      </DialogHeader>
      <Field label="Group" htmlFor="sv-cat" hint="Pick one or type a new group">
        <Input id="sv-cat" list="sv-cats" required value={cat} onChange={(e) => setCat(e.target.value)} className="h-11" />
        <datalist id="sv-cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Name" htmlFor="sv-name">
        <Input id="sv-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
      </Field>
      <Field label="Short description (optional)" htmlFor="sv-desc">
        <Input id="sv-desc" value={desc} onChange={(e) => setDesc(e.target.value)} className="h-11" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Price (${currencyCode()})`} htmlFor="sv-price">
          <Input id="sv-price" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} className="num h-11" />
        </Field>
        <Field label="Order" htmlFor="sv-order" hint="Lower shows first">
          <Input id="sv-order" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value.replace(/\D/g, ""))} className="num h-11" />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" className="h-11 sm:h-9" disabled={saving || !cat.trim() || !name.trim() || price === ""}>
          {saving ? "Saving…" : service ? "Save" : "Add service"}
        </Button>
      </DialogFooter>
    </form>
  );
}
