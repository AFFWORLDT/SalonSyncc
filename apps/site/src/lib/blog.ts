/**
 * The blog (/blog/). One post per search a UAE salon owner makes. Posts are content blocks, not Markdown, so the
 * static export needs no parser. Rules: what SalonKit does must match the app; tax and legal points must match the
 * FTA's published rules, with a pointer to an accountant; no made-up statistics or customer quotes.
 */

export type Block =
  | { h2: string }
  | { h3: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { table: { head: string[]; rows: string[][]; caption?: string; /** Bold the last row (a total). */ total?: boolean } }
  | { tip: string }
  /** A link to one of the feature pages (or any path) with a short sentence. */
  | { cta: { text: string; href: string; label: string } };

export interface Post {
  slug: string;
  title: string;
  /** Shorter title for search results (60 characters or less), when `title` is longer. */
  seoTitle?: string;
  /** Meta description, about 150 characters. */
  description: string;
  /** ISO date published (and updated, when it changes). */
  date: string;
  updated?: string;
  minutes: number;
  tag: string;
  /** The feature page this post leads to. */
  feature: string;
  intro: string;
  body: Block[];
}

export const POSTS: Post[] = [
  {
    slug: "how-to-get-more-google-reviews-for-your-salon",
    title: "How to get more Google reviews for your salon (the right way)",
    seoTitle: "How to get more Google reviews for your salon",
    description: "Practical ways for UAE salons and barber shops to get more Google reviews, what Google's rules forbid, and how to reply to good and bad reviews.",
    date: "2026-11-04",
    minutes: 6,
    tag: "Marketing",
    feature: "google-reviews-for-salons",
    intro:
      "When someone in Dubai searches for a barber or salon near them, Google Maps shows the star rating and the number of reviews before anything else. More recent, real reviews help you show up and get chosen. Here is how to get them without breaking Google's rules.",
    body: [
      { h2: "Why reviews matter for a salon" },
      {
        ul: [
          "They are the first thing people see in Google Maps and local search results.",
          "Recent reviews show you are busy and still good today, not three years ago.",
          "Reviews that mention a service (\"skin fade\", \"beard trim\", \"keratin\") help you appear for those searches.",
          "Your replies show new customers how you treat people when something goes wrong.",
        ],
      },
      { h2: "Step 1: set up your Google Business Profile" },
      {
        p: "Claim your salon at business.google.com, choose the right category (for example \"Barber shop\" or \"Beauty salon\"), and fill in your hours, phone, services, photos and booking or WhatsApp link. A complete profile is more likely to be shown, and it is where your reviews appear.",
      },
      {
        p: "In your profile, choose \"Ask for reviews\" to get your short review link. That link opens the review box straight away, which makes leaving a review much easier.",
      },
      { h2: "Step 2: ask every customer, at the right moment" },
      {
        p: "The best moment is just after the visit, while the fresh cut still feels good. Ask in person (\"If you liked it, a Google review really helps us\") and send the link, so it takes one tap.",
      },
      {
        ul: [
          "Send the link on WhatsApp soon after the visit, not days later.",
          "Ask everyone, not only regulars or the customers who seemed happy.",
          "Keep the message short and personal, with the barber's name.",
          "One reminder at most. Don't keep chasing.",
          "Put a QR code for your review link at the counter or mirror.",
        ],
      },
      { h2: "What Google's rules don't allow" },
      {
        p: "Google removes reviews, and can restrict a business profile, when reviews are collected in ways its policies forbid. Avoid all of these:",
      },
      {
        ul: [
          "Review gating: asking only happy customers to review you, or first checking if someone is happy and sending only them to Google.",
          "Incentives: discounts, free services or gifts in exchange for a review, even for an honest one.",
          "Reviews from your team, their families or friends, or reviews written on a customer's behalf.",
          "Buying reviews, or swapping reviews with other businesses.",
          "Asking customers to review you on a tablet or phone at the salon, which Google advises against.",
        ],
      },
      {
        tip: "Asking every customer is also better for you. A few honest 4-star reviews among many 5-star ones look more believable than a wall of perfect scores.",
      },
      { h2: "Step 3: reply to every review" },
      { h3: "Good reviews" },
      {
        p: "Thank them by name, mention what they had or who served them, and invite them back. Keep it short and different each time: \"Thanks Omar! Glad Sami's fade hit the spot. See you in three weeks.\"",
      },
      { h3: "Bad reviews" },
      {
        ol: [
          "Reply within a day or two, calmly and politely, in public.",
          "Thank them, apologise for the experience, and don't argue about details.",
          "Offer to put it right, and move the conversation to a phone call or WhatsApp.",
          "Fix the cause inside the salon, then follow up.",
        ],
      },
      {
        p: "If a review breaks Google's rules (spam, hate speech, someone who was never a customer), you can report it from your Business Profile. Don't report a review just because it is negative.",
      },
      { h2: "Hear from unhappy customers first" },
      {
        p: "You can still ask customers to rate their visit privately, so you know about a bad haircut before it becomes a bad review. The rule is only that the Google review invitation goes to everyone, whatever they told you.",
      },
      { h2: "How SalonKit does it" },
      {
        p: "In SalonKit you paste your Google review link in Settings. On Pro Max, every customer gets a WhatsApp message after their visit with a \"Rate your visit\" button that opens your Google review page, with one reminder if they don't tap it (only between 9 am and 10 pm). If you haven't added a Google link yet, the button opens SalonKit's own rating page instead, where customers give 1 to 5 stars and a comment that only you see, shown per barber. Either way, no customer is ever left out of the Google invitation because of what they rated.",
      },
      { cta: { text: "See ratings and Google reviews in SalonKit.", href: "/google-reviews-for-salons/", label: "Google reviews for salons" } },
    ],
  },
  {
    slug: "how-to-calculate-barber-commission",
    title: "How to calculate barber commission (with examples in AED)",
    description: "A simple guide to barber and stylist commission in the UAE: percentage, tiered and fixed pay, worked examples in AED, and how to pay it out without disputes.",
    date: "2026-11-04",
    minutes: 6,
    tag: "Staff and pay",
    feature: "barber-commission-app",
    intro:
      "Commission is how most salons and barber shops in the UAE pay their team, and it is also where most end-of-month arguments start. Here is how the common commission models work, with worked examples in dirhams, and how to keep the numbers clear for everyone.",
    body: [
      { h2: "What barber commission is" },
      {
        p: "Commission is the share of each sale that goes to the barber or stylist who did the work. Instead of (or on top of) a fixed salary, the barber earns a percentage of the services they sell. It rewards busy barbers, and it ties the salon's biggest cost, staff pay, to how much the salon actually earns.",
      },
      { h2: "The three common models" },
      { h3: "1. A flat percentage" },
      {
        p: "The barber earns the same percentage on every bill. It is the easiest model to run and to explain. The percentage depends on your market, what else you provide (visa, accommodation, products, a fixed salary) and the barber's experience, so there is no single right number.",
      },
      {
        table: {
          caption: "Example: one barber, a flat 30%", total: true,
          head: ["Bill", "Amount", "Commission at 30%"],
          rows: [
            ["Haircut", "AED 60", "AED 18"],
            ["Haircut and beard", "AED 90", "AED 27"],
            ["Kids cut", "AED 40", "AED 12"],
            ["Day total", "AED 190", "AED 57"],
          ],
        },
      },
      { h3: "2. A tiered percentage" },
      {
        p: "The percentage goes up as the barber sells more in the month. For example 25% on the first AED 8,000 of sales and 35% on everything above it. Tiers reward your best people, but they are harder to check by hand, so write the tiers down and agree them before the month starts.",
      },
      {
        table: {
          caption: "Example: AED 11,000 of sales in a month, 25% up to AED 8,000 and 35% above", total: true,
          head: ["Part of sales", "Rate", "Commission"],
          rows: [
            ["First AED 8,000", "25%", "AED 2,000"],
            ["Next AED 3,000", "35%", "AED 1,050"],
            ["Total", "", "AED 3,050"],
          ],
        },
      },
      { h3: "3. A salary plus commission" },
      {
        p: "A fixed monthly salary with a smaller commission on top, often only above a target. It gives the barber a steady income and the salon a predictable cost, which helps when you are building a new team.",
      },
      { h2: "Decide these details before the first payday" },
      {
        ul: [
          "On what amount: the bill total, or the bill without VAT. Write down which one you use.",
          "Discounts: if you give a customer 20% off, is commission on the discounted amount? It usually should be.",
          "Product sales: the same rate as services, a lower rate, or none.",
          "Deductions: what the barber's own expenses or advances take off before payout.",
          "When you pay: weekly, twice a month or monthly, and from cash or the bank.",
        ],
      },
      {
        tip: "Put the rules in the barber's contract or offer letter. Most commission disputes come from rules that were only agreed out loud.",
      },
      { h2: "A worked month for one barber" },
      {
        p: "Say a barber on a flat 30% sells AED 9,400 of services in the month, had AED 150 of daily expenses recorded (for example, supplies they bought), and you already paid them an advance of AED 1,000.",
      },
      {
        table: {
          total: true,
          head: ["", "Amount"],
          rows: [
            ["Sales", "AED 9,400"],
            ["Commission at 30%", "AED 2,820"],
            ["Less expenses", "− AED 150"],
            ["Less advance already paid", "− AED 1,000"],
            ["Still to pay", "AED 1,670"],
          ],
        },
      },
      {
        p: "The barber's balance (what you still owe) is commission earned minus everything already paid or deducted. If both of you can see that balance at any time, payday becomes a formality.",
      },
      { h2: "Why a notebook gets it wrong" },
      {
        ul: [
          "Bills get missed or written twice on a busy evening.",
          "A rate changes mid-month and old bills are recalculated by mistake.",
          "Cash payouts are not written down, so the balance drifts.",
          "Nobody can check the total without adding up the whole month again.",
        ],
      },
      { h2: "How SalonKit works it out" },
      {
        p: "In SalonKit you set each barber's commission percentage once (or a default for the team). Every bill credits that barber's share automatically, worked out on the bill total, and each bill keeps the rate it was made with, so changing a rate later never rewrites past months. The dashboard and daily sheet show each barber's sales, commission and expenses for any day or month. On Pro Max you also record payouts from cash or bank, and the ledger shows what you still owe each barber.",
      },
      { cta: { text: "See how commission and payouts work in SalonKit.", href: "/barber-commission-app/", label: "Commission and payouts" } },
    ],
  },
  {
    slug: "vat-for-salons-in-the-uae",
    title: "VAT for salons in the UAE: registration and tax invoices",
    description: "UAE VAT for salons and barber shops: when to register, 5% VAT inside your prices, and what a tax invoice and a simplified tax invoice must show.",
    date: "2026-11-04",
    minutes: 7,
    tag: "VAT and tax",
    feature: "salon-vat-invoice-uae",
    intro:
      "Salon and barber services in the UAE are standard-rated for VAT at 5%. Here is what that means for a salon in practice: when you must register, how to work out the VAT inside your prices, and what has to be on the bill you give the customer.",
    body: [
      { tip: "This is a plain-language guide, not tax advice. Rules change, so check the Federal Tax Authority (tax.gov.ae) and your accountant for your own situation." },
      { h2: "Do you have to register for VAT?" },
      {
        ul: [
          "You must register when your taxable supplies and imports in the last 12 months are over AED 375,000, or you expect them to go over AED 375,000 in the next 30 days.",
          "You may register voluntarily when your taxable supplies, imports or taxable expenses are over AED 187,500.",
          "Below that, you cannot register, and you must not charge VAT or show a TRN on your bills.",
        ],
      },
      {
        p: "For a busy salon, AED 375,000 a year is a little over AED 1,000 a day, so many established salons and barber shops are over the line. Keep an eye on your rolling 12-month total, not just the calendar year.",
      },
      { h2: "5% VAT inside your prices" },
      {
        p: "Prices shown to customers in the UAE should include VAT. So when your price list says a haircut is AED 60, the VAT is already inside that AED 60. To find it, multiply by 5 and divide by 105.",
      },
      {
        table: {
          head: ["Price shown (incl. VAT)", "VAT inside (× 5 ÷ 105)", "Price without VAT"],
          rows: [
            ["AED 60.00", "AED 2.86", "AED 57.14"],
            ["AED 105.00", "AED 5.00", "AED 100.00"],
            ["AED 250.00", "AED 11.90", "AED 238.10"],
          ],
        },
      },
      {
        p: "A common mistake is to work out 5% of the shown price (AED 3.00 on AED 60). That overstates the VAT, because the shown price already includes it.",
      },
      { h2: "What goes on a tax invoice" },
      {
        p: "Once you are VAT-registered, you give customers a tax invoice. Most salon customers are not VAT-registered businesses, so you can usually issue a simplified tax invoice, which the FTA allows when the customer is not registered, or when the customer is registered and the bill is AED 10,000 or less.",
      },
      { h3: "A simplified tax invoice shows" },
      {
        ul: [
          "The words \"Tax Invoice\".",
          "Your salon's name, address and TRN.",
          "The date of issue.",
          "A description of the services.",
          "The total amount and the VAT included.",
        ],
      },
      { h3: "A full tax invoice also shows" },
      {
        ul: [
          "A unique, sequential invoice number.",
          "The customer's name, address and TRN (for registered business customers).",
          "The date of supply, if different from the date of issue.",
          "Quantity, unit price, the VAT rate and the VAT amount in AED.",
          "Any discount.",
        ],
      },
      { h2: "Keep your records" },
      {
        p: "Keep a copy of every invoice and your sales records. The FTA requires VAT records to be kept for at least five years. Invoices should be issued within 14 days of the service, which for a salon means at the counter.",
      },
      { h2: "How SalonKit handles VAT" },
      {
        p: "In SalonKit you turn VAT on in Settings and add your TRN. The VAT rate is 5% by default. Every bill then works out the VAT inside the price (amount × 5 ÷ 105), prints \"TAX INVOICE\" with your salon's name, address and TRN, a unique bill number and the VAT amount. Leave VAT off if you are not registered and bills show plain totals. You can also show your salon's name in Arabic on bills. Your daily sheet and Excel exports give your accountant the totals for your VAT return.",
      },
      { cta: { text: "See VAT invoices and the other UAE details in SalonKit.", href: "/salon-vat-invoice-uae/", label: "VAT invoices for UAE salons" } },
    ],
  },
  {
    slug: "whatsapp-reminders-for-salons",
    title: "WhatsApp reminders for salons: bring customers back without spamming",
    seoTitle: "WhatsApp reminders for salons, without spamming",
    description: "How UAE salons use WhatsApp Business for bills, visit reminders and offers: what to send, when to send it, opt-in and opt-out, and message examples.",
    date: "2026-11-04",
    minutes: 6,
    tag: "Marketing",
    feature: "whatsapp-for-salons",
    intro:
      "In the UAE, almost every customer is on WhatsApp, and a short, well-timed message brings them back more reliably than an Instagram post. The trick is to send the right message at the right moment, and never so many that people block you.",
    body: [
      { h2: "Four messages worth sending" },
      { h3: "1. The bill, right after the visit" },
      {
        p: "A PDF bill on WhatsApp is useful (no paper, easy to find) and it starts the conversation on a helpful note. The customer now has your number saved in their chat list.",
      },
      { h3: "2. How was your visit?" },
      {
        p: "A short rating request a little after the visit tells you how you are doing, barber by barber. One gentle reminder if they don't answer is enough.",
      },
      { h3: "3. Time for a fresh cut?" },
      {
        p: "A reminder when a customer is due back. For most men's cuts that is two to four weeks; for colour or treatments, longer. Send it in the late morning or early evening, not at night.",
      },
      { h3: "4. Offers, sparingly" },
      {
        p: "A real offer (a quiet-day discount, a new service, Eid or National Day hours) with a picture. Once or twice a month at most, or people stop reading.",
      },
      { h2: "Example messages" },
      {
        ul: [
          "Bill: \"Thank you for visiting Beard & Co, Ahmed. Your bill is attached. See you next time!\"",
          "Rating: \"How was your cut with Sam today? Tap to rate your visit: it takes 10 seconds.\"",
          "Reminder: \"Hi Ahmed, it's been 3 weeks since your last cut. Book your chair at Beard & Co this week?\"",
          "Offer: \"Quiet Tuesdays at Beard & Co: 20% off all beard trims before 4 pm this month.\"",
        ],
      },
      { h2: "Play by WhatsApp's rules" },
      {
        ul: [
          "Use the WhatsApp Business Platform for automatic messages, not your personal WhatsApp or unofficial bulk-sending tools, which get numbers banned.",
          "Only message customers who gave you their number for it, and say so at the counter.",
          "Business-started messages must use templates that WhatsApp has approved. Keep them short and personal.",
          "Make it easy to stop: honour STOP replies straight away.",
          "Meta charges for business-started conversations, billed to your WhatsApp Business account. Fewer, better messages cost less.",
        ],
      },
      { tip: "One message a customer actually wants beats five they mute. If people start blocking your number, WhatsApp can limit it." },
      { h2: "How SalonKit does it" },
      {
        p: "On Pro Max, you connect your salon's own WhatsApp Business number once in Settings. SalonKit then sends the PDF bill after each sale, a rating request with one reminder, visit reminders after the number of days you choose (15 by default) at the hour you choose, and your offers with a picture or video, all from your number and with your approved templates. Customers who reply STOP stop getting reminders and offers automatically.",
      },
      { cta: { text: "See WhatsApp bills, reminders and offers in SalonKit.", href: "/whatsapp-for-salons/", label: "WhatsApp for salons" } },
    ],
  },
  {
    slug: "salon-daily-cash-up",
    title: "The salon daily cash-up: close the day in five minutes",
    description: "A step-by-step end-of-day routine for salons and barber shops: count cash, match card totals, record expenses and commission, and spot problems early.",
    date: "2026-11-04",
    minutes: 5,
    tag: "Running the salon",
    feature: "salon-daily-sheet-excel",
    intro:
      "The daily cash-up is the habit that keeps a salon's money honest. Done every night, it takes five minutes and catches mistakes while everyone still remembers the day. Skipped for a week, it turns into an argument. Here is a simple routine.",
    body: [
      { h2: "The five-minute routine" },
      {
        ol: [
          "Print or open the day's sales total, split into cash and card.",
          "Count the cash in the drawer and subtract the float you started with.",
          "Compare the card total with the card machine's end-of-day report.",
          "Record every cash expense paid from the drawer (supplies, tea, a taxi), with a note.",
          "Check each barber's sales and commission for the day.",
          "Write down any difference and why, then lock the cash away or bank it.",
        ],
      },
      { h2: "Cash that should be in the drawer" },
      {
        table: {
          caption: "Example day", total: true,
          head: ["", "Amount"],
          rows: [
            ["Opening float", "AED 200"],
            ["+ Cash sales", "AED 1,340"],
            ["− Cash expenses (supplies, tea)", "− AED 85"],
            ["= Should be in the drawer", "AED 1,455"],
            ["Counted", "AED 1,450"],
            ["Difference", "− AED 5"],
          ],
        },
      },
      {
        p: "Small differences happen (change given wrong, a coin on the floor). What matters is that they stay small, and that a pattern, like the same shift being short every week, gets noticed quickly.",
      },
      { h2: "When the numbers don't match" },
      {
        ul: [
          "Cash short: look for a cash expense nobody recorded, or a card sale entered as cash.",
          "Cash over: look for a cash sale that was never billed.",
          "Card total different from the machine: look for a bill entered with the wrong payment type, or a refund.",
          "A barber's total looks low: check for bills given to the wrong barber.",
        ],
      },
      { tip: "Fix the bill, not the total. If a sale was entered as cash but paid by card, change that bill, so the sheet, the commission and the cash balance all stay right." },
      { h2: "Your business day might not end at midnight" },
      {
        p: "Many UAE salons are open past midnight. If your day ends when you close, say 2 am, bills after midnight belong to the evening's takings, not tomorrow's. Pick a fixed end-of-day hour and stick to it, or late bills will jump between days.",
      },
      { h2: "How SalonKit does the cash-up for you" },
      {
        p: "Every bill in SalonKit already records the barber, the amount and cash or card, so the day's totals are ready the moment you close. The daily sheet shows each day's sales per barber, expenses, commission and profit for the whole month, and your business day ends at the hour you choose (4 am by default). On Pro Max, the ledger keeps the shop's cash and bank balances, including expenses and transfers between them. On Pro, you can download the sheet to Excel for your accountant.",
      },
      { cta: { text: "See the daily sheet and Excel reports in SalonKit.", href: "/salon-daily-sheet-excel/", label: "Daily sheet and Excel" } },
    ],
  },
];

export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug);
/** Newest first. */
export const postsByDate = () => [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
