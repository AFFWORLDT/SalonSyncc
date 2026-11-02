"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { WaConfigView } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi, notifyDataChanged } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "./field";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

/**
 * Connects the salon's own WhatsApp Business number (Meta Cloud API): phone number ID, WABA ID and an access token.
 * The token is write-only: the API never returns it, so the field always starts empty and must be typed to save.
 */
export function WhatsAppConnect() {
  const { refresh } = useAuth();
  const cfg = useApi<WaConfigView | null>("/api/whatsapp/config");
  if (cfg.loading && cfg.data === null && !cfg.error) return <Skeleton className="h-40 rounded-lg" />;
  return <ConnectForm key={cfg.data?.phone_number_id ?? "new"} current={cfg.data} onSaved={async () => { cfg.reload(); await refresh(); notifyDataChanged(); }} />;
}

function ConnectForm({ current, onSaved }: { current: WaConfigView | null; onSaved: () => Promise<void> }) {
  const [phoneId, setPhoneId] = useState(current?.phone_number_id ?? "");
  const [wabaId, setWabaId] = useState(current?.waba_id ?? "");
  const [token, setToken] = useState("");
  const [tests, setTests] = useState((current?.test_numbers ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api("/api/whatsapp/config", { method: "PUT", body: { phone_number_id: phoneId.trim(), waba_id: wabaId.trim(), token: token.trim(), test_numbers: tests.trim() || null } });
      setToken("");
      toast.success("WhatsApp connected");
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api("/api/whatsapp/config", { method: "DELETE" });
      toast.success("WhatsApp disconnected");
      await onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" data-testid="wa-connect">
      <p className="text-sm font-medium">{current ? "Connected number" : "Connect your WhatsApp Business number"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone number ID" htmlFor="wa-pid">
          <Input id="wa-pid" inputMode="numeric" value={phoneId} onChange={(e) => setPhoneId(e.target.value.replace(/\D/g, ""))} className="h-11" />
        </Field>
        <Field label="WhatsApp Business account ID" htmlFor="wa-waba">
          <Input id="wa-waba" inputMode="numeric" value={wabaId} onChange={(e) => setWabaId(e.target.value.replace(/\D/g, ""))} className="h-11" />
        </Field>
      </div>
      <Field label="Access token" htmlFor="wa-token" hint={current?.has_token ? "A token is saved. Type it again to change any of these settings." : "From Meta Business settings → System users."}>
        <Input id="wa-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="h-11" placeholder={current?.has_token ? "••••••••" : ""} />
      </Field>
      <Field label="Test numbers (optional)" htmlFor="wa-tests" hint="While set, only these numbers get messages. Separate with commas.">
        <Input id="wa-tests" value={tests} onChange={(e) => setTests(e.target.value)} className="h-11" />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={busy || !phoneId || !wabaId || !token.trim()}>
          {busy ? "Saving…" : current ? "Save WhatsApp settings" : "Connect"}
        </Button>
        {current && (
          <Button type="button" variant="outline" onClick={() => setConfirm(true)} disabled={busy}>
            Disconnect
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect WhatsApp?"
        description="Bills, reminders and campaigns stop going out from this number until you connect again."
        confirmLabel="Disconnect"
        destructive
        onConfirm={disconnect}
      />
    </div>
  );
}
