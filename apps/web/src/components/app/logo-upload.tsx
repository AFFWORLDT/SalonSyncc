"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

const MAX = 200 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Uploads the salon logo (PNG/JPEG/WebP, at most 200 KB; PNGs at most 512 px). Shown in the app, on bills and receipts. */
export function LogoUpload() {
  const { settings, refresh } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE", file?: File) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/logo", { method, credentials: "include", headers: file ? { "Content-Type": file.type } : undefined, body: file });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        throw new ApiError(d?.error ?? `Upload failed (${res.status})`, res.status, d?.code);
      }
      await refresh();
      toast.success(method === "PUT" ? "Logo saved" : "Logo removed");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <LogoMark size={56} src={settings?.logo_url} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {settings?.logo_url ? "Change logo" : "Upload logo"}
          </Button>
          {settings?.logo_url && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => send("DELETE")}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (!TYPES.includes(f.type)) return setError("Use a PNG, JPEG or WebP image");
            if (f.size > MAX) return setError("Logo is too large (max 200 KB)");
            send("PUT", f);
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 200 KB. PNGs up to 512 × 512 px.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
