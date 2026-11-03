/**
 * SEO content: the home page FAQ and the feature pages (one page per search a UAE salon owner makes).
 * Every sentence describes what the app really does today; check the code before adding a claim.
 */

export interface Faq {
  q: string;
  a: string;
}

export interface FeaturePage {
  /** URL path segment, e.g. "whatsapp-for-salons" (served at /whatsapp-for-salons/). */
  slug: string;
  /** <title> (the layout adds " · SalonKit"). */
  title: string;
  /** Meta description, ~150 characters. */
  description: string;
  /** Short label for links and the footer. */
  label: string;
  eyebrow: string;
  h1: string;
  lead: string;
  /** Which plan includes it, in words. */
  plan: string;
  /** Icon from /public/icons (png) or one of the drawn marks. */
  icon: "bill" | "wallet" | "sheets" | "whatsapp" | "google-review" | "google-maps";
  sections: { h2: string; body: string; bullets?: string[] }[];
  faqs: Faq[];
}

export const HOME_FAQS: Faq[] = [
  {
    q: "What is SalonKit?",
    a: "SalonKit is salon and barber shop software made in Dubai. The front desk rings up bills, the app works out each barber's commission, keeps the daily sheet, sends WhatsApp bills and reminders, and asks customers for Google reviews. Amounts are in AED with 5% VAT.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Every new salon gets 7 days of Pro Max, our biggest plan, free. No card is needed. After the trial you can stay on the Free plan or choose Pro or Pro Max.",
  },
  {
    q: "Does it work on phones?",
    a: "Yes. SalonKit runs in the browser on any phone, tablet or computer, and you can add it to your home screen like an app. Owners, managers and barbers each sign in with their own username.",
  },
  {
    q: "Can SalonKit make VAT tax invoices in the UAE?",
    a: "Yes. Turn on VAT in Settings, add your TRN, and every bill shows the 5% VAT and your TRN as a tax invoice. You can also show your salon's name in Arabic on bills.",
  },
  {
    q: "Can I send bills and reminders from my own WhatsApp number?",
    a: "Yes, on Pro Max. You connect your salon's WhatsApp Business number, and SalonKit sends the PDF bill after each visit, rating requests, visit reminders and your offers from that number, with your name on them.",
  },
  {
    q: "How does SalonKit work out barber commission?",
    a: "You set each barber's commission percentage once. Every bill credits that barber's share automatically, and the daily sheet shows sales and commission per barber. On Pro Max you also record payouts and see every barber's balance in the ledger.",
  },
  {
    q: "Can I export my sales to Excel?",
    a: "Yes, on Pro and Pro Max. The daily sheet, monthly report and ledger download as Excel (.xlsx) files in one click, ready for your accountant or Google Sheets.",
  },
  {
    q: "How many staff can I add?",
    a: "Up to 2 on Free, up to 10 on Pro, and as many as you like on Pro Max.",
  },
  {
    q: "Is my salon's data private?",
    a: "Each salon has its own web address and its own sign-ins, and one salon can never see another's data. Search engines are told not to index salon apps, bills or receipts.",
  },
  {
    q: "Which cities do you cover?",
    a: "SalonKit is built for salons and barber shops across the UAE: Dubai, Abu Dhabi, Sharjah, Ajman and the Northern Emirates.",
  },
];

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "salon-billing-software-dubai",
    label: "Salon billing software",
    title: "Salon billing software for Dubai and the UAE",
    description: "Ring up salon and barber bills in seconds: your price list, cash or card, numbered bills, print, link or WhatsApp. Made in Dubai, in AED with 5% VAT.",
    eyebrow: "Bills",
    h1: "Salon billing software that keeps up with the front desk",
    lead: "Tap the services, pick the barber, choose cash or card, done. SalonKit numbers the bill, works out VAT and commission, and the day's totals are already up to date.",
    plan: "Billing is on every plan, including Free",
    icon: "bill",
    sections: [
      {
        h2: "A bill in a few taps",
        body: "Add your services and prices once. At the counter, tap what the customer had, or use a quick amount for anything else, choose the barber and how they paid.",
        bullets: ["Your own price list, with one tap per service", "Quick amounts for one-off items", "Cash or card on every bill", "Customer name and phone, or skip them"],
      },
      {
        h2: "Numbered, printable and shareable",
        body: "Every bill gets its own number with your prefix and the date, so there are no gaps or repeats. Print a receipt, share a link the customer can open on their phone, or send the PDF bill on WhatsApp (Pro Max).",
      },
      {
        h2: "Mistakes fixed, changes recorded",
        body: "Owners and managers can edit or delete a bill when something goes wrong. On Pro Max, the audit log keeps every change with who made it and when, so the numbers stay honest.",
      },
      {
        h2: "Totals that are always right",
        body: "Each bill updates the daily sheet, the barber's commission and the shop's cash or bank straight away. No adding up at closing time.",
      },
    ],
    faqs: [
      { q: "Do I need special hardware?", a: "No. SalonKit runs in the browser on the phone, tablet or computer you already have. You can print receipts from any printer the device can use." },
      { q: "Can barbers ring up their own bills?", a: "Yes. Each barber signs in with their own username on their own phone, and owners and managers see the whole salon." },
      { q: "Does the bill include VAT?", a: "When VAT is on, every bill shows the 5% VAT and your TRN, so it works as a UAE tax invoice." },
    ],
  },
  {
    slug: "barber-commission-app",
    label: "Barber commission app",
    title: "Barber commission app: commission, payouts and ledger",
    description: "Work out every barber's commission automatically from each bill, record payouts from cash or bank, and keep a ledger that balances. Built for UAE salons.",
    eyebrow: "Commission and payouts",
    h1: "Barber commission, worked out on every bill",
    lead: "Stop adding up each barber's share at the end of the month. Set the percentage once and SalonKit credits it with every bill.",
    plan: "Commission on every plan · ledger and payouts on Pro Max",
    icon: "wallet",
    sections: [
      {
        h2: "Set each barber's percentage once",
        body: "Give every barber their own commission percentage, or use a default for the whole team. Each bill credits that barber's share automatically, and the bill keeps the rate it was made with, so changing a rate later never rewrites old months.",
      },
      {
        h2: "See what each barber earned today",
        body: "The dashboard and daily sheet show each barber's sales, commission and expenses for the day, the week or the month, so there are no arguments at the end of the month.",
      },
      {
        h2: "Payouts and a ledger that balances (Pro Max)",
        body: "Record what you paid each barber and whether it came from cash or the bank. The ledger shows the shop's cash, the bank and every barber's balance in one place, including expenses and transfers between cash and bank.",
        bullets: ["Payouts from cash or bank", "Every barber's balance, always current", "Shop cash and bank balances", "Every entry traced back to the bill or payout behind it"],
      },
    ],
    faqs: [
      { q: "Can different barbers have different commission?", a: "Yes. Every barber has their own percentage, and you can change it any time. New bills use the new rate." },
      { q: "Are barber expenses taken off?", a: "Barbers' daily expenses are recorded alongside their sales, so the daily sheet shows what each barber earned and spent." },
      { q: "Can I export commission to Excel?", a: "Yes, on Pro and Pro Max. The daily sheet with per-barber commission downloads as an Excel file." },
    ],
  },
  {
    slug: "salon-daily-sheet-excel",
    label: "Daily sheet and Excel reports",
    title: "Salon daily sheet and Excel reports",
    description: "Your salon's daily sheet done automatically: sales per barber, expenses, commission and profit for every day, with monthly reports and one-click Excel export.",
    eyebrow: "Daily sheet and reports",
    h1: "The daily sheet, filled in for you",
    lead: "The notebook page you used to fill in by hand at closing time. SalonKit fills it in as the bills come in.",
    plan: "Daily sheet on every plan · monthly reports and Excel on Pro",
    icon: "sheets",
    sections: [
      {
        h2: "One row per day, one column per barber",
        body: "Each day's sales by barber, the day's expenses, commission and profit, for the whole month at a glance. Your business day ends when your salon closes, 4 am by default, so late-night bills count for the right day.",
      },
      {
        h2: "Monthly and yearly reports (Pro)",
        body: "See sales, expenses and profit month by month for the year, with the previous period next to it, so you know straight away whether this month is better than the last.",
      },
      {
        h2: "Excel in one click (Pro)",
        body: "Download the daily sheet, the monthly report or the ledger as a real Excel (.xlsx) workbook, with proper dates and numbers. Send it to your accountant or open it in Google Sheets.",
      },
    ],
    faqs: [
      { q: "Does it replace my paper sheet?", a: "Yes. Every bill and expense goes straight onto the daily sheet, so there's nothing to copy at the end of the day." },
      { q: "Can I open the export in Google Sheets?", a: "Yes. The export is a standard .xlsx file, which opens in Excel, Google Sheets and Numbers." },
      { q: "What counts as one day?", a: "Your business day ends at the hour you choose (4 am by default), in Dubai time, so a salon open past midnight still gets one clean day." },
    ],
  },
  {
    slug: "whatsapp-for-salons",
    label: "WhatsApp for salons",
    title: "WhatsApp for salons: bills, reminders and offers",
    description: "Send PDF bills, rating requests, visit reminders and offers from your salon's own WhatsApp Business number, automatically. Built for salons in the UAE.",
    eyebrow: "WhatsApp",
    h1: "WhatsApp that works for your salon",
    lead: "Messages go out from your salon's own WhatsApp Business number, with your name and your approved templates, without anyone typing them.",
    plan: "Pro Max",
    icon: "whatsapp",
    sections: [
      {
        h2: "The bill on WhatsApp after every visit",
        body: "As soon as the bill is saved, the customer gets their PDF bill on WhatsApp. No paper, and they always have it on their phone.",
      },
      {
        h2: "Visit reminders that bring customers back",
        body: "Customers who haven't been back in a while get a friendly reminder, after the number of days you choose (15 by default) and at the hour you choose.",
      },
      {
        h2: "Rating requests and Google reviews",
        body: "After a visit, customers get a short message asking how it went, with one reminder if they forget. Every customer is then invited to review you on Google with one tap.",
      },
      {
        h2: "Offers and announcements",
        body: "Send an offer with a picture or video to your customers in one go. Anyone can reply STOP to stop receiving them, and SalonKit respects that automatically.",
      },
      {
        h2: "Your number, your templates",
        body: "You connect your own WhatsApp Business number through Meta. Messages use the templates WhatsApp has approved for your business, so they arrive with your salon's name.",
      },
    ],
    faqs: [
      { q: "Do I need WhatsApp Business?", a: "Yes, a WhatsApp Business number on Meta's WhatsApp Business Platform. You connect it once in SalonKit's Settings." },
      { q: "Who pays for the messages?", a: "WhatsApp's own message charges are billed by Meta to your WhatsApp Business account. WhatsApp sending is included in the Pro Max plan." },
      { q: "Can customers stop the messages?", a: "Yes. Any customer can reply STOP, and SalonKit stops sending them reminders and offers." },
    ],
  },
  {
    slug: "google-reviews-for-salons",
    label: "Google reviews for salons",
    title: "Get more Google reviews for your salon",
    description: "Ask every customer to rate their visit, see ratings per barber, and invite every customer to your Google review page with one tap. Built for UAE salons.",
    eyebrow: "Ratings and Google reviews",
    h1: "More Google reviews, from customers who loved their cut",
    lead: "Ask every customer how it went. Their rating and comment come to you privately, and every customer is invited to review you on Google.",
    plan: "Ratings on Pro · WhatsApp messages on Pro Max",
    icon: "google-review",
    sections: [
      {
        h2: "A \"Rate your visit\" message after every visit",
        body: "On Pro Max, every customer gets a WhatsApp message after their visit with a \"Rate your visit\" button, and one reminder if they don't tap it. No app to install, no account to make.",
      },
      {
        h2: "A one-tap Google review link for everyone",
        body: "Add your Google review link in Settings and the button opens your Google review page, for every customer. Asking everyone, not only happy customers, is what Google's review rules require, and it keeps your reviews honest and safe.",
      },
      {
        h2: "Private ratings per barber",
        body: "Without a Google link, the button opens SalonKit's own rating page, where customers give 1 to 5 stars and a comment that only you see. You get each barber's average and every comment, for any date range, and the Google link is offered to every customer once you add it.",
      },
    ],
    faqs: [
      { q: "Why not send only happy customers to Google?", a: "Google's review rules don't allow it: asking only customers who were happy is called review gating, and Google can remove reviews that were collected that way. SalonKit invites every customer, and still shows you each rating and comment privately, so you can follow up with anyone who had a bad visit." },
      { q: "How do customers get the rating link?", a: "On Pro Max it goes out automatically on WhatsApp after the visit, with one reminder if they haven't rated yet." },
      { q: "Where do I find my Google review link?", a: "In your Google Business Profile, choose 'Ask for reviews' and copy the link, then paste it in SalonKit's Settings." },
    ],
  },
  {
    slug: "salon-vat-invoice-uae",
    label: "VAT invoices for UAE salons",
    title: "Salon VAT invoices in the UAE: 5% VAT and TRN on every bill",
    description: "Salon software made for the UAE: AED amounts, 5% VAT and your TRN on tax invoices, Dubai time, +971 numbers and your salon's Arabic name on bills.",
    eyebrow: "Made for the UAE",
    h1: "VAT invoices and UAE details, already right",
    lead: "Built with a real Dubai salon, so the details that matter in the UAE are there from day one.",
    plan: "Every plan",
    icon: "google-maps",
    sections: [
      {
        h2: "5% VAT and your TRN",
        body: "Turn on VAT in Settings and add your TRN. Every bill then shows the VAT amount and your TRN, so it works as a UAE tax invoice. The VAT rate is 5% by default and can be changed.",
      },
      {
        h2: "AED, Dubai time and your business day",
        body: "Amounts are in dirhams with fils. Times are in Dubai time, and your business day ends at the hour you close, so late-night bills land on the right day.",
      },
      {
        h2: "+971 numbers and Arabic on bills",
        body: "UAE phone numbers work however people type them. You can show your salon's name in Arabic on bills, next to the English name.",
      },
      {
        h2: "Your own web address",
        body: "Your team signs in at yoursalon.salonkit.online, with your logo on the sign-in page, so it feels like your salon's own system.",
      },
    ],
    faqs: [
      { q: "Is SalonKit FTA compliant?", a: "Bills show what a UAE tax invoice needs from the salon: your name, TRN, the VAT rate and amount, and a unique number. Check your own VAT position with your accountant." },
      { q: "Can I turn VAT off?", a: "Yes. If you are not VAT-registered, leave VAT off and bills show plain totals." },
      { q: "Which emirates does it work in?", a: "All of them: Dubai, Abu Dhabi, Sharjah, Ajman and the Northern Emirates." },
    ],
  },
];

export const featurePage = (slug: string) => FEATURE_PAGES.find((p) => p.slug === slug);

/** schema.org FAQPage for a list of questions. */
export function faqJsonLd(faqs: Faq[], inLanguage = "en") {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage,
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
