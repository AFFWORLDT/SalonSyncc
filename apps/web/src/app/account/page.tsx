"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAppTheme } from "@/components/theme/theme-provider";
import type { Appearance } from "@/components/theme/theme";
import { START_TOUR } from "@/components/app/product-tour";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";
import { AvatarPicker } from "@/components/app/avatar-picker";
import { NotificationsCard } from "@/components/app/notifications-card";
import { PageHeader } from "@/components/admin/page-header";
import { cn } from "@/lib/utils";
import { Crown, ShieldCheck } from "lucide-react";
import { DEEP_GREEN } from "@/components/app/brand-ui";

export default function AccountPage() {
  const { user, settings, isAdmin, refresh, has, readOnly } = useAuth();
  const { appearance, setAppearance } = useAppTheme();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/me/password", { method: "PUT", body: { current, next } });
      toast.success("Password changed");
      setCurrent("");
      setNext("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title="My account" />
      {/* The profile card from the phone app: deep green, a gold role badge, the photo with its buttons. */}
      <section className={`relative overflow-hidden rounded-[26px] ${DEEP_GREEN} p-6 text-white shadow-[0_18px_40px_-18px_rgb(10_62_50/0.6)]`}>
        <div className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-white/[0.06]" aria-hidden />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-2xl font-extrabold tracking-tight">{user?.name}</p>
              <p className="mt-0.5 truncate text-[15px] text-white/75">
                @{user?.username}
                {settings?.display_name ? ` · ${settings.display_name}` : ""}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#D9A14E]/20 px-3 py-1 text-sm font-bold text-[#F2C988] ring-1 ring-[#D9A14E]/40">
              {user?.role === "owner" ? <Crown className="size-4" /> : <ShieldCheck className="size-4" />}
              {user?.role === "owner" ? "Owner" : isAdmin ? "Admin" : "Barber"}
            </span>
          </div>
          <div className="[&_[data-slot=button]]:border-white/25 [&_[data-slot=button]]:bg-white/10 [&_[data-slot=button]]:text-white [&_[data-slot=button]:hover]:bg-white/20">
            {user && <AvatarPicker name={user.name} url={user.avatar_url} endpoint="/api/me/avatar" onChange={() => refresh()} size={80} />}
          </div>
        </div>
      </section>

      {has("push") && !readOnly && <NotificationsCard />}

      <Card>
        <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>A one-minute tour of where everything lives.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              router.push("/");
              setTimeout(() => window.dispatchEvent(new Event(START_TOUR)), 700);
            }}
          >
            Replay the tour
          </Button>
        </CardContent>
      </Card>

      <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {(["system", "light", "dark"] as Appearance[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAppearance(a)}
                className={cn(
                  "h-11 rounded-lg border text-sm font-medium capitalize",
                  appearance === a ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                )}
              >
                {a === "system" ? "Auto" : a}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={change} className="flex flex-col gap-4">
            <Field label="Current password" htmlFor="cur">
              <Input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className="h-11" />
            </Field>
            <Field label="New password" htmlFor="new" hint="At least 4 characters">
              <Input id="new" type="password" autoComplete="new-password" required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} className="h-11" />
            </Field>
            <Button type="submit" className="h-11 self-start" disabled={saving || !current || next.length < 6}>
              {saving ? "Saving…" : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
