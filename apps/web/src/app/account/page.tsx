"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAppTheme } from "@/components/theme/theme-provider";
import type { Appearance } from "@/components/theme/theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";
import { AvatarPicker } from "@/components/app/avatar-picker";
import { NotificationsCard } from "@/components/app/notifications-card";
import { PageHeader } from "@/components/admin/page-header";
import { cn } from "@/lib/utils";

export default function AccountPage() {
  const { user, isAdmin, refresh } = useAuth();
  const { appearance, setAppearance } = useAppTheme();
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
      <Card>
        <CardHeader>
          <CardTitle>{user?.name}</CardTitle>
          <CardDescription>
            @{user?.username} · {user?.role === "owner" ? "Owner" : isAdmin ? "Admin" : "Barber"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user && <AvatarPicker name={user.name} url={user.avatar_url} endpoint="/api/me/avatar" onChange={() => refresh()} size={80} />}
        </CardContent>
      </Card>

      <NotificationsCard />

      <Card>
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
