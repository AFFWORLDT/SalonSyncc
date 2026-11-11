"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Phone, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api";
import { notifyDataChanged, useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { dayLabel, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FeatureGate } from "@/components/app/feature-gate";
import { DateInput } from "@/components/app/date-input";
import { Field } from "@/components/app/field";
import { SimpleSelect } from "@/components/app/simple-select";
import { ErrorState } from "@/components/admin/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Status = "confirmed" | "completed" | "no_show" | "cancelled";
interface Booking {
  id: number;
  ref: string;
  staff_id: number;
  staff_name: string;
  day: string;
  start: string;
  end: string;
  services: { id: number; name: string; price: number; minutes: number }[];
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  note: string | null;
  status: Status;
  source: "website" | "manual";
  created_at: number;
}
interface BookingList {
  today: string;
  items: Booking[];
}
interface BookingSettings {
  hours: ({ open: string; close: string } | null)[];
  slot_min: number;
  lead_min: number;
  days_ahead: number;
  default_duration: number;
  durations: Record<string, number>;
  staff: number[] | null;
  notify_email: string | null;
  site_origins: string[];
  wa_template: string | null;
  api_base: string;
  all_staff: { id: number; name: string; role: string }[];
  services: { id: number; category: string; name: string; price: number }[];
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  confirmed: { label: "Booked", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  completed: { label: "Done", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  no_show: { label: "No-show", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground line-through" },
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ampm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
};
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

/** Online bookings from the salon's website, plus bookings the salon adds by hand. */
export default function BookingsPage() {
  return (
    <FeatureGate feature="online_bookings">
      <BookingsInner />
    </FeatureGate>
  );
}

function BookingsInner() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"day" | "upcoming" | "settings">("day");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="upcoming">Next 14 days</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="settings">
              <Settings2 className="size-3.5" /> Settings
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>
      {tab === "settings" && isAdmin ? <BookingSettingsCard /> : <BookingList mode={tab === "day" ? "day" : "upcoming"} />}
    </div>
  );
}

function BookingList({ mode }: { mode: "day" | "upcoming" }) {
  const { isAdmin } = useAuth();
  const [day, setDay] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const first = useApi<BookingList>(day ? null : "/api/bookings");
  const base = day ?? first.data?.today ?? null;
  const from = base;
  const to = base && mode === "upcoming" ? addDays(base, 13) : base;
  const { data, error, reload } = useApi<BookingList>(from && to ? `/api/bookings${qs({ from, to })}` : null);
  const items = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of items) m.set(b.day, [...(m.get(b.day) ?? []), b]);
    return [...m.entries()];
  }, [items]);
  const active = items.filter((b) => b.status === "confirmed");

  async function setStatus(b: Booking, status: Status) {
    try {
      await api(`/api/bookings/${b.id}`, { method: "PATCH", body: { status } });
      toast.success(status === "confirmed" ? "Booking restored" : `Marked ${STATUS[status].label.toLowerCase()}`);
      notifyDataChanged();
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if ((error || first.error) && !data) return <ErrorState message={error ?? first.error ?? "Couldn't load bookings"} onRetry={reload} />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {mode === "day" && base && (
          <>
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDay(addDays(base, -1))}>
              <ChevronLeft />
            </Button>
            <DateInput aria-label="Day" value={base} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-9 w-40" />
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setDay(addDays(base, 1))}>
              <ChevronRight />
            </Button>
            {data && base !== data.today && (
              <Button variant="ghost" size="sm" onClick={() => setDay(null)}>
                Today
              </Button>
            )}
          </>
        )}
        <span className="text-sm text-muted-foreground">
          {data ? `${active.length} booked${items.length > active.length ? `, ${items.length - active.length} other` : ""}` : ""}
        </span>
        {isAdmin && (
          <Button className="ml-auto" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add booking
          </Button>
        )}
      </div>

      {!data ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : items.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <CalendarClock className="size-8 text-muted-foreground" />
          <p className="font-medium">{mode === "day" ? `No bookings on ${dayLabel(base!)}` : "No bookings in the next 14 days"}</p>
          <p className="text-sm text-muted-foreground">Bookings made on your website appear here straight away, and you get an email for each one.</p>
        </Card>
      ) : (
        groups.map(([d, list]) => (
          <section key={d} className="flex flex-col gap-2">
            {mode === "upcoming" && <h2 className="px-1 text-sm font-semibold text-muted-foreground">{dayLabel(d)}</h2>}
            {list.map((b) => (
              <Card key={b.id} className={cn("flex-row gap-4 p-4", b.status === "cancelled" && "opacity-60")}>
                <div className="w-16 shrink-0 text-center">
                  <p className="num text-lg font-semibold leading-tight">{ampm(b.start)}</p>
                  <p className="text-xs text-muted-foreground">to {ampm(b.end)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{b.customer_name}</p>
                    <Badge className={cn("border-0", STATUS[b.status].cls)}>{STATUS[b.status].label}</Badge>
                    {b.source === "website" && <Badge variant="outline">Website</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {b.services.map((s) => s.name).join(", ")} · with {b.staff_name} · {money(b.total)}
                  </p>
                  {b.note && <p className="mt-1 text-sm italic text-muted-foreground">&ldquo;{b.note}&rdquo;</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <a href={`tel:${b.customer_phone}`} className="inline-flex items-center gap-1 font-medium text-primary">
                      <Phone className="size-3.5" /> {b.customer_phone}
                    </a>
                    <a href={waLink(b.customer_phone)} target="_blank" rel="noopener" className="font-medium text-primary">
                      WhatsApp
                    </a>
                    <span className="text-xs text-muted-foreground">Ref {b.ref}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {b.status === "confirmed" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setStatus(b, "completed")}>
                          Done
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setStatus(b, "no_show")}>
                          No-show
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(`Cancel ${b.customer_name}'s booking?`) && setStatus(b, "cancelled")}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(b, "confirmed")}>
                        Mark as booked again
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </section>
        ))
      )}
      {adding && base && <AddBooking day={base} onClose={() => setAdding(false)} onDone={reload} />}
    </>
  );
}

function AddBooking({ day: initialDay, onClose, onDone }: { day: string; onClose: () => void; onDone: () => void }) {
  const { data } = useApi<BookingSettings>("/api/bookings/settings");
  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState("10:00");
  const [staff, setStaff] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/bookings", { body: { day, time, staff: Number(staff), services: picked, name, phone, note } });
      toast.success("Booking added");
      notifyDataChanged();
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a booking</DialogTitle>
        </DialogHeader>
        {!data ? (
          <Skeleton className="h-60" />
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="bk-day">
                <DateInput id="bk-day" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              </Field>
              <Field label="Time" htmlFor="bk-time">
                <Input id="bk-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
            <Field label="With">
              <SimpleSelect label="Staff" placeholder="Choose staff" value={staff} onChange={setStaff} options={data.all_staff.map((s) => ({ value: String(s.id), label: s.name }))} />
            </Field>
            <Field label="Services">
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2">
                {data.services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox checked={picked.includes(s.id)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                    <span className="flex-1">{s.name}</span>
                    <span className="num text-muted-foreground">{money(s.price)}</span>
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client name" htmlFor="bk-name">
                <Input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Mobile" htmlFor="bk-phone">
                <Input id="bk-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
            <Field label="Note (optional)" htmlFor="bk-note">
              <Textarea id="bk-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button disabled={saving || !staff || !picked.length || !name.trim() || !phone.trim()} onClick={save}>
            {saving ? "Saving…" : "Add booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingSettingsCard() {
  const { data, error, reload } = useApi<BookingSettings>("/api/bookings/settings");
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96 rounded-xl" />;
  return <SettingsForm key={JSON.stringify(data)} initial={data} onSaved={reload} />;
}

function SettingsForm({ initial, onSaved }: { initial: BookingSettings; onSaved: () => void }) {
  const [hours, setHours] = useState(initial.hours);
  const [slot, setSlot] = useState(String(initial.slot_min));
  const [lead, setLead] = useState(String(initial.lead_min));
  const [ahead, setAhead] = useState(String(initial.days_ahead));
  const [dur, setDur] = useState(String(initial.default_duration));
  const [durations, setDurations] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial.durations).map(([k, v]) => [k, String(v)])));
  const [staff, setStaff] = useState<number[] | null>(initial.staff);
  const [email, setEmail] = useState(initial.notify_email ?? "");
  const [origins, setOrigins] = useState(initial.site_origins.join("\n"));
  const [tpl, setTpl] = useState(initial.wa_template ?? "");
  const [saving, setSaving] = useState(false);
  const barbers = initial.all_staff.filter((s) => s.role === "barber").map((s) => s.id);
  const chosen = staff ?? barbers;

  async function save() {
    setSaving(true);
    try {
      await api("/api/bookings/settings", {
        method: "PUT",
        body: {
          hours,
          slot_min: Number(slot),
          lead_min: Number(lead),
          days_ahead: Number(ahead),
          default_duration: Number(dur),
          durations: Object.fromEntries(Object.entries(durations).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)])),
          staff,
          notify_email: email.trim() || null,
          site_origins: origins.split(/[\s,]+/).filter(Boolean),
          wa_template: tpl.trim() || null,
        },
      });
      toast.success("Booking settings saved");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3 p-5">
        <p className="font-semibold">Opening hours for bookings</p>
        {DAYS.map((d, i) => {
          const h = hours[i];
          return (
            <div key={d} className="flex flex-wrap items-center gap-3">
              <Switch checked={!!h} onCheckedChange={(on) => setHours((x) => x.map((v, j) => (j === i ? (on ? { open: "10:00", close: "22:00" } : null) : v)))} aria-label={`Open on ${d}`} />
              <span className="w-24 text-sm">{d}</span>
              {h ? (
                <>
                  <Input type="time" className="h-9 w-28" value={h.open} onChange={(e) => setHours((x) => x.map((v, j) => (j === i && v ? { ...v, open: e.target.value } : v)))} aria-label={`${d} opens`} />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input type="time" className="h-9 w-28" value={h.close} onChange={(e) => setHours((x) => x.map((v, j) => (j === i && v ? { ...v, close: e.target.value } : v)))} aria-label={`${d} closes`} />
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </div>
          );
        })}
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Time between start times" hint="Minutes, e.g. 30 shows 10:00, 10:30, 11:00…">
          <Input type="number" min={5} max={120} value={slot} onChange={(e) => setSlot(e.target.value)} />
        </Field>
        <Field label="Minimum notice" hint="Minutes before a booking can start">
          <Input type="number" min={0} max={2880} value={lead} onChange={(e) => setLead(e.target.value)} />
        </Field>
        <Field label="Book up to" hint="Days ahead">
          <Input type="number" min={1} max={120} value={ahead} onChange={(e) => setAhead(e.target.value)} />
        </Field>
        <Field label="Default service length" hint="Minutes, for services without their own length">
          <Input type="number" min={5} max={600} value={dur} onChange={(e) => setDur(e.target.value)} />
        </Field>
      </Card>

      <Card className="gap-3 p-5">
        <p className="font-semibold">Service lengths</p>
        <p className="text-sm text-muted-foreground">How long each service takes, in minutes. Empty uses the default ({dur} min).</p>
        <div className="grid gap-2">
          {initial.services.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="flex-1 text-sm">
                {s.name} <span className="text-muted-foreground">· {s.category}</span>
              </span>
              <Input type="number" min={5} max={600} placeholder={dur} className="h-9 w-24" value={durations[s.id] ?? ""} onChange={(e) => setDurations((d) => ({ ...d, [s.id]: e.target.value }))} aria-label={`${s.name} minutes`} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="gap-3 p-5">
        <p className="font-semibold">Who takes online bookings</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {initial.all_staff.map((s) => (
            <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
              <Checkbox checked={chosen.includes(s.id)} onCheckedChange={(v) => setStaff(v ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))} />
              {s.name} <span className="text-muted-foreground">({s.role})</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4 p-5">
        <Field label="Email for booking alerts" hint="Every new booking is emailed here. Empty sends to the owner's email.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@salon.com" />
        </Field>
        <Field label="Your website addresses" hint="One per line, e.g. https://styleeleganzladiessalon.com. Only these sites can show your booking form.">
          <Textarea rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)} />
        </Field>
        <Field label="WhatsApp confirmation template (optional)" hint="An approved template with 4 values: client's first name, salon, date and time, services. Empty sends no WhatsApp.">
          <Input value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder="booking_confirmed" />
        </Field>
        <Field label="Booking API for your website">
          <Input readOnly value={initial.api_base} onFocus={(e) => e.currentTarget.select()} />
        </Field>
      </Card>

      <div className="flex justify-end">
        <Button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
