/* eslint-disable @next/next/no-img-element -- static icons from /public/icons; next/image is off in static export */
import type { FeaturePage } from "@/lib/content";
import { BillIcon, GoogleSheetsIcon, WalletIcon } from "@/components/ui/brand-icons";

/** A feature page's icon on its tile (WhatsApp is already a tile). */
export function FeatureIcon({ icon, size = 56 }: { icon: FeaturePage["icon"]; size?: number }) {
  if (icon === "whatsapp") return <img src="/icons/whatsapp.png" alt="WhatsApp" width={size} height={size} className="rounded-2xl shadow-lg shadow-black/15" />;
  const inner = Math.round(size * 0.62);
  const body =
    icon === "bill" ? <BillIcon width={inner} height={inner} />
    : icon === "wallet" ? <WalletIcon width={inner} height={inner} />
    : icon === "sheets" ? <GoogleSheetsIcon width={inner} height={inner} />
    : <img src={`/icons/${icon}.png`} alt="" width={icon === "google-review" ? Math.round(size * 0.8) : inner} height={icon === "google-review" ? Math.round(size * 0.8) : inner} />;
  return (
    <div className="grid shrink-0 place-items-center rounded-2xl bg-white shadow-lg shadow-black/10 ring-1 ring-black/5" style={{ width: size, height: size }}>
      {body}
    </div>
  );
}
