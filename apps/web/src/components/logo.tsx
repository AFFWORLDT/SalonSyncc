import { cn } from "@/lib/utils";

/** FM Salon mark: the bearded face from the logo, on a white disc. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full bg-white ring-1 ring-black/10 dark:ring-white/15", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** The full round badge ("Faizan Mohammed · Hair Cuts · Gents Salon"). */
export function LogoBadge({ size = 96, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Faizan Mohammed Gents Salon"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full bg-white ring-1 ring-black/10 dark:ring-white/15", className)}
      style={{ width: size, height: size }}
    />
  );
}
