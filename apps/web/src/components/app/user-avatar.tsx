import { cn } from "@/lib/utils";

/** Shown for anyone who hasn't uploaded a photo yet. */
export const DEFAULT_AVATAR = "/default-avatar.webp";

/** The stock profile pictures (public/avatars). Each person without a photo gets one, always the same one. */
export const STOCK_AVATARS = Array.from({ length: 9 }, (_, i) => `/avatars/avatar-${i + 1}.jpg`);

/** A stable pick from STOCK_AVATARS for a name (the same person keeps the same picture on every screen). */
export function stockAvatar(name: string): string {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STOCK_AVATARS[h % STOCK_AVATARS.length]!;
}

/** A person's photo (stored in D1), or their stock profile picture when there is none. */
export function UserAvatar({ name, url, size = 40, className }: { name: string; url: string | null | undefined; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url || (name.trim() ? stockAvatar(name) : DEFAULT_AVATAR)}
      alt={url ? name : ""}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full bg-muted object-cover", className)}
    />
  );
}
