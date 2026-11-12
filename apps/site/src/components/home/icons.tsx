import { BarChart3, MessageCircle, ReceiptText, Scissors, Star } from "lucide-react";
import type { StripItem } from "./copy";

export const STRIP_ICON: Record<StripItem["icon"], typeof Star> = { bill: ReceiptText, staff: Scissors, reports: BarChart3, whatsapp: MessageCircle, reviews: Star };

/** A gold-on-cream round icon tile. */
export function IconTile({ icon, className = "" }: { icon: StripItem["icon"]; className?: string }) {
  const I = STRIP_ICON[icon];
  return (
    <span className={`grid size-12 shrink-0 place-items-center rounded-2xl border border-[#c58a45]/20 bg-gradient-to-b from-[#fbf1e3] to-[#f3e1c8] text-[#8a5a22] shadow-[inset_0_1px_0_#fff] ${className}`}>
      <I className="size-5" strokeWidth={1.8} aria-hidden />
    </span>
  );
}
