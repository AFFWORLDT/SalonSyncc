import type { PlanId } from "@ss/features";
import type { NewsletterCopy } from "./newsletter-form";
import { FEATURE_PAGES, HOME_FAQS, type Faq } from "@/lib/content";
import { AR, AR_FAQS, AR_FEATURES, AR_PLAN_BLURB, arStaff } from "@/lib/content-ar";

/**
 * Every word on the home page, in English and Arabic. The page, header and footer take one of these,
 * so both languages share one design. Nothing here is a made-up number, review or customer.
 */
export type Lang = "en" | "ar";
export type Link = { label: string; href: string; desc?: string };
export type StripItem = { icon: "bill" | "payments" | "staff" | "reports" | "regulars" | "reviews"; title: string; desc: string };
export type Story = {
  key: "billing" | "commission" | "reports" | "whatsapp" | "reviews" | "uae";
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
  plan: string;
  href: string;
  more: string;
};

export type HomeCopy = {
  lang: Lang;
  home: string;
  nav: {
    product: string;
    features: string;
    pricing: string;
    resources: string;
    signIn: string;
    start: string;
    menu: string;
    close: string;
    other: { label: string; href: string; hrefLang: string; lang: string };
    productItems: Link[];
    featureItems: Link[];
    resourceItems: Link[];
  };
  hero: { badge: string; seoLine: string; line1: string; grow: string; rest: string; lead: string; cta: string; demo: string; note: string; imgAlt: string; washAlt: string; phoneAlt: string; billCard: [string, string, string]; ratingCard: [string, string] };
  strip: StripItem[];
  showcase: { eyebrow: string; title: string; lead: string; points: string[]; cta: string; laptopAlt: string; phoneAlt: string; liveCard: [string, string]; waCard: [string, string] };
  storiesTitle: { eyebrow: string; title: string; lead: string };
  stories: Story[];
  storyAlts: Record<Story["key"], string>;
  trust: { eyebrow: string; title: string; lead: string; items: { title: string; body: string }[] };
  pricing: {
    eyebrow: string;
    title: string;
    pageTitle: string;
    lead: string;
    free: string;
    forever: string;
    perMonth: string;
    currencyFirst: boolean;
    staff: (max: number | null) => string;
    everythingIn: (plan: string) => string;
    upgradeFor: (plan: string) => string;
    start: string;
    note: string;
    blurb: Record<PlanId, string>;
    badge: Record<PlanId, string>;
  };
  cta: { title: string; lead: string; button: string; note: string; imgAlt: string };
  testimonials: { eyebrow: string; title: string };
  newsletter: NewsletterCopy & { confirmed: string; unsubscribed: string; invalid: string; back: string; pageTitle: string };
  faq: { eyebrow: string; title: string; lead: string; items: Faq[] };
  demo: { title: string; close: string; unsupported: string };
  footer: {
    blurb: string;
    product: string;
    features: string;
    resources: string;
    company: string;
    productLinks: Link[];
    featureLinks: Link[];
    resourceLinks: Link[];
    email: string;
    rights: string;
    legal: Link[];
    follow: string;
  };
};

const featureLinks = FEATURE_PAGES.map((p) => ({ label: p.label, href: `/${p.slug}/` }));
const slug = (i: number) => `/${FEATURE_PAGES[i]!.slug}/`;

export const HOME_EN: HomeCopy = {
  lang: "en",
  home: "/",
  nav: {
    product: "Product",
    features: "Features",
    pricing: "Pricing",
    resources: "Resources",
    signIn: "Sign in",
    start: "Start free trial",
    menu: "Open menu",
    close: "Close menu",
    other: { label: "العربية", href: "/ar/", hrefLang: "ar", lang: "ar" },
    productItems: [
      { label: "Overview", href: "/#showcase", desc: "Your salon's day on one screen" },
      { label: "All features", href: "/#features", desc: "Bills, staff, reports, WhatsApp and more" },
      { label: "Pricing", href: "/pricing/", desc: "Free, Pro and Pro Max, in AED" },
    ],
    featureItems: featureLinks,
    resourceItems: [
      { label: "Blog", href: "/blog/", desc: "Guides for salon owners in the UAE" },
      { label: "Questions", href: "/#faq", desc: "Straight answers about SalonKit" },
      { label: "Support", href: "/support/", desc: "Email our team" },
    ],
  },
  hero: {
    badge: "The complete salon management app",
    seoLine: "Salon & barber shop software for Dubai and the UAE",
    line1: "Run your salon.",
    grow: "Grow",
    rest: "your business.",
    lead: "The salon app made in Dubai, for UAE salons. VAT bills in seconds, staff commission worked out for you, the daily sheet kept to the fils, and WhatsApp reminders that bring customers back.",
    cta: "Start free trial",
    demo: "Watch demo",
    note: "7 days of Pro Max free · No card needed · Prices in AED",
    imgAlt: "A modern salon with lit arched mirrors and leather styling chairs",
    washAlt: "A client relaxing during a hair wash at a salon basin",
    phoneAlt: "The SalonKit dashboard on a phone: today's sales, commission and profit",
    billCard: ["Bill sent on WhatsApp", "Haircut + beard", "AED 75"],
    ratingCard: ["New rating", "“Great fade, thanks Omar!”"],
  },
  strip: [
    { icon: "bill", title: "Smart billing", desc: "VAT bills in a few taps" },
    { icon: "payments", title: "Cash & card tracking", desc: "Every bill records how it was paid" },
    { icon: "staff", title: "Staff & commission", desc: "Every barber's share, worked out" },
    { icon: "reports", title: "Reports & Excel", desc: "Daily sheet, months and years" },
    { icon: "regulars", title: "Customers & reminders", desc: "Visit history, WhatsApp nudges" },
    { icon: "reviews", title: "Google reviews", desc: "Ratings for every barber" },
  ],
  showcase: {
    eyebrow: "The dashboard",
    title: "Everything you need in one place",
    lead: "Open SalonKit and see your salon's day: sales, commission and profit, how each barber is doing, and every bill as it happens, on a computer, tablet or phone.",
    points: ["Live sales, commission and profit for today", "Every barber's customers and earnings at a glance", "The latest bills, with WhatsApp one tap away", "Compare with yesterday, the week, the month or the year"],
    cta: "Explore the features",
    laptopAlt: "The SalonKit dashboard on a computer: today's sales, each barber's earnings and the latest bills",
    phoneAlt: "The SalonKit daily sheet on a phone",
    liveCard: ["Sales today", "Updated with every bill"],
    waCard: ["WhatsApp", "Bill and rating link sent"],
  },
  storiesTitle: {
    eyebrow: "Features",
    title: "Everything the front desk does, without the notebook",
    lead: "Built with a real Dubai salon, for owners, managers and barbers on their phones.",
  },
  stories: [
    {
      key: "billing",
      eyebrow: "Smart salon billing",
      title: "A bill in three taps",
      lead: "Pick the barber, tap the services, choose cash or card. SalonKit makes a clean, numbered bill you can print, share as a link or send on WhatsApp.",
      points: ["Your price list, one tap each", "Every bill numbered with your prefix", "Print, share a link or send on WhatsApp"],
      plan: "Every plan",
      href: slug(0),
      more: "More about billing",
    },
    {
      key: "commission",
      eyebrow: "Barber commission",
      title: "Commission worked out for you",
      lead: "Set each barber's percentage once. Every bill credits their share, and payouts keep the ledger balanced.",
      points: ["Commission per barber, on every bill", "Payouts from cash or bank", "Shop cash, bank and barber balances in one ledger"],
      plan: "Commission on every plan · ledger and payouts on Pro Max",
      href: slug(1),
      more: "More about commission",
    },
    {
      key: "reports",
      eyebrow: "Daily sales & Excel reports",
      title: "The sheet that writes itself",
      lead: "The notebook page you used to fill in by hand, done for you: each barber's sales, the day's expenses, commission and profit.",
      points: ["One row per day, for the whole month", "Monthly and yearly reports to compare", "Download for your accountant in one click"],
      plan: "Daily sheet on every plan · reports and Excel on Pro",
      href: slug(2),
      more: "More about reports",
    },
    {
      key: "whatsapp",
      eyebrow: "WhatsApp reminders & campaigns",
      title: "Bring customers back on WhatsApp",
      lead: "Messages go out from your salon's own WhatsApp Business number, with your name on them.",
      points: ["The PDF bill after every visit", "A friendly reminder when it's time for the next cut", "Offers and announcements in one go"],
      plan: "Pro Max",
      href: slug(3),
      more: "More about WhatsApp",
    },
    {
      key: "reviews",
      eyebrow: "Google reviews & ratings",
      title: "Hear from every customer",
      lead: "Ask every customer how it went, see ratings for each barber, and invite them all to review you on Google.",
      points: ["A rating message after each visit", "Private ratings and comments per barber", "A one-tap link to your Google review page"],
      plan: "Ratings on Pro · WhatsApp messages on Pro Max",
      href: slug(4),
      more: "More about reviews",
    },
    {
      key: "uae",
      eyebrow: "UAE VAT & compliance",
      title: "Made for the UAE",
      lead: "Built with a Dubai salon, so the details are already right: dirhams, 5% VAT and your TRN on tax invoices.",
      points: ["AED amounts and 5% VAT", "Tax invoices with your TRN", "Dubai time, +971 numbers and your salon's Arabic name"],
      plan: "Every plan",
      href: slug(5),
      more: "More about VAT invoices",
    },
  ],
  storyAlts: {
    billing: "Ringing up a new sale in the SalonKit app: barber, services and total",
    commission: "Staff list in SalonKit with each barber's commission",
    reports: "The SalonKit daily sheet with sales, expenses, commission and profit per day",
    whatsapp: "A WhatsApp thank-you message from the salon, with a link to rate the visit",
    reviews: "Ratings per barber in SalonKit, with stars and comments",
    uae: "A SalonKit tax invoice in AED with 5% VAT",
  },
  trust: {
    eyebrow: "Made in Dubai",
    title: "Why salons choose SalonKit",
    lead: "No contracts, no setup fees and no notebook. Here is what you get from day one.",
    items: [
      { title: "Built with a real Dubai salon", body: "Every screen was shaped by a working salon's front desk, owners and barbers." },
      { title: "Right for UAE rules", body: "Dirhams, 5% VAT, your TRN on tax invoices, Dubai time and +971 numbers." },
      { title: "Your own salon address", body: "Your team signs in at yoursalon.salonkit.online, with your logo on the page." },
      { title: "Phone, tablet or computer", body: "Works in any browser. Every owner, manager and barber gets their own sign-in." },
    ],
  },
  pricing: {
    eyebrow: "Simple pricing",
    title: "Flexible plans for every salon",
    pageTitle: "SalonKit pricing: Free, Pro and Pro Max in AED",
    lead: "Every salon starts with 7 days of Pro Max, free. Then pick the plan that fits.",
    free: "Free",
    forever: "forever",
    perMonth: "/ month",
    currencyFirst: true,
    staff: (max) => `Staff: ${max === null ? "unlimited" : `up to ${max}`}`,
    everythingIn: (plan) => `Everything in ${plan}, plus:`,
    upgradeFor: (plan) => `Upgrade to ${plan} for`,
    start: "Start free trial",
    note: "Need something else, or more than one branch? Talk to us and we'll set up a plan for you.",
    blurb: { free: "For a small shop getting started.", pro: "For a busy salon with a team.", pro_max: "Everything, including WhatsApp." },
    badge: { free: "To start", pro: "Most popular", pro_max: "Everything" },
  },
  cta: {
    title: "Ready to transform your salon business?",
    lead: "Join the salons using SalonKit to simplify their day. Your salon gets its own address in minutes.",
    button: "Start free trial",
    note: "7 days of Pro Max free · No card needed",
    imgAlt: "Black and white salon product bottles with folded towels",
  },
  testimonials: { eyebrow: "Salon owners", title: "What our customers say" },
  newsletter: {
    title: "Newsletter",
    lead: "Tips for running a UAE salon and SalonKit news. No spam.",
    placeholder: "Your email",
    button: "Subscribe",
    sending: "Sending…",
    done: "Almost there: check your inbox and tap the link to confirm.",
    error: "That didn't work. Please try again.",
    privacy: "We never share your email. Unsubscribe any time.",
    pageTitle: "Newsletter",
    confirmed: "You're subscribed. Thanks for joining the SalonKit newsletter.",
    unsubscribed: "You're unsubscribed. You won't get any more newsletter emails from us.",
    invalid: "That link has expired or was already used. Subscribe again from the footer if you like.",
    back: "Back to SalonKit",
  },
  faq: { eyebrow: "FAQ", title: "Questions salon owners ask", lead: "Straight answers about SalonKit for salons and barber shops in the UAE.", items: HOME_FAQS },
  demo: { title: "SalonKit in 60 seconds", close: "Close video", unsupported: "Your browser can't play this video." },
  footer: {
    blurb: "The salon app made in Dubai: sales, VAT bills, staff commission, WhatsApp reminders and reports, in AED, on your phone.",
    product: "Product",
    features: "Features",
    resources: "Resources",
    company: "Company",
    productLinks: [
      { label: "Start free trial", href: "/signup/" },
      { label: "Sign in", href: "/login/" },
      { label: "Pricing", href: "/pricing/" },
      { label: "All features", href: "/#features" },
    ],
    featureLinks,
    resourceLinks: [
      { label: "Blog", href: "/blog/" },
      { label: "Questions", href: "/#faq" },
      { label: "Support", href: "/support/" },
      { label: "العربية", href: "/ar/" },
    ],
    email: "Email us",
    rights: "All rights reserved.",
    legal: [
      { label: "Privacy", href: "/privacy/" },
      { label: "Terms", href: "/terms/" },
      { label: "Delete account", href: "/delete-account/" },
    ],
    follow: "Follow us",
  },
};

const arStory = (i: number) => ({ title: AR_FEATURES[i]!.title, lead: AR_FEATURES[i]!.description });

export const HOME_AR: HomeCopy = {
  lang: "ar",
  home: "/ar/",
  nav: {
    product: "المنتج",
    features: "المزايا",
    pricing: AR.pricing,
    resources: "المصادر",
    signIn: AR.signIn,
    start: AR.startShort,
    menu: "فتح القائمة",
    close: "إغلاق القائمة",
    other: { label: AR.english, href: "/", hrefLang: "en", lang: "en" },
    productItems: [
      { label: "نظرة عامة", href: "/ar/#showcase", desc: "يوم صالونك في شاشة واحدة" },
      { label: "كل المزايا", href: "/ar/#features", desc: "الفواتير والموظفون والتقارير وواتساب" },
      { label: AR.pricing, href: "/ar/#pricing", desc: "المجانية وPro وPro Max بالدرهم" },
    ],
    featureItems: AR_FEATURES.map((f, i) => ({ label: f.title, href: slug(i), desc: "صفحة بالإنجليزية" })),
    resourceItems: [
      { label: "الأسئلة الشائعة", href: "/ar/#faq", desc: "إجابات واضحة عن SalonKit" },
      { label: "المدونة (بالإنجليزية)", href: "/blog/", desc: "أدلة لأصحاب الصالونات" },
      { label: "الدعم", href: "/support/", desc: "راسل فريقنا" },
    ],
  },
  hero: {
    badge: "تطبيق إدارة الصالون المتكامل",
    seoLine: "برنامج إدارة وكاشير للصالونات ومحلات الحلاقة في دبي والإمارات",
    line1: "أدِر صالونك.",
    grow: "وطوّر",
    rest: "أعمالك.",
    lead: AR.heroLead,
    cta: AR.start,
    demo: "شاهد العرض",
    note: AR.trialNote,
    imgAlt: "صالون عصري بمرايا مقوّسة مضيئة وكراسي تصفيف جلدية",
    washAlt: "عميلة تسترخي أثناء غسل الشعر في الصالون",
    phoneAlt: "لوحة SalonKit على الهاتف: مبيعات اليوم والعمولة والربح",
    billCard: ["أُرسلت الفاتورة عبر واتساب", "قص شعر + لحية", "75 درهمًا"],
    ratingCard: ["تقييم جديد", "«قصة رائعة، شكرًا عمر!»"],
  },
  strip: [
    { icon: "bill", title: "فواتير ذكية", desc: "فواتير ضريبية بنقرات" },
    { icon: "payments", title: "النقد والبطاقة", desc: "كل فاتورة تسجّل طريقة الدفع" },
    { icon: "staff", title: "الموظفون والعمولة", desc: "حصة كل حلاق محسوبة" },
    { icon: "reports", title: "تقارير وExcel", desc: "الكشف اليومي والشهري" },
    { icon: "regulars", title: "العملاء والتذكيرات", desc: "سجل الزيارات وتذكيرات واتساب" },
    { icon: "reviews", title: "مراجعات Google", desc: "تقييمات لكل حلاق" },
  ],
  showcase: {
    eyebrow: "لوحة التحكم",
    title: "كل ما تحتاجه في مكان واحد",
    lead: "افتح SalonKit وشاهد يوم صالونك: المبيعات والعمولة والربح، وأداء كل حلاق، وكل فاتورة لحظة صدورها، على الكمبيوتر أو الجهاز اللوحي أو الهاتف.",
    points: ["مبيعات اليوم والعمولة والربح مباشرة", "عملاء كل حلاق وأرباحه بنظرة واحدة", "أحدث الفواتير وواتساب بنقرة", "قارن مع الأمس والأسبوع والشهر والسنة"],
    cta: "اكتشف المزايا",
    laptopAlt: "لوحة SalonKit على الكمبيوتر: مبيعات اليوم وأرباح كل حلاق وأحدث الفواتير",
    phoneAlt: "الكشف اليومي في SalonKit على الهاتف",
    liveCard: ["مبيعات اليوم", "تتحدّث مع كل فاتورة"],
    waCard: ["واتساب", "أُرسلت الفاتورة ورابط التقييم"],
  },
  storiesTitle: { eyebrow: "المزايا", title: AR.featuresTitle, lead: AR.featuresLead },
  stories: [
    { key: "billing", eyebrow: "فواتير الصالون الذكية", ...arStory(0), points: [], plan: "كل الباقات", href: "/ar/#pricing", more: AR.pricing },
    { key: "commission", eyebrow: "عمولة الحلاقين", ...arStory(1), points: [], plan: "العمولة في كل الباقات · الدفتر في Pro Max", href: "/ar/#pricing", more: AR.pricing },
    { key: "reports", eyebrow: "المبيعات اليومية وتقارير Excel", ...arStory(2), points: [], plan: "الكشف اليومي في كل الباقات · التقارير في Pro", href: "/ar/#pricing", more: AR.pricing },
    { key: "whatsapp", eyebrow: "تذكيرات وحملات واتساب", ...arStory(3), points: [], plan: "Pro Max", href: "/ar/#pricing", more: AR.pricing },
    { key: "reviews", eyebrow: "مراجعات Google والتقييمات", ...arStory(4), points: [], plan: "التقييمات في Pro", href: "/ar/#pricing", more: AR.pricing },
    { key: "uae", eyebrow: "ضريبة القيمة المضافة في الإمارات", ...arStory(5), points: [], plan: "كل الباقات", href: "/ar/#pricing", more: AR.pricing },
  ],
  storyAlts: {
    billing: "تسجيل عملية بيع جديدة في SalonKit: الحلاق والخدمات والمجموع",
    commission: "قائمة الموظفين في SalonKit مع عمولة كل حلاق",
    reports: "الكشف اليومي في SalonKit: المبيعات والمصاريف والعمولة والربح لكل يوم",
    whatsapp: "رسالة شكر من الصالون عبر واتساب مع رابط لتقييم الزيارة",
    reviews: "تقييمات كل حلاق في SalonKit بالنجوم والتعليقات",
    uae: "فاتورة ضريبية من SalonKit بالدرهم مع ضريبة 5%",
  },
  trust: {
    eyebrow: "صُنع في دبي",
    title: "لماذا تختار الصالونات SalonKit",
    lead: "بدون عقود، وبدون رسوم إعداد، وبدون دفتر. هذا ما تحصل عليه من اليوم الأول.",
    items: [
      { title: "صُمّم مع صالون حقيقي في دبي", body: "كل شاشة صُمّمت مع مكتب استقبال وملّاك وحلاقين في صالون يعمل فعلًا." },
      { title: "مناسب لقواعد الإمارات", body: "الدرهم، وضريبة 5%، ورقمك الضريبي على الفواتير، وتوقيت دبي وأرقام ‎+971." },
      { title: "عنوان خاص لصالونك", body: "يسجّل فريقك الدخول من yoursalon.salonkit.online مع شعارك على الصفحة." },
      { title: "الهاتف أو الجهاز اللوحي أو الكمبيوتر", body: "يعمل في أي متصفح، ولكل مالك ومدير وحلاق حسابه الخاص." },
    ],
  },
  pricing: {
    eyebrow: "أسعار بسيطة",
    title: AR.pricingTitle,
    pageTitle: "أسعار SalonKit: المجانية وPro وPro Max بالدرهم",
    lead: AR.pricingLead,
    free: AR.free,
    forever: "دائمًا",
    perMonth: AR.perMonth,
    currencyFirst: false,
    staff: arStaff,
    everythingIn: AR.everythingIn,
    upgradeFor: (plan) => `رقِّ إلى ${plan} لتحصل على`,
    start: AR.start,
    note: "تحتاج شيئًا آخر أو أكثر من فرع؟ تواصل معنا وسنُعدّ لك باقة مناسبة.",
    blurb: AR_PLAN_BLURB,
    badge: { free: "للبداية", pro: "الأكثر طلبًا", pro_max: "كل شيء" },
  },
  cta: { title: AR.ctaTitle, lead: AR.ctaLead, button: AR.start, note: AR.appInEnglish, imgAlt: "عبوات منتجات صالون سوداء وبيضاء مع مناشف مطوية" },
  testimonials: { eyebrow: "أصحاب الصالونات", title: "ماذا يقول عملاؤنا" },
  newsletter: {
    title: "النشرة البريدية",
    lead: "نصائح لإدارة الصالون في الإمارات وأخبار SalonKit. بدون رسائل مزعجة.",
    placeholder: "بريدك الإلكتروني",
    button: "اشترك",
    sending: "جارٍ الإرسال…",
    done: "بقيت خطوة: افتح بريدك واضغط الرابط لتأكيد الاشتراك.",
    error: "لم ينجح ذلك. حاول مرة أخرى.",
    privacy: "لا نشارك بريدك أبدًا، ويمكنك إلغاء الاشتراك في أي وقت.",
    pageTitle: "النشرة البريدية",
    confirmed: "تم اشتراكك. شكرًا لانضمامك إلى نشرة SalonKit.",
    unsubscribed: "تم إلغاء اشتراكك، ولن تصلك رسائل النشرة بعد الآن.",
    invalid: "انتهت صلاحية هذا الرابط أو استُخدم من قبل. يمكنك الاشتراك مجددًا من أسفل الصفحة.",
    back: "العودة إلى SalonKit",
  },
  faq: { eyebrow: "الأسئلة", title: AR.faqTitle, lead: AR.faqLead, items: AR_FAQS },
  demo: { title: "SalonKit في 60 ثانية (بالإنجليزية)", close: "إغلاق الفيديو", unsupported: "متصفحك لا يستطيع تشغيل هذا الفيديو." },
  footer: {
    blurb: "تطبيق الصالونات المصنوع في دبي: المبيعات والفواتير الضريبية وعمولة الموظفين وتذكيرات واتساب والتقارير، بالدرهم، على هاتفك.",
    product: "المنتج",
    features: "المزايا",
    resources: "المصادر",
    company: "الشركة",
    productLinks: [
      { label: AR.startShort, href: "/signup/" },
      { label: AR.signIn, href: "/login/" },
      { label: AR.pricing, href: "/ar/#pricing" },
      { label: "كل المزايا", href: "/ar/#features" },
    ],
    featureLinks: AR_FEATURES.map((f) => ({ label: f.title, href: "/ar/#features" })),
    resourceLinks: [
      { label: "الأسئلة الشائعة", href: "/ar/#faq" },
      { label: "المدونة (بالإنجليزية)", href: "/blog/" },
      { label: "الدعم", href: "/support/" },
      { label: AR.english, href: "/" },
    ],
    email: "راسلنا",
    rights: AR.rights,
    legal: [
      { label: "الخصوصية", href: "/privacy/" },
      { label: "الشروط", href: "/terms/" },
      { label: "حذف الحساب", href: "/delete-account/" },
    ],
    follow: "تابعنا",
  },
};
