"use client";

import { useState } from "react";
import { KeyRound, MoreVertical, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { notifyDataChanged, useApi } from "@/hooks/use-api";
import { pctLabel, phoneLabel } from "@/lib/format";
import type { User } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ErrorState } from "@/components/admin/states";
import { Field } from "@/components/app/field";
import { SimpleSelect } from "@/components/app/simple-select";
import { UserAvatar } from "@/components/app/user-avatar";
import { AvatarPicker } from "@/components/app/avatar-picker";
import { cn } from "@/lib/utils";

export default function BarbersPage() {
  const { settings, user: me } = useAuth();
  const { data, error, reload } = useApi<User[]>("/api/users");
  const [form, setForm] = useState<{ user: User | null } | null>(null);
  const [reset, setReset] = useState<User | null>(null);
  const [remove, setRemove] = useState<User | null>(null);
  const def = settings?.default_commission_pct ?? 0;

  async function setActive(u: User, active: boolean) {
    try {
      await api(`/api/users/${u.id}`, { method: "PUT", body: { ...u, active } });
      notifyDataChanged();
      toast.success(active ? `${u.name} can sign in again` : `${u.name} is now inactive`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function doRemove() {
    if (!remove) return;
    try {
      const r = await api<{ deactivated?: boolean }>(`/api/users/${remove.id}`, { method: "DELETE" });
      notifyDataChanged();
      toast.success(r.deactivated ? `${remove.name} has sales, so they were made inactive (history kept)` : `${remove.name} deleted`);
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
          <h1 className="text-2xl">Barbers</h1>
          <p className="text-sm text-muted-foreground">Shop default commission: {pctLabel(def)} (change in Settings)</p>
        </div>
        <Button onClick={() => setForm({ user: null })}>
          <Plus />
          Add barber
        </Button>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((u) => (
            <Card key={u.id} className={cn("flex-row items-center gap-3 p-4", !u.active && "opacity-60")}>
              <UserAvatar name={u.name} url={u.avatar_url} size={48} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium">
                  {u.name}
                  {u.role === "admin" && <Badge variant="secondary">Admin</Badge>}
                  {!u.active && <Badge variant="outline">Inactive</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  @{u.username}
                  {u.role === "barber" ? ` · ${pctLabel(u.commission_pct ?? def)}${u.commission_pct === null ? " (default)" : ""}` : ""}
                  {u.phone ? ` · ${phoneLabel(u.phone)}` : ""}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${u.name}`} />}>
                  <MoreVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setForm({ user: u })}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setReset(u)}>
                    <KeyRound />
                    Reset password
                  </DropdownMenuItem>
                  {u.id !== me?.id && (
                    <>
                      <DropdownMenuItem onClick={() => setActive(u, !u.active)}>
                        <UserCheck />
                        {u.active ? "Make inactive" : "Make active"}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setRemove(u)}>
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      )}

      <UserDialog state={form} onClose={() => setForm(null)} defaultPct={def} />
      <ResetDialog user={reset} onClose={() => setReset(null)} />
      <ConfirmDialog
        open={!!remove}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete ${remove?.name}?`}
        description="If they have any sales or expenses they are made inactive instead, so old reports stay correct."
        confirmLabel="Delete"
        destructive
        onConfirm={doRemove}
      />
    </div>
  );
}

function UserDialog({ state, onClose, defaultPct }: { state: { user: User | null } | null; onClose: () => void; defaultPct: number }) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{state && <UserForm user={state.user} onDone={onClose} defaultPct={defaultPct} />}</DialogContent>
    </Dialog>
  );
}

function UserForm({ user, onDone, defaultPct }: { user: User | null; onDone: () => void; defaultPct: number }) {
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [touched, setTouched] = useState(!!user);
  const [phone, setPhone] = useState(user?.phone ? phoneLabel(user.phone) : "");
  const [password, setPassword] = useState("");
  const [pct, setPct] = useState(user?.commission_pct === null || user?.commission_pct === undefined ? "" : String(user.commission_pct));
  const [role, setRole] = useState(user?.role ?? "barber");
  const [order, setOrder] = useState(user ? String(user.sort_order) : "");
  const [canAddExpense, setCanAddExpense] = useState(user?.can_add_expense ?? false);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState(user?.avatar_url ?? null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name,
        username,
        phone: phone || null,
        role,
        commission_pct: pct === "" ? null : Number(pct),
        sort_order: order === "" ? undefined : Number(order),
        can_add_expense: canAddExpense,
        ...(user ? { active: user.active } : { password }),
      };
      if (user) await api(`/api/users/${user.id}`, { method: "PUT", body });
      else await api("/api/users", { body });
      notifyDataChanged();
      toast.success(user ? "Saved" : `${name} added. Share the username and password with them.`);
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
        <DialogTitle>{user ? `Edit ${user.name}` : "Add barber"}</DialogTitle>
        <DialogDescription>{user ? "Password is changed with “Reset password”." : "They sign in with this username and password."}</DialogDescription>
      </DialogHeader>
      {user && (
        <AvatarPicker
          name={user.name}
          url={avatar}
          endpoint={`/api/users/${user.id}/avatar`}
          onChange={(u) => {
            setAvatar(u);
            notifyDataChanged();
          }}
        />
      )}
      <Field label="Name" htmlFor="u-name">
        <Input
          id="u-name"
          required
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!touched) setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._@+-]/g, ""));
          }}
          className="h-11"
        />
      </Field>
      <Field label="Username" htmlFor="u-username" hint="Lowercase, no spaces (an email works too)">
        <Input
          id="u-username"
          required
          autoCapitalize="none"
          value={username}
          onChange={(e) => {
            setTouched(true);
            setUsername(e.target.value.toLowerCase().replace(/\s/g, ""));
          }}
          className="h-11"
        />
      </Field>
      {!user && (
        <Field label="Password" htmlFor="u-password" hint="At least 4 characters. They can change it later.">
          <Input id="u-password" required minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Commission %" htmlFor="u-pct" hint={`Empty = default ${pctLabel(defaultPct)}`}>
          <Input id="u-pct" inputMode="decimal" placeholder={String(defaultPct)} value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ""))} className="h-11" />
        </Field>
        <Field label="Column order" htmlFor="u-order" hint="Position in the sheet">
          <Input id="u-order" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value.replace(/\D/g, ""))} className="h-11" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mobile (optional)" htmlFor="u-phone">
          <Input id="u-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" />
        </Field>
        <Field label="Role" htmlFor="u-role">
          <SimpleSelect
            id="u-role"
            label="Role"
            value={role}
            onChange={(v) => setRole(v as User["role"])}
            options={[
              { value: "barber", label: "Barber" },
              { value: "admin", label: "Admin" },
            ]}
            className="h-11 w-full min-w-0"
          />
        </Field>
      </div>
      {role === "barber" && (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="u-exp" className="text-sm font-medium">
              Can add expenses
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">On: adds their own expense from the Today screen. Off: only you add it, from Expenses.</p>
          </div>
          <Switch id="u-exp" checked={canAddExpense} onCheckedChange={setCanAddExpense} />
        </div>
      )}
      <DialogFooter>
        <Button type="submit" className="h-11 sm:h-9" disabled={saving || !name || !username || (!user && password.length < 4)}>
          {saving ? "Saving…" : user ? "Save" : "Add barber"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ResetDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await api(`/api/users/${user.id}/reset-password`, { body: { password } });
      toast.success(`New password set for ${user.name}. They are signed out everywhere.`);
      setPassword("");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>New password for {user?.name} (@{user?.username}).</DialogDescription>
          </DialogHeader>
          <Field label="New password" htmlFor="r-pass">
            <Input id="r-pass" required minLength={4} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving || password.length < 4}>
              {saving ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
