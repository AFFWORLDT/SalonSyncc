"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "./user-avatar";

const SIZE = 256;

/** Crops the picked photo to a centred square and shrinks it to a 256px WebP (~10 KB) before upload. */
async function toSquareWebp(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.82));
  // Safari without WebP encoding falls back to JPEG.
  return blob && blob.type === "image/webp" ? blob : (await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85)))!;
}

/**
 * Photo + "Change photo" / "Remove". `endpoint` is /api/me/avatar or /api/users/:id/avatar.
 * Calls onChange with the new URL (or null) after the server saved it.
 */
export function AvatarPicker({
  name,
  url,
  endpoint,
  onChange,
  size = 72,
}: {
  name: string;
  url: string | null;
  endpoint: string;
  onChange: (url: string | null) => void;
  size?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE", body?: Blob) {
    const res = await fetch(endpoint, { method, body, credentials: "include", headers: body ? { "Content-Type": body.type } : undefined });
    const data = (await res.json().catch(() => ({}))) as { avatar_url?: string | null; error?: string };
    if (!res.ok) throw new Error(data.error || "Couldn't save the photo");
    return data.avatar_url ?? null;
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await toSquareWebp(file);
      setPreview(URL.createObjectURL(blob)); // shows at once while it uploads
      onChange(await send("PUT", blob));
      toast.success("Photo updated");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't use that photo"));
    } finally {
      setPreview(null);
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onChange(await send("DELETE"));
      toast.success("Photo removed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar name={name} url={preview ?? url} size={size} className={busy ? "opacity-60" : undefined} />
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose a photo" />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Camera />
          {busy ? "Saving…" : url ? "Change photo" : "Add photo"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
            <Trash2 />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
