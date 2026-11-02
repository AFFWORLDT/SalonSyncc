import { cn } from "@/lib/utils";

/** Shown for anyone who hasn't uploaded a photo yet. */
export const DEFAULT_AVATAR = "/default-avatar.webp";

/** A person's photo (stored in D1), or the default profile picture when there is none. */
export function UserAvatar({ name, url, size = 40, className }: { name: string; url: string | null | undefined; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url || DEFAULT_AVATAR}
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
