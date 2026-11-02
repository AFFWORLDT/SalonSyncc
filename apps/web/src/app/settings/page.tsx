"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { notifyDataChanged } from "@/hooks/use-api";
import { aed, fillTemplate } from "@/lib/format";
import type { Settings, WaReminderRun } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/field";
import { SimpleSelect } from "@/components/app/simple-select";

export default function SettingsPage() {
  const { settings } = useAuth();
  if (!settings)
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  return <SettingsForm initial={settings} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const { refresh } = useAuth();
  const [s, setS] = useState(initial);
  const [quick, setQuick] = useState(initial.quick_amounts.join(", "));
  const [vatPct, setVatPct] = useState(String(Math.round(initial.vat_rate * 10000) / 100));
  const [saleMin, setSaleMin] = useState(initial.notify_sale_min ? String(initial.notify_sale_min / 100) : "");
  const [saving, setSaving] = useState(false);
  const [waDays, setWaDays] = useState(String(initial.wa_reminder_days));
  const [running, setRunning] = useState(false);
  const [askingFeedback, setAskingFeedback] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...s,
        vat_rate: Number(vatPct) / 100,
        notify_sale_min: Math.round((Number(saleMin) || 0) * 100),
        wa_reminder_days: Number(waDays) || 0,
        quick_amounts: quick
          .split(/[,\s]+/)
          .map(Number)
          .filter((n) => n > 0),
      };
      await api("/api/settings", { method: "PUT", body });
      await refresh();
      notifyDataChanged();
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const preview = fillTemplate(s.thank_you_text, { name: "Ali", amount: aed(2500), salon: s.salon_name, barber: "Sonu", link: `${typeof window !== "undefined" ? window.location.origin : ""}/r/?t=…` });

  return (
    <form onSubmit={save} className="flex max-w-2xl flex-col gap-5 pb-20">
      <h1 className="text-2xl">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Applies to new sales. Old sales keep the commission and VAT they were made with.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Default commission %" htmlFor="s-pct" hint="Used for barbers without their own % (set per barber on the Barbers page).">
            <Input
              id="s-pct"
              inputMode="decimal"
              value={String(s.default_commission_pct)}
              onChange={(e) => set("default_commission_pct", Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
              className="h-11 max-w-32"
            />
          </Field>
          <Field label="Quick amounts (AED)" htmlFor="s-quick" hint="Buttons on the New sale screen, separated by commas.">
            <Input id="s-quick" value={quick} onChange={(e) => setQuick(e.target.value)} className="h-11" />
          </Field>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="s-vat" className="text-sm font-medium">
                VAT on receipts
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">On: receipts are tax invoices with TRN and VAT included in the price. Off: simple receipt.</p>
            </div>
            <Switch id="s-vat" checked={s.vat_enabled} onCheckedChange={(v) => set("vat_enabled", v)} />
          </div>
          {s.vat_enabled && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="VAT %" htmlFor="s-vatpct">
                <Input id="s-vatpct" inputMode="decimal" value={vatPct} onChange={(e) => setVatPct(e.target.value.replace(/[^\d.]/g, ""))} className="h-11" />
              </Field>
              <Field label="TRN (15 digits)" htmlFor="s-trn">
                <Input id="s-trn" inputMode="numeric" value={s.trn ?? ""} onChange={(e) => set("trn", e.target.value.replace(/\D/g, "").slice(0, 15) || null)} className="h-11" />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Business</CardTitle>
          <CardDescription>
            {s.wa_ready
              ? "Messages go from the salon's WhatsApp number using templates approved by Meta. Save to apply changes."
              : "Not connected on this server yet."}
          </CardDescription>
        </CardHeader>
        {s.wa_ready && (
          <CardContent className="flex flex-col gap-3">
            {s.wa_test_numbers && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Test mode: only {s.wa_test_numbers} gets messages here. Everyone else is skipped.
              </p>
            )}
            <NotifyRow
              id="wa-bill"
              label="Send bills on WhatsApp"
              hint="After a sale with a customer mobile, the bill (with its PDF) goes out automatically."
              checked={s.wa_bill_auto}
              onChange={(v) => set("wa_bill_auto", v)}
            />
            <NotifyRow
              id="wa-reminder"
              label="Visit reminders"
              hint="A friendly “time for a fresh cut?” to customers who haven't been back."
              checked={s.wa_reminder_enabled}
              onChange={(v) => set("wa_reminder_enabled", v)}
            >
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Days after the last visit" htmlFor="wa-days">
                  <Input id="wa-days" inputMode="numeric" value={waDays} onChange={(e) => setWaDays(e.target.value.replace(/\D/g, ""))} className="h-11 w-28" />
                </Field>
                <HourPicker id="wa-hour" value={s.wa_reminder_hour} onChange={(h) => set("wa_reminder_hour", h)} />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={running}
                  onClick={async () => {
                    setRunning(true);
                    try {
                      const r = await api<WaReminderRun>("/api/wa/reminders/run", { method: "POST" });
                      toast.success(r.due ? `Reminders: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed` : "No customers are due for a reminder today");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    } finally {
                      setRunning(false);
                    }
                  }}
                >
                  {running ? "Sending…" : "Send due reminders now"}
                </Button>
              </div>
            </NotifyRow>
            <NotifyRow
              id="wa-feedback"
              label="Ask for a rating"
              hint="The customer gets a “Rate your visit” button that opens the salon’s Google review page. If they don’t tap it, one reminder follows (9 AM-10 PM only), never more."
              checked={s.wa_feedback_enabled}
              onChange={(v) => set("wa_feedback_enabled", v)}
            >
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Send it" htmlFor="wa-fb-delay">
                  <SimpleSelect
                    id="wa-fb-delay"
                    label="Send it"
                    value={String(s.wa_feedback_delay_min)}
                    onChange={(v) => set("wa_feedback_delay_min", Number(v))}
                    options={FEEDBACK_DELAYS}
                    className="h-11 w-full sm:w-56"
                  />
                </Field>
                <Field label="If not rated" htmlFor="wa-fb-reminder">
                  <SimpleSelect
                    id="wa-fb-reminder"
                    label="If not rated"
                    value={String(s.wa_feedback_reminder_min)}
                    onChange={(v) => set("wa_feedback_reminder_min", Number(v))}
                    options={FEEDBACK_REMINDERS}
                    className="h-11 w-full sm:w-56"
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={askingFeedback}
                  onClick={async () => {
                    setAskingFeedback(true);
                    try {
                      const r = await api<WaReminderRun>("/api/wa/feedback/run", { method: "POST" });
                      toast.success(r.due ? `Rating requests: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed` : "No bills are due for a rating request yet");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    } finally {
                      setAskingFeedback(false);
                    }
                  }}
                >
                  {askingFeedback ? "Sending…" : "Send due requests now"}
                </Button>
              </div>
            </NotifyRow>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Google review link" htmlFor="s-google" hint="Where “Rate your visit” in WhatsApp takes the customer">
                <Input id="s-google" inputMode="url" placeholder="https://search.google.com/local/writereview?placeid=…" value={s.google_review_url ?? ""} onChange={(e) => set("google_review_url", e.target.value.trim() || null)} className="h-11" />
              </Field>
              <Field label="Instagram link" htmlFor="s-insta" hint="On the PDF bill">
                <Input id="s-insta" inputMode="url" placeholder="https://www.instagram.com/…" value={s.instagram_url ?? ""} onChange={(e) => set("instagram_url", e.target.value.trim() || null)} className="h-11" />
              </Field>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp thank-you</CardTitle>
          <CardDescription>After a sale with a mobile number, the barber taps “Send on WhatsApp” and the message opens ready to send.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="s-wa" className="text-sm font-medium">
              Show the WhatsApp button
            </Label>
            <Switch id="s-wa" checked={s.whatsapp_mode === "link"} onCheckedChange={(v) => set("whatsapp_mode", v ? "link" : "off")} />
          </div>
          <Field label="Message" htmlFor="s-thanks" hint="You can use {name} {amount} {salon} {barber} {link}">
            <Textarea id="s-thanks" rows={4} value={s.thank_you_text} onChange={(e) => set("thank_you_text", e.target.value)} />
          </Field>
          <div className="rounded-lg bg-[#25D366]/10 p-3 text-sm">
            <p className="font-mono mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
            <p className="whitespace-pre-wrap">{preview}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Sent to phones that turned notifications on in My account. Times are Dubai time.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <NotifyRow id="n-sales" label="New bill created" hint="A push to the admin whenever any bill is rung up." checked={s.notify_sales} onChange={(v) => set("notify_sales", v)}>
            <Field label="Only sales of at least (AED)" htmlFor="n-min" hint="Leave empty for every sale">
              <Input id="n-min" inputMode="decimal" placeholder="Every sale" value={saleMin} onChange={(e) => setSaleMin(e.target.value.replace(/[^\d.]/g, ""))} className="h-11 sm:w-48" />
            </Field>
          </NotifyRow>
          <NotifyRow id="n-summary" label="End-of-day summary" hint="Sales, profit and top barber, to the admin." checked={s.notify_summary} onChange={(v) => set("notify_summary", v)}>
            <HourPicker id="n-summary-h" value={s.summary_hour} onChange={(h) => set("summary_hour", h)} />
          </NotifyRow>
          <NotifyRow id="n-reminder" label="Reminder to barbers" hint="Only barbers with no sale logged yet that day." checked={s.notify_reminder} onChange={(v) => set("notify_reminder", v)}>
            <HourPicker id="n-reminder-h" value={s.reminder_hour} onChange={(h) => set("reminder_hour", h)} />
          </NotifyRow>
          <NotifyRow id="n-changes" label="Tell a barber when you change or delete their sale" checked={s.notify_barber_changes} onChange={(v) => set("notify_barber_changes", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salon details</CardTitle>
          <CardDescription>Shown on receipts.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Salon name" htmlFor="s-name">
            <Input id="s-name" required value={s.salon_name} onChange={(e) => set("salon_name", e.target.value)} className="h-11" />
          </Field>
          <Field label="Name in Arabic" htmlFor="s-ar">
            <Input id="s-ar" dir="rtl" value={s.salon_name_ar ?? ""} onChange={(e) => set("salon_name_ar", e.target.value || null)} className="h-11" />
          </Field>
          <Field label="Tagline" htmlFor="s-tag">
            <Input id="s-tag" value={s.tagline ?? ""} onChange={(e) => set("tagline", e.target.value || null)} className="h-11" />
          </Field>
          <Field label="Address" htmlFor="s-addr">
            <Input id="s-addr" value={s.address ?? ""} onChange={(e) => set("address", e.target.value || null)} className="h-11" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" htmlFor="s-phone">
              <Input id="s-phone" type="tel" value={s.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} className="h-11" />
            </Field>
            <Field label="Licence no." htmlFor="s-lic">
              <Input id="s-lic" value={s.licence_no ?? ""} onChange={(e) => set("licence_no", e.target.value || null)} className="h-11" />
            </Field>
          </div>
          <Field label="Receipt footer" htmlFor="s-foot">
            <Input id="s-foot" value={s.receipt_footer ?? ""} onChange={(e) => set("receipt_footer", e.target.value || null)} className="h-11" />
          </Field>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center px-4 lg:static lg:justify-start lg:px-0">
        <Button type="submit" size="lg" className="h-12 w-full max-w-2xl shadow-lg lg:w-auto lg:shadow-none" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

const FEEDBACK_DELAYS = [
  { value: "0", label: "Right after the bill" },
  { value: "30", label: "30 minutes after" },
  { value: "60", label: "1 hour after" },
  { value: "120", label: "2 hours after" },
  { value: "180", label: "3 hours after" },
  { value: "240", label: "4 hours after" },
  { value: "720", label: "12 hours after" },
];

const FEEDBACK_REMINDERS = [
  { value: "0", label: "No reminder" },
  { value: "60", label: "One reminder after 1 hour" },
  { value: "120", label: "One reminder after 2 hours" },
  { value: "180", label: "One reminder after 3 hours" },
  { value: "360", label: "One reminder after 6 hours" },
];

const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

function HourPicker({ id, value, onChange }: { id: string; value: number; onChange: (h: number) => void }) {
  return (
    <Field label="Send at" htmlFor={id}>
      <SimpleSelect
        id={id}
        label="Send at"
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
        options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }))}
        className="h-11 w-full sm:w-48"
      />
    </Field>
  );
}

/** One notification switch; its extra options show only while it is on. */
function NotifyRow({
  id,
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
          </Label>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      {checked && children}
    </div>
  );
}
