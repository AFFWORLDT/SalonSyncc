import { cn } from "@/lib/utils";

/** The salon's logo (settings.logo_url) on a white disc, or the SalonKit "S" mark when the salon has none. */
const MARK = "/brand/mark.png";
export function LogoMark({ size = 28, className, src }: { size?: number; className?: string; src?: string | null }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || MARK}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full object-contain ring-1 ring-black/10 dark:ring-white/15", src ? "bg-white" : "bg-black", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** The large round badge for the login screen. */
export function LogoBadge({ size = 96, className, src, alt = "" }: { size?: number; className?: string; src?: string | null; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || MARK}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full object-contain ring-1 ring-black/10 dark:ring-white/15", src ? "bg-white" : "bg-black", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** The full SalonKit wordmark (black artwork), for brand screens like login. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/salonkit-logo.jpg" alt="SalonKit" width={900} height={300} className={cn("h-auto w-full max-w-[280px] rounded-xl", className)} />
  );
}
