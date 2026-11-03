/* eslint-disable @next/next/no-img-element -- static brand icons from /public/icons; next/image is off in static export */
import { FeatureShaderCards, type ShaderFeature } from "@/components/ui/feature-shader-cards";
import { BillIcon, GoogleSheetsIcon, WalletIcon } from "@/components/ui/brand-icons";

const img = (src: string, alt: string, className?: string) => <img src={src} alt={alt} width={160} height={160} loading="lazy" className={className} />;

const FEATURES: ShaderFeature[] = [
  {
    icon: <BillIcon />,
    title: "Bills in seconds",
    description: "Tap the services, pick the barber, done. Print it, share a link, or send it on WhatsApp.",
    colors: ["#0f2e29", "#1f7a6a", "#2a9d88", "#cfe9e2"],
    details: {
      href: "/salon-billing-software-dubai/",
      plan: "Every plan",
      lead: "A bill takes a few taps at the front desk, on a phone, tablet or computer.",
      points: [
        { title: "Your price list, one tap each", body: "Pick services from your own list, or use quick amounts for anything else. Choose the barber and cash or card." },
        { title: "Numbered for you", body: "Every bill gets its own number with your prefix and the date, so nothing is missed or repeated." },
        { title: "Print, link or WhatsApp", body: "Print a receipt, share a link the customer can open, or send the PDF bill on WhatsApp (Pro Max)." },
        { title: "Changes are recorded", body: "Edits and deleted bills are kept in the audit log, with who did it and when (Pro Max)." },
      ],
    },
  },
  {
    icon: <WalletIcon />,
    title: "Commission and payouts",
    description: "Every bill credits the barber's commission. Pay them out and the ledger stays balanced.",
    colors: ["#2b2114", "#8c6a3a", "#b8935a", "#f2dcae"],
    details: {
      href: "/barber-commission-app/",
      plan: "Commission on every plan · ledger and payouts on Pro Max",
      lead: "No more working out each barber's share at the end of the month.",
      points: [
        { title: "Commission per barber", body: "Set each barber's percentage once. Every bill credits their share automatically." },
        { title: "Payouts from cash or bank", body: "Record what you paid and where it came from. Each barber's balance updates straight away." },
        { title: "A ledger that balances", body: "Shop cash, bank and every barber's balance in one place, including expenses and transfers between cash and bank." },
      ],
    },
  },
  {
    icon: <GoogleSheetsIcon />,
    title: "Daily sheet and Excel",
    description: "Sales, expenses, commission and profit per day and per barber, exported in one click.",
    colors: ["#0b2e1a", "#0f9d58", "#34a853", "#c8f0d4"],
    details: {
      href: "/salon-daily-sheet-excel/",
      plan: "Daily sheet on every plan · reports and Excel on Pro",
      lead: "The notebook page you used to fill in by hand, done for you every day.",
      points: [
        { title: "One row per day", body: "Each barber's sales, the day's expenses, commission and profit, for the whole month at a glance." },
        { title: "Monthly and yearly reports", body: "See how each month and the year are going, with the previous period to compare." },
        { title: "Excel in one click", body: "Download the sheet for your accountant, or open it in Excel or Google Sheets." },
      ],
    },
  },
  {
    icon: img("/icons/whatsapp.png", "WhatsApp"),
    iconTile: false,
    title: "WhatsApp that works for you",
    description: "Bills, visit reminders and announcements from your own WhatsApp Business number.",
    colors: ["#06302a", "#128c7e", "#25d366", "#dcf8c6"],
    details: {
      href: "/whatsapp-for-salons/",
      plan: "Pro Max",
      lead: "Messages go out from your salon's own WhatsApp Business number, with your name on them.",
      points: [
        { title: "Bill after every visit", body: "The customer gets their PDF bill on WhatsApp as soon as the sale is saved." },
        { title: "Visit reminders", body: "Customers who haven't been back in a while get a friendly reminder, after the number of days you choose." },
        { title: "Offers and announcements", body: "Send an offer or a picture to your customers in one go. Anyone can reply STOP to opt out." },
      ],
    },
  },
  {
    icon: img("/icons/google-review.png", "Google reviews", "size-12! max-w-none"),
    title: "Ratings and Google reviews",
    description: "Ask every customer how it went, and send the happy ones to your Google review page.",
    colors: ["#2e2105", "#b8860b", "#fbbc04", "#fff1c2"],
    details: {
      href: "/google-reviews-for-salons/",
      plan: "Pro",
      lead: "Hear from every customer, and turn happy ones into Google reviews.",
      points: [
        { title: "A rating after each visit", body: "Customers rate their visit from 1 to 5 stars and can leave a comment. One gentle reminder goes out if they forget." },
        { title: "Ratings per barber", body: "See each barber's average and read every comment, so you know who's delighting customers." },
        { title: "More Google reviews", body: "Happy customers are taken straight to your Google review page to share it there too." },
      ],
    },
  },
  {
    icon: img("/icons/google-maps.png", "Google Maps"),
    title: "Made for the UAE",
    description: "AED amounts, 5% VAT and TRN on tax invoices, Dubai time and +971 numbers. Your salon gets its own web address.",
    colors: ["#0c1f33", "#1a73e8", "#1f7a6a", "#a8c7fa"],
    details: {
      href: "/salon-vat-invoice-uae/",
      plan: "Every plan",
      lead: "Built with a real Dubai salon, so the details are already right.",
      points: [
        { title: "AED and 5% VAT", body: "Amounts in dirhams. Turn on VAT and bills become tax invoices with your TRN." },
        { title: "Your business day", body: "Dubai time, and a day that ends when your salon closes, even after midnight." },
        { title: "+971 numbers and Arabic", body: "UAE phone numbers work as people type them, and your salon's Arabic name can go on bills." },
        { title: "Your own web address", body: "Your team signs in at yoursalon.salonkit.online, with your logo on the page." },
      ],
    },
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
