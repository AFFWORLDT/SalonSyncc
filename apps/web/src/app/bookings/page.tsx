"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, CalendarClock, CalendarRange, Check, Clock3, MessageCircle, MoreHorizontal, Phone, Plus, Settings2, Undo2 } from "lucide-react";
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
import { UserAvatar } from "@/components/app/user-avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  staff_avatar: string | null;
  day: string;
  start: string;
  end: string;
  services: { id: number; name: string; price: number; minutes: number }[];
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_wa: string;
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
  const [tab, setTab] = useState<"bookings" | "settings">("bookings");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {isAdmin && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="bookings">
              <CalendarCheck2 className="size-3.5" /> Bookings
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 className="size-3.5" /> Settings
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {tab === "settings" && isAdmin ? <BookingSettingsCard /> : <BookingBoard />}
    </div>
  );
}

const AHEAD = 30;
const dayBits = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return {
    wd: d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
    dn: d.getUTCDate(),
    mo: d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }),
  };
};
const relDay = (day: string, today: string) => {
  const n = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : null;
};
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Upcoming bookings at a glance: totals, a strip of the next 30 days with a count on each, and the bookings grouped
 * by day. Tapping a day shows just that day; "Upcoming" shows everything from today on. Older days via the date picker.
 */
function BookingBoard() {
  const { isAdmin } = useAuth();
  const [picked, setPicked] = useState<string | null>(null); // null = all upcoming
  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);
  const head = useApi<BookingList>("/api/bookings");
  const today = head.data?.today ?? null;
  const past = !!(picked && today && picked < today);
  const from = past ? picked : today;
  const to = past ? picked : today ? addDays(today, AHEAD) : null;
  const { data, error, reload } = useApi<BookingList>(from && to ? `/api/bookings${qs({ from, to })}` : null);
  const all = useMemo(() => data?.items ?? [], [data]);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const live = all.filter((b) => b.status === "confirmed");
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of all) if (b.status === "confirmed") m.set(b.day, (m.get(b.day) ?? 0) + 1);
    return m;
  }, [all]);
  const week = today ? live.filter((b) => b.day <= addDays(today, 6)).length : 0;
  const todays = today ? live.filter((b) => b.day === today) : [];
  const next = today ? live.find((b) => b.day > today || toMin(b.end) > nowMin) : undefined;
  const revenue = live.reduce((t, b) => t + b.total, 0);

  const shown = all.filter((b) => (picked ? b.day === picked : true)).filter((b) => showClosed || b.status === "confirmed" || (picked !== null && b.status !== "cancelled"));
  const hidden = all.filter((b) => (picked ? b.day === picked : true)).length - shown.length;
  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of shown) m.set(b.day, [...(m.get(b.day) ?? []), b]);
    return [...m.entries()];
  }, [shown]);

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

  if ((error || head.error) && !data) return <ErrorState message={error ?? head.error ?? "Couldn't load bookings"} onRetry={reload} />;
  if (!data || !today) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <>
      {/* At a glance */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "Today", value: todays.length, hint: todays.length ? `next ${ampm(todays.find((b) => toMin(b.end) > nowMin)?.start ?? todays[0].start)}` : "none yet" },
          { label: "Next 7 days", value: week, hint: "booked" },
          { label: "Upcoming", value: live.length, hint: money(revenue) },
        ].map((t) => (
          <Card key={t.label} className="gap-0.5 rounded-2xl p-3 sm:p-4">
            <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
            <p className="num text-2xl font-semibold sm:text-3xl">{t.value}</p>
            <p className="truncate text-xs text-muted-foreground">{t.hint}</p>
          </Card>
        ))}
      </div>

      {next && !picked && (
        <Card className="flex-row items-center gap-3 rounded-2xl border-primary/20 bg-primary/[0.06] p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Clock3 className="size-5" />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">
              Next: {next.customer_name} · {relDay(next.day, today) ?? dayLabel(next.day)}, {ampm(next.start)}
            </p>
            <p className="truncate text-muted-foreground">
              {next.services.map((s) => s.name).join(", ")} with {next.staff_name}
            </p>
          </div>
        </Card>
      )}

      {/* Day strip */}
      <div className="-mx-4 flex items-stretch gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setPicked(null)}
          className={cn("flex w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-xs font-semibold transition", picked === null ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card hover:border-primary/40")}
        >
          <CalendarRange className="mb-1 size-4" />
          Upcoming
        </button>
        {Array.from({ length: AHEAD + 1 }, (_, i) => addDays(today, i)).map((d) => {
          const p = dayBits(d);
          const n = counts.get(d) ?? 0;
          const on = picked === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setPicked(d)}
              className={cn("relative flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 transition", on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card hover:border-primary/40", d === today && !on && "border-primary/50")}
            >
              <span className={cn("text-[11px] uppercase", on ? "opacity-80" : "text-muted-foreground")}>{d === today ? "Today" : p.wd}</span>
              <span className="num text-lg font-semibold leading-tight">{p.dn}</span>
              <span className={cn("mt-0.5 h-4 min-w-4 rounded-full px-1 text-[10px] font-bold leading-4", n ? (on ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground") : "opacity-0")}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateInput aria-label="Go to a date" value={picked ?? ""} onChange={(e) => setPicked(e.target.value || null)} className="h-9 w-40" />
        {hidden > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowClosed(true)}>
            Show {hidden} done or cancelled
          </Button>
        )}
        {showClosed && (
          <Button variant="ghost" size="sm" onClick={() => setShowClosed(false)}>
            Hide done and cancelled
          </Button>
        )}
        {isAdmin && (
          <Button className="ml-auto rounded-full" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add booking
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <Card className="items-center gap-2 rounded-2xl p-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-muted">
            <CalendarClock className="size-7 text-muted-foreground" />
          </span>
          <p className="font-medium">{picked ? `No bookings on ${dayLabel(picked)}` : "No upcoming bookings yet"}</p>
          <p className="max-w-sm text-sm text-muted-foreground">Bookings made on your website appear here straight away, and you get an email for each one.</p>
        </Card>
      ) : (
        groups.map(([d, list]) => (
          <section key={d} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2 px-1 pt-1">
              <h2 className="text-sm font-semibold">{relDay(d, today) ?? dayBits(d).wd}</h2>
              <span className="text-sm text-muted-foreground">
                {dayBits(d).dn} {dayBits(d).mo} · {list.filter((b) => b.status === "confirmed").length} booked
              </span>
            </div>
            {list.map((b) => (
              <BookingCard key={b.id} b={b} onStatus={(s) => setStatus(b, s)} past={d < today || (d === today && toMin(b.end) <= nowMin)} />
            ))}
          </section>
        ))
      )}
      {adding && <AddBooking day={picked ?? today} onClose={() => setAdding(false)} onDone={reload} />}
    </>
  );
}

function BookingCard({ b, onStatus, past }: { b: Booking; onStatus: (s: Status) => void; past: boolean }) {
  const st = STATUS[b.status];
  return (
    <Card className={cn("relative gap-0 overflow-hidden rounded-2xl p-0", b.status === "cancelled" && "opacity-60")}>
      <span className={cn("absolute inset-y-0 left-0 w-1", b.status === "confirmed" ? "bg-primary" : b.status === "completed" ? "bg-sky-500" : b.status === "no_show" ? "bg-amber-500" : "bg-muted-foreground/30")} aria-hidden />
      <div className="flex gap-3 p-4 pl-5">
        <div className="w-[4.5rem] shrink-0">
          <p className="num whitespace-nowrap text-base font-semibold leading-tight sm:text-lg">{ampm(b.start)}</p>
          <p className="text-xs text-muted-foreground">{ampm(b.end)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-base font-semibold">{b.customer_name}</p>
            <Badge className={cn("shrink-0 border-0", st.cls)}>{st.label}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {b.services.map((s) => (
              <span key={s.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                {s.name}
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-sm">
            <UserAvatar name={b.staff_name} url={b.staff_avatar} size={22} />
            <span className="truncate text-muted-foreground">{b.staff_name}</span>
            <span className="ml-auto num font-semibold">{money(b.total)}</span>
          </div>
          {b.note && <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">&ldquo;{b.note}&rdquo;</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t bg-muted/30 px-3 py-2">
        <Button size="sm" variant="ghost" className="h-8 rounded-full" nativeButton={false} render={<a href={`tel:${b.customer_phone}`} />}>
          <Phone className="size-3.5" /> Call
        </Button>
        <Button size="sm" variant="ghost" className="h-8 rounded-full" nativeButton={false} render={<a href={`https://wa.me/${b.customer_wa}`} target="_blank" rel="noopener" />}>
          <MessageCircle className="size-3.5" /> WhatsApp
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {b.source === "website" ? "Website" : "Added by salon"} · {b.ref}
        </span>
        <span className="ml-auto flex gap-1">
          {b.status === "confirmed" ? (
            <>
              <Button size="sm" variant={past ? "default" : "outline"} className="h-8 rounded-full" onClick={() => onStatus("completed")}>
                <Check className="size-3.5" /> Done
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="icon" variant="ghost" className="size-8 rounded-full" aria-label="More actions" />}>
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onStatus("no_show")}>Mark no-show</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => confirm(`Cancel ${b.customer_name}'s booking?`) && onStatus("cancelled")}>
                    Cancel booking
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => onStatus("confirmed")}>
              <Undo2 className="size-3.5" /> Book again
            </Button>
          )}
        </span>
      </div>
    </Card>
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
