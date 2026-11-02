import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";

/** A labelled money figure (salon currency). `tone` colours the value; `hint` is a small line under it; `action` sits at the top right. */
export function MoneyTile({
  label,
  value,
  hint,
  tone,
  big,
  className,
  action,
}: {
  label: string;
  value: number | null;
  hint?: React.ReactNode;
  tone?: "success" | "destructive" | "primary";
  big?: boolean;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-1.5 p-4", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
        {action}
      </div>
      {value === null ? (
        <Skeleton className={cn("w-24", big ? "h-9" : "h-7")} />
      ) : (
        <p
          className={cn(
            "num leading-none font-semibold",
            big ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl",
            tone === "success" && "text-success",
            tone === "destructive" && "text-destructive",
            tone === "primary" && "text-primary"
          )}
        >
          {money(value)}
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
