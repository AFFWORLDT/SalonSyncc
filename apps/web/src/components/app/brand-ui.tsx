import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The phone app's deep greens (lib/core/ui/brand.dart kSkDeep / kSkDeeper), the same in light and dark. */
export const DEEP_GREEN = "bg-linear-to-br from-[#0E5A48] to-[#0A3E32]";

/** A row's icon in a soft green circle (SkIconCircle): settings sections, menus, tiles. */
export function IconCircle({ children, className, tone = "green" }: { children: ReactNode; className?: string; tone?: "green" | "gold" | "white" }) {
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
        tone === "green" && "bg-primary/10 text-primary dark:bg-[#7FE3B0]/15 dark:text-[#7FE3B0]",
        tone === "gold" && "bg-[#D9A14E]/15 text-[#B9802F] dark:text-[#D9A14E]",
        tone === "white" && "bg-white/12 text-[#7FE3B0]",
        className
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** A figure tile from the app's Sales screen: icon circle, label, bold value; `hero` paints it deep green. */
export function SummaryTile({ icon, label, value, hero, tone = "green" }: { icon: ReactNode; label: string; value: ReactNode | null; hero?: boolean; tone?: "green" | "gold" }) {
  return (
    <Card className={cn("gap-3 p-5", hero && cn(DEEP_GREEN, "text-white ring-0 shadow-[0_14px_30px_-14px_rgb(10_62_50/0.6)]"))}>
      <IconCircle tone={hero ? "white" : tone}>{icon}</IconCircle>
      <div className="flex flex-col gap-1">
        <p className={cn("text-sm", hero ? "text-white/80" : "text-muted-foreground")}>{label}</p>
        {value === null ? (
          <Skeleton className={cn("h-7 w-24", hero && "bg-white/15")} />
        ) : (
          <p className="num text-xl leading-tight font-extrabold tracking-tight sm:text-2xl">{value}</p>
        )}
      </div>
    </Card>
  );
}
