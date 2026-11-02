import { cn } from "@/lib/utils";

/** The salon's logo (settings.logo_url) on a white disc, or the product mark when the salon has none. */
export function LogoMark({ size = 28, className, src }: { size?: number; className?: string; src?: string | null }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || "/icon.svg"}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full bg-white object-contain ring-1 ring-black/10 dark:ring-white/15", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** The large round badge for the login screen. */
export function LogoBadge({ size = 96, className, src, alt = "" }: { size?: number; className?: string; src?: string | null; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || "/icon.svg"}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full bg-white object-contain ring-1 ring-black/10 dark:ring-white/15", className)}
      style={{ width: size, height: size }}
    />
  );
}
