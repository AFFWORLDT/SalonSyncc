"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Crown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/states";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SimpleSelect } from "@/components/app/simple-select";
import { PasswordInput } from "@/components/ui/auth-ui";
import { usePlatformMe } from "@/components/platform/shell";
import { errorMessage } from "@/lib/api";
import { papi, pDate, usePapi } from "@/lib/platform";

interface PUser {
  id: number;
  email: string;
  role: "owner" | "support";
  /** The first portal account: above everyone, can never be removed. */
  super_admin?: boolean;
  created_at: number;
}

/** The SalonKit team: owners change anything, support can read and sign in as a salon. */
export default function TeamPage() {
  const me = usePlatformMe();
  const owner = me.role === "owner";
  const { data, error, reload } = usePapi<PUser[]>("/users");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("support");
  const [removing, setRemoving] = useState<PUser | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">Team</h1>
        <p className="text-sm text-muted-foreground">Who can open this panel. Support accounts can look and sign in as a salon, but can&apos;t change plans or delete.</p>
      </div>
      <Card className="gap-0 p-0">
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <Skeleton className="m-4 h-20" />
        ) : (
          <ul className="divide-y">
            {data.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {u.email}
                    {u.id === me.id ? " (you)" : ""}
                    {u.super_admin && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 align-middle text-[11px] font-semibold text-primary">
                        <Crown className="size-3" /> Super admin
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u.role === "owner" ? "Owner" : "Support"} · since {pDate(u.created_at)}
                  </p>
                </div>
                {owner && u.id !== me.id && !u.super_admin && (
                  <Button variant="ghost" size="icon" aria-label={`Remove ${u.email}`} onClick={() => setRemoving(u)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {owner && (
        <Card className="gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">Add someone</p>
            <p className="text-xs text-muted-foreground">We email them the portal link, their email and this password, what their role can do, and not to share it.</p>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await papi<{ emailed?: boolean }>("/users", { body: { email, password, role } });
                if (r.emailed) toast.success(`${email} can now sign in. Their portal link and sign-in were emailed to them.`);
                else toast.warning(`${email} can now sign in, but the email didn't go out. Share the link and password with them yourself.`);
                setEmail("");
                setPassword("");
                reload();
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Input type="email" aria-label="Email" placeholder="name@salonkit.online" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-9 w-64" />
            <Input type="password" aria-label="Password" placeholder="Password (10+ characters)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} className="h-9 w-56" />
            <SimpleSelect label="Role" value={role} onChange={setRole} options={[{ value: "support", label: "Support" }, { value: "owner", label: "Owner" }]} className="h-9 w-32" />
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
        </Card>
      )}

      <Card className="gap-3 p-4">
        <p className="text-sm font-semibold">Your password</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await papi("/me/password", { method: "PUT", body: { current: cur, next } });
              toast.success("Password changed. Other devices are signed out.");
              setCur("");
              setNext("");
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <div className="w-56">
            <PasswordInput id="pw-cur" label="Current" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
          </div>
          <div className="w-56">
            <PasswordInput id="pw-new" label="New (10+ characters)" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
          </div>
          <Button type="submit" size="sm">
            Change
          </Button>
        </form>
      </Card>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove ${removing?.email}?`}
        description="They are signed out and can't open the panel again."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          try {
            await papi(`/users/${removing!.id}`, { method: "DELETE" });
            toast.success("Removed");
            reload();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
