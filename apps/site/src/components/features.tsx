import { FeatureShaderCards, type ShaderFeature } from "@/components/ui/feature-shader-cards";
import { BillIcon, GoogleMapsIcon, GoogleRatingIcon, GoogleSheetsIcon, WalletIcon, WhatsAppIcon } from "@/components/ui/brand-icons";

const FEATURES: ShaderFeature[] = [
  {
    icon: <BillIcon />,
    title: "Bills in seconds",
    description: "Tap the services, pick the barber, done. Print it, share a link, or send it on WhatsApp.",
    colors: ["#0f2e29", "#1f7a6a", "#2a9d88", "#cfe9e2"],
  },
  {
    icon: <WalletIcon />,
    title: "Commission and payouts",
    description: "Every bill credits the barber's commission. Pay them out and the ledger stays balanced.",
    colors: ["#2b2114", "#8c6a3a", "#b8935a", "#f2dcae"],
  },
  {
    icon: <GoogleSheetsIcon />,
    title: "Daily sheet and Excel",
    description: "Sales, expenses, commission and profit per day and per barber, exported in one click.",
    colors: ["#0b2e1a", "#0f9d58", "#34a853", "#c8f0d4"],
  },
  {
    icon: <WhatsAppIcon />,
    title: "WhatsApp that works for you",
    description: "Bills, visit reminders and announcements from your own WhatsApp Business number.",
    colors: ["#06302a", "#128c7e", "#25d366", "#dcf8c6"],
  },
  {
    icon: <GoogleRatingIcon />,
    title: "Ratings and Google reviews",
    description: "Ask every customer how it went, and send the happy ones to your Google review page.",
    colors: ["#2e2105", "#b8860b", "#fbbc04", "#fff1c2"],
  },
  {
    icon: <GoogleMapsIcon />,
    title: "Made for the UAE",
    description: "AED amounts, 5% VAT and TRN on tax invoices, Dubai time and +971 numbers. Your salon gets its own web address.",
    colors: ["#0c1f33", "#1a73e8", "#1f7a6a", "#a8c7fa"],
  },
];

/** Six shader cards on the cream canvas with soft green and gold glows behind them. */
export function Features() {
  return (
    <section id="features" className="relative overflow-hidden px-6 py-24 sm:px-12">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-10 size-[520px] rounded-full bg-[#2a9d88]/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 bottom-0 size-[520px] rounded-full bg-[#b8935a]/25 blur-3xl" />
      <div className="relative mx-auto max-w-6xl">
        <h2 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Everything the front desk does, without the notebook.</h2>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">Built with a real Dubai salon, for owners, managers and barbers on their phones.</p>
        <FeatureShaderCards features={FEATURES} className="mt-12" />
      </div>
    </section>
  );
}
