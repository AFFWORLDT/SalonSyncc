import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "destructive" | "neutral";

const SUCCESS = new Set(["ok", "active", "paid", "success", "connected", "completed"]);
const WARNING = new Set(["limited", "pending", "warning", "processing"]);
const DESTRUCTIVE = new Set(["error", "denied", "cancelled", "canceled", "blocked", "failed"]);

export function statusTone(status: string): StatusTone {
  const s = status.trim().toLowerCase();
  if (SUCCESS.has(s)) return "success";
  if (WARNING.has(s)) return "warning";
  if (DESTRUCTIVE.has(s)) return "destructive";
  return "neutral";
}

const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "", // Badge's destructive variant
  neutral: "bg-muted text-muted-foreground",
};

/** Coloured pill for a status string. `tone` overrides the automatic mapping. */
export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
}) {
  const t = tone ?? statusTone(status);
  return (
    <Badge
      variant={t === "destructive" ? "destructive" : "outline"}
      className={cn("border-transparent capitalize", TONE_CLASS[t], className)}
    >
      {label ?? status}
    </Badge>
  );
}
