import { BookOpen, MessageCircle, Receipt, Sheet, Star, Globe2 } from "lucide-react";

const FEATURES = [
  { icon: Receipt, title: "Bills in seconds", body: "Tap the services, pick the barber, done. Print it, share a link, or send it on WhatsApp." },
  { icon: BookOpen, title: "Commission and payouts", body: "Every bill credits the barber's commission. Pay them out and the ledger stays balanced." },
  { icon: Sheet, title: "Daily sheet and Excel", body: "Sales, expenses, commission and profit per day and per barber, exported in one click." },
  { icon: MessageCircle, title: "WhatsApp that works for you", body: "Bills, visit reminders and announcements from your own WhatsApp Business number." },
  { icon: Star, title: "Ratings and Google reviews", body: "Ask every customer how it went, and send the happy ones to your Google review page." },
  { icon: Globe2, title: "Made for the UAE", body: "AED amounts, 5% VAT and TRN on tax invoices, Dubai time and +971 numbers. Your salon gets its own web address." },
];

/** Six glass cards on the cream canvas with soft green and gold glows behind them. */
export function Features() {
  return (
    <section id="features" className="relative overflow-hidden px-6 py-24 sm:px-12">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-10 size-[520px] rounded-full bg-[#2a9d88]/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 bottom-0 size-[520px] rounded-full bg-[#b8935a]/25 blur-3xl" />
      <div className="relative mx-auto max-w-6xl">
        <h2 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Everything the front desk does, without the notebook.</h2>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">Built with a real Dubai salon, for owners, managers and barbers on their phones.</p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6">
              <f.icon className="size-6 text-primary" aria-hidden />
              <p className="mt-4 text-lg font-semibold">{f.title}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
