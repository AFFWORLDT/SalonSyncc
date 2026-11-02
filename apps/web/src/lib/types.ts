/**
 * API contract shared by the Worker and the web app (copy of api/src/contract.ts — keep them identical).
 * All routes are under /api, JSON in/out, session cookie required except login and public receipts.
 * Errors: { error: string } with a 4xx/5xx status.
 * Money: integer fils (AED x 100). Day: Dubai YYYY-MM-DD. Timestamps: epoch ms.
 *
 * Auth
 *   POST /api/auth/login        { username, password }            -> { ok, user: Me }
 *   POST /api/auth/logout                                         -> { ok }
 *   GET  /api/auth/me                                             -> { user: Me, settings: Settings, today: string }
 *   PUT  /api/me/password       { current, next }                 -> { ok }
 *
 * Sales (barbers see and change only their own, and only today's)
 *   GET    /api/sales?day=&from=&to=&barber_id=&page=&page_size=  -> Paged<Sale>
 *   POST   /api/sales           SaleInput                         -> Sale
 *   PUT    /api/sales/:id       SaleInput                         -> Sale
 *   DELETE /api/sales/:id                                         -> { ok }
 *   GET    /api/public/receipt/:token                             -> Receipt   (no sign-in)
 *   GET    /api/public/services                                   -> {category,name,description,price}[]  (no sign-in, CORS *, for the website)
 *
 * Expenses (one per barber per day)
 *   GET  /api/expenses?month=&barber_id=                          -> Expense[]
 *   PUT  /api/expenses          ExpenseInput                      -> Expense | { ok, deleted: true }
 *
 * Reports
 *   GET /api/reports/me?month=YYYY-MM                             -> MyReport
 *   GET /api/reports/overview?from=&to=                           -> Overview          (admin; default today)
 *   GET /api/reports/daily?month=YYYY-MM                          -> DailySheet        (admin)
 *   GET /api/reports/monthly?year=YYYY                            -> MonthlyReport     (admin)
 *
 * Admin
 *   GET/POST /api/users, PUT/DELETE /api/users/:id, POST /api/users/:id/reset-password { password }
 *   GET /api/customers?q=&page=       (barbers: q of 3+ chars, max 8 results, name + phone only)
 *   GET/PUT /api/settings
 *
 * Services catalogue
 *   GET    /api/services?all=1        (all=1: admin, includes hidden ones)  -> Service[]
 *   POST   /api/services  ServiceInput (admin) -> Service · PUT /api/services/:id · DELETE /api/services/:id
 *
 * Photos (stored in D1)
 *   GET    /api/users/:id/avatar?v=   image bytes (no sign-in; cached for a year, ?v changes on upload)
 *   PUT    /api/me/avatar             body = image (webp/jpeg/png, max 200 KB)  -> { avatar_url }
 *   PUT    /api/users/:id/avatar      admin, same body
 *   DELETE /api/me/avatar | /api/users/:id/avatar
 */

export type Role = "admin" | "barber";
export type PaymentMode = "cash" | "card";

export interface Me {
  id: number;
  name: string;
  username: string;
  role: Role;
  commission_pct: number; // effective (own or the shop default)
  avatar_url: string | null;
  can_add_expense: boolean; // may add or change their own day's expense (admins always can)
}

export interface Settings {
  salon_name: string;
  salon_name_ar: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  licence_no: string | null;
  trn: string | null;
  vat_enabled: boolean;
  vat_rate: number; // fraction, 0.05
  default_commission_pct: number;
  quick_amounts: number[]; // AED
  whatsapp_mode: "off" | "link";
  thank_you_text: string;
  receipt_footer: string | null;
  // Push notifications (hours are Dubai time, 0-23).
  notify_sales: boolean; // admin: any new bill (by a barber or the admin)
  notify_sale_min: number; // fils; 0 = every sale
  notify_summary: boolean; // admin: end-of-day summary at summary_hour
  summary_hour: number;
  notify_reminder: boolean; // barbers with no sale yet at reminder_hour
  reminder_hour: number;
  notify_barber_changes: boolean; // barber: the admin edited or deleted their sale
  // WhatsApp Cloud API (read-only flags come from the server's config).
  wa_ready: boolean; // token and phone number configured
  wa_test_numbers: string | null; // staging: only these numbers get messages
  wa_bill_auto: boolean; // send the bill template after each sale with a mobile
  wa_reminder_enabled: boolean;
  wa_reminder_days: number; // remind customers this many days after their last visit
  wa_reminder_hour: number; // Dubai hour, 0-23
  wa_feedback_enabled: boolean; // ask for a rating on WhatsApp after a visit
  wa_feedback_delay_min: number; // minutes after the sale
  wa_feedback_reminder_min: number; // one reminder this long after the request if still not rated; 0 = none
  google_review_url: string | null; // shown after a 4-5 star rating
  instagram_url: string | null;
}

/** POST/DELETE /api/push/tokens: this device's FCM registration token. */
export interface PushTokenInput {
  token: string;
}

export interface Announcement {
  id: number;
  sender_id: number;
  sender_name: string;
  audience: "all" | "barber";
  target_id: number | null;
  target_name: string | null;
  title: string;
  body: string;
  recipients: number;
  created_at: number;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  audience: "all" | "barber";
  barber_id?: number;
}

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  path: string | null;
  created_at: number;
  read_at: number | null;
}

export interface NotificationFeed {
  items: Notification[];
  unread: number;
}

export interface User {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  role: Role;
  commission_pct: number | null; // null = shop default
  sort_order: number;
  active: boolean;
  can_add_expense: boolean; // barber may add or change their own day's expense
  avatar_url: string | null;
  created_at: number;
}

export interface UserInput {
  name: string;
  username: string;
  phone?: string | null;
  password?: string; // required on create
  role?: Role;
  commission_pct?: number | null;
  sort_order?: number;
  active?: boolean;
  can_add_expense?: boolean;
}

export interface Service {
  id: number;
  category: string;
  name: string;
  description: string | null;
  price: number; // fils
  sort_order: number;
  active: boolean;
}

export interface ServiceInput {
  category: string;
  name: string;
  description?: string | null;
  price: number | string; // AED
  sort_order?: number;
  active?: boolean;
}

/** One line on a bill. service_id is null for a one-off item. name/price are snapshots. */
export interface SaleItem {
  service_id: number | null;
  name: string;
  price: number; // fils per unit
  qty: number;
}

export interface Sale {
  id: number;
  bill_no: string;
  token: string;
  day: string;
  barber_id: number;
  barber_name: string;
  customer_id: number | null;
  customer_label: string;
  customer_phone: string | null;
  amount: number;
  payment_mode: PaymentMode;
  note: string | null;
  commission_pct: number;
  commission: number;
  vat_rate: number;
  vat_amount: number;
  created_at: number;
  items: SaleItem[]; // empty for an amount-only sale
}

export interface SaleInput {
  /** AED. Ignored when items are given (the total is their sum). */
  amount?: number | string;
  /** Catalogue services ({service_id, qty, price? (AED, when changed on the bill)}) and/or one-off items ({name, price (AED), qty}). */
  items?: { service_id?: number; name?: string; price?: number | string; qty?: number }[];
  payment_mode: PaymentMode;
  customer_name?: string | null;
  customer_phone?: string | null;
  note?: string | null;
  barber_id?: number; // admin only
  day?: string; // admin only (enter a missed sale)
}

export interface Receipt {
  sale: Pick<Sale, "bill_no" | "day" | "barber_name" | "customer_label" | "customer_phone" | "amount" | "payment_mode" | "vat_rate" | "vat_amount" | "created_at" | "items" | "note">;
  salon: Pick<Settings, "salon_name" | "salon_name_ar" | "tagline" | "address" | "phone" | "trn" | "receipt_footer">;
}

export interface Expense {
  id: number;
  barber_id: number;
  barber_name: string;
  day: string;
  amount: number;
  note: string | null;
  updated_at: number;
}

export interface ExpenseInput {
  amount: number | string; // AED; 0 deletes the day's entry
  note?: string | null;
  day?: string; // admin only
  barber_id?: number; // admin only
}

/** A shop-level expense (rent, electricity, supplies…). Admin only; several per day. */
export interface CompanyExpense {
  id: number;
  day: string;
  amount: number;
  note: string;
  paid_from: MoneyAccount;
  created_by: number | null;
  created_by_name: string | null;
  updated_at: number;
}

export interface CompanyExpenseInput {
  amount: number | string; // AED
  note: string; // what it was for
  paid_from?: MoneyAccount; // default cash
  day?: string; // default today
}

/** Where shop money sits: the cash drawer or the bank (card payments land in the bank). */
export type MoneyAccount = "cash" | "bank";

/**
 * Ledger (admin only)
 *   GET  /api/transfers?month=            -> Transfer[]
 *   POST /api/transfers  TransferInput    -> Transfer        PUT/DELETE /api/transfers/:id
 *   GET  /api/ledger/balances             -> Balances        (right now)
 *   PUT  /api/ledger/balances BalanceInput -> Balances       (posts the difference as a "Balance set" line)
 *   GET  /api/ledger/shop?from=&to=&account= -> ShopLedger
 */
export interface Transfer {
  id: number;
  day: string;
  amount: number;
  from_account: MoneyAccount;
  to_account: MoneyAccount;
  note: string | null;
  created_by_name: string | null;
  updated_at: number;
}

export interface TransferInput {
  amount: number | string; // AED
  from_account: MoneyAccount;
  to_account: MoneyAccount;
  day?: string;
  note?: string | null;
}

export interface Balances {
  cash: number;
  bank: number;
  barbers: Record<number, number>; // owed to each barber
}

/** What the admin counted right now, in AED. Barbers not listed keep their balance. */
export interface BalanceInput {
  cash: number | string;
  bank: number | string;
  barbers?: Record<number, number | string>;
}

export interface LedgerLine {
  id: number;
  at: number;
  day: string;
  account: MoneyAccount | null;
  barber_id: number | null;
  amount: number; // signed fils
  kind: string; // sale | commission | expense | company_expense | payout | transfer | opening | reversal
  source: string;
  source_id: number;
  ref: string | null;
  memo: string;
  reverses_id: number | null;
  reversed: boolean;
  actor_name: string | null;
  balance: number; // running balance after this line
}

/**
 * Barber book (admin only)
 *   GET  /api/payouts?month=&barber_id=    -> Payout[]
 *   POST /api/payouts  PayoutInput         -> Payout          PUT/DELETE /api/payouts/:id
 *   GET  /api/ledger/barbers               -> BarberBalance[]
 *   GET  /api/ledger/barbers/:id?from=&to= -> BarberLedger
 */
export interface Payout {
  id: number;
  barber_id: number;
  barber_name: string;
  day: string;
  amount: number;
  paid_from: MoneyAccount;
  note: string | null;
  updated_at: number;
}

export interface PayoutInput {
  barber_id: number;
  amount: number | string; // AED
  paid_from: MoneyAccount;
  day?: string;
  note?: string | null;
}

export interface BarberBalance {
  id: number;
  name: string;
  avatar_url: string | null;
  active: boolean;
  earned: number; // commission (net of reversals)
  paid: number; // payouts (positive number)
  balance: number; // owed to the barber now, including any "Balance set"
}

export interface BarberLedger {
  barber: BarberBalance;
  from: string;
  to: string;
  opening: number; // owed before `from`
  lines: LedgerLine[]; // oldest first; balance = owed after the line
}

export interface ShopLedger {
  from: string;
  to: string;
  account: "all" | MoneyAccount;
  opening: { cash: number; bank: number }; // before `from`
  closing: { cash: number; bank: number }; // end of `to`
  lines: LedgerLine[]; // oldest first
}

/**
 * Audit log (admin only)
 *   GET /api/audit?entity=&actor_id=&from=&to=&q=&page=  -> Paged<AuditEntry>  (newest first; q matches ref, e.g. a bill no)
 *   GET /api/sales/:id/history                           -> AuditEntry[]       (oldest first)
 */
export interface AuditEntry {
  id: number;
  at: number;
  actor_id: number | null;
  actor_name: string;
  entity: string; // sale | expense | company_expense | payout | transfer | opening | user | service | settings
  entity_id: number | null;
  ref: string | null;
  action: string; // create | update | delete | password_reset
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed: string[]; // top-level keys that differ
}

/**
 * WhatsApp (Cloud API template messages)
 *   POST /api/sales/:id/whatsapp            -> WaMessage    (send the bill; barbers: own sales today)
 *   GET  /api/sales/:id/whatsapp            -> WaMessage | null (latest send of that bill)
 *   GET  /api/wa/templates                  -> WaTemplate[] (admin)
 *   POST /api/wa/templates  WaTemplateInput -> WaTemplate   (admin; submitted for Meta's review)
 *   POST /api/wa/test       WaTestInput     -> WaMessage    (admin)
 *   GET  /api/wa/audience                   -> { customers: number } (admin)
 *   GET  /api/wa/campaigns                  -> WaCampaign[] (admin)
 *   POST /api/wa/campaigns  WaCampaignInput -> WaCampaign   (admin; recipients queued)
 *   POST /api/wa/campaigns/:id/next         -> WaCampaign   (admin; sends the next batch of up to 40)
 *   POST /api/wa/reminders/run              -> WaReminderRun (admin)
 *   POST /api/wa/feedback/run               -> WaReminderRun (admin; sends due feedback requests)
 *   POST /api/wa/media      multipart file  -> { id }       (admin; image or mp4 uploaded to Meta for a media header)
 *   GET  /api/ratings?from&to               -> RatingsReport (admin)
 *   GET  /api/public/bill/:token            -> application/pdf (public; the bill as a PDF)
 *   GET  /api/public/review/:token          -> 302 to Google reviews (public; notes the tap on the bill)
 *   GET  /api/public/feedback/:token        -> FeedbackPage (public)
 *   POST /api/public/feedback/:token FeedbackInput -> FeedbackPage (public; one rating per bill, sending again updates it)
 *   PUT  /api/customers/:id/whatsapp {opt_out} -> Customer  (admin)
 *   GET/POST /api/wa/webhook                   Meta's callback (public): verification, delivery receipts, STOP replies
 */
export type WaStatus = "queued" | "sent" | "failed" | "skipped";

export interface WaMessage {
  id: number;
  kind: "bill" | "reminder" | "announcement" | "test" | "feedback";
  phone: string;
  template: string;
  status: WaStatus;
  error: string | null;
  created_at: number;
  delivered_at: number | null; // from Meta's webhook
  read_at: number | null;
}

export interface WaTemplate {
  id: string;
  name: string;
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  category: string;
  language: string;
  header: string | null; // a text header, which may have its own blank
  body: string;
  vars: number; // how many blanks in all (= slots.length)
  slots: WaSlot[]; // every blank to fill, header first
  sendable: boolean; // false for media headers or button links we can't fill
}

/** One blank in a template: {{1}} (numbered) or {{contact_name}} (named), in the header or the body. */
export interface WaSlot {
  part: "header" | "body";
  key: string; // "media" for a media header
  named?: true;
  media?: "image" | "video" | "document"; // the value is a Meta media id (or a link for a document)
}

/** One customer's rating of a visit. */
export interface Rating {
  id: number;
  sale_id: number;
  bill_no: string;
  day: string;
  barber_id: number;
  barber_name: string;
  customer_label: string;
  stars: number; // 1-5
  comment: string | null;
  created_at: number;
  updated_at: number;
}

export interface RatingsReport {
  from: string;
  to: string;
  count: number;
  average: number | null;
  barbers: { barber_id: number; barber_name: string; count: number; average: number }[];
  ratings: Rating[]; // newest first, up to 200 (from the old in-app rating page)
  /** "Rate your visit" goes to Google reviews: bills asked (request sent) and taps through to Google. */
  google: { asked: number; clicked: number; barbers: { barber_id: number; barber_name: string; asked: number; clicked: number }[] };
}

/** What the public rating page shows for a bill. */
export interface FeedbackPage {
  first_name: string;
  barber_name: string;
  bill_no: string;
  day: string;
  salon_name: string;
  phone: string | null;
  google_review_url: string | null;
  instagram_url: string | null;
  stars: number | null; // the rating already given, if any
  comment: string | null;
}

export interface FeedbackInput {
  stars: number;
  comment?: string | null;
}

export interface WaTemplateInput {
  name: string; // lower case, digits and _
  category: "MARKETING" | "UTILITY";
  body: string;
  examples: string[]; // one per {{n}}, for Meta's reviewer
}

/** Each blank: fixed text, or the recipient's first name. The server adds its slot (part and key). */
export type WaParam = ({ text: string } | { customer_name: true }) & Partial<WaSlot>;

export interface WaTestInput {
  template: string;
  params: WaParam[];
  to: string; // a mobile number
}

export interface WaCampaignInput {
  template: string;
  params: WaParam[];
}

export interface WaCampaign {
  id: number;
  template: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  queued: number;
  created_by_name: string | null;
  created_at: number;
  finished_at: number | null;
}

export interface WaReminderRun {
  due: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  sum?: number; // Σ amount of all matches (sales list)
}

export interface Totals {
  sales: number;
  count: number;
  commission: number;
  expense: number;
}

export interface MyReport {
  month: string;
  days: (Totals & { day: string; net: number })[]; // only days with activity, newest first
  totals: Totals & { net: number };
  today: Totals & { net: number; expense_note: string | null };
}

export interface BarberCol {
  id: number;
  name: string;
  active: boolean;
  avatar_url: string | null;
}

export interface DailySheet {
  month: string;
  barbers: BarberCol[];
  rows: {
    day: string;
    cells: Record<number, { sales: number; commission: number; expense: number; count: number }>;
    sales: number;
    expense: number; // barbers' expenses + company expenses
    company_expense: number;
    commission: number;
    profit: number;
  }[];
  totals: { cells: Record<number, { sales: number; commission: number; expense: number; count: number }>; sales: number; expense: number; company_expense: number; commission: number; profit: number };
}

export interface MonthlyReport {
  year: string;
  barbers: BarberCol[];
  months: { month: string; cells: Record<number, Totals>; totals: Totals & { profit: number; company_expense: number } }[]; // totals.expense includes company_expense
}

export interface Overview {
  today: string;
  from: string; // Dubai YYYY-MM-DD, inclusive
  to: string;
  totals: Totals & { profit: number; company_expense: number }; // the chosen range; expense includes company_expense
  prev_totals: Totals & { profit: number; company_expense: number }; // the same number of days just before it
  per_barber: (Totals & { id: number; name: string; avatar_url: string | null; expense_entered: boolean })[];
  series: { key: string; sales: number; profit: number }[]; // per day (≤ 92 days) or per month
  series_by: "day" | "month";
  recent: Sale[]; // latest sales in the range
}

export interface Customer {
  id: number;
  name: string | null;
  phone: string | null;
  visits: number;
  spent: number;
  last_visit_at: number | null;
  wa_opt_out: boolean; // never sent WhatsApp reminders or announcements
}

/** GET /api/customers/:id (admin): one customer's profile; their visits come from GET /api/sales?customer_id=. */
export interface CustomerDetail extends Customer {
  first_visit_at: number | null;
  avg_bill: number; // fils
  cash_visits: number;
  card_visits: number;
  barbers: { id: number; name: string; visits: number }[]; // most visits first
  services: { name: string; qty: number }[]; // most taken first, top 5
}
