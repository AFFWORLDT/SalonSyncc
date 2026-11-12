import { BarChart3, CreditCard, ReceiptText, Scissors, Star, UserRoundCheck } from "lucide-react";
import type { StripItem } from "./copy";

export const STRIP_ICON: Record<StripItem["icon"], typeof Star> = { bill: ReceiptText, payments: CreditCard, staff: Scissors, reports: BarChart3, regulars: UserRoundCheck, reviews: Star };

/** A minimal line icon for the feature strip. */
export function IconTile({ icon, className = "" }: { icon: StripItem["icon"]; className?: string }) {
  const I = STRIP_ICON[icon];
  return <I className={`size-5 shrink-0 text-[#946226] ${className}`} strokeWidth={1.6} aria-hidden />;
}
