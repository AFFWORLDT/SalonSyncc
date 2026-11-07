/**
 * API contract shared by the Worker and the web app (@ss/contract is the single source of truth).
 * All routes are under /api, JSON in/out, session cookie required except login and public receipts.
 * Errors: { error: string } with a 4xx/5xx status.
 * Money: integer minor units of the org currency (org_settings.currency_minor per unit). Day: org-timezone YYYY-MM-DD. Timestamps: epoch ms.
 *
 * Auth
 *   POST /api/auth/login        { org?, username, password }      -> { ok, slug }
 *   POST /api/auth/logout                                         -> { ok }
 *   GET  /api/me                                                  -> MeResponse
 *   PUT  /api/me/password       { current, next }                 -> { ok }
 *
 * Sales (barbers see and change only their own, and only today's)
 *   GET    /api/sales?day=&from=&to=&barber_id=&customer_id=&q=&payment_mode=&page=&page_size=  -> Paged<Sale> (with sum; page_size ≤ 200)
 *   POST   /api/sales           SaleInput                         -> Sale (201)
 *   PUT    /api/sales/:id       SaleInput                         -> Sale
 *   DELETE /api/sales/:id                                         -> { ok }
 *   GET    /api/public/receipt/:token                             -> Receipt   (no sign-in)
 *   GET    /api/public/services                                   -> {category,name,description,price}[]  (no sign-in, CORS *, for the website)
 *
 * Expenses (one per barber per day; a barber needs can_add_expense, logs only their own, only today)
 *   GET  /api/expenses?month=&day=&barber_id=                     -> Expense[]   (barbers: own only)
 *   PUT  /api/expenses          ExpenseInput                      -> Expense | { ok, deleted: true }
 *   GET  /api/company-expenses?month=                             -> CompanyExpense[]   (admin)
 *   POST /api/company-expenses  CompanyExpenseInput               -> CompanyExpense     (admin)
 *   PUT  /api/company-expenses/:id  CompanyExpenseInput           -> CompanyExpense · DELETE /api/company-expenses/:id -> { ok }
 *   Edits and deletes are compare-and-set: 409 { error, code: "stale" } when someone else changed the row first (reload).
 *
 * Reports
 *   GET /api/reports/me?month=YYYY-MM                             -> MyReport
 *   GET /api/reports/overview?from=&to=                           -> Overview          (admin; default today)
 *   GET /api/reports/daily?month=YYYY-MM                          -> DailySheet        (admin)
 *   GET /api/reports/monthly?year=YYYY                            -> MonthlyReport     (admin)
 *
 * Admin
 *   GET/POST /api/users, PUT/DELETE /api/users/:id, POST /api/users/:id/reset-password { password }
 *   GET /api/customers?q=&page=&page_size=  -> admin with customers_crm: Paged<Customer> (full list, q = name or phone digits)
 *                                        otherwise (barbers, and admins without customers_crm): Paged<CustomerSuggestion>,
 *                                        q of 3+ chars or an exact phone, max 8 results, own customers only, name + phone only
 *   GET /api/customers/:id            -> CustomerDetail   (admin, customers_crm)
 *   GET/PUT /api/settings
 *
 * Services catalogue
 *   GET    /api/services?all=1        (all=1: admin, includes hidden ones)  -> Service[]
 *   POST   /api/services  ServiceInput (admin) -> Service · PUT /api/services/:id · DELETE /api/services/:id
 *
 * Photos (stored in D1)
 *   GET    /api/public/avatar/:id/:v  image bytes (no sign-in; org from host, or ?org=<slug> on workers.dev; immutable)
 *   PUT    /api/me/avatar             body = image (webp/jpeg/png, max 200 KB)  -> { avatar_url }
 *   PUT    /api/users/:id/avatar      admin, same body
 *   DELETE /api/me/avatar | /api/users/:id/avatar
 */

export type Role = "owner" | "admin" | "barber";
export type PaymentMode = "cash" | "card";

/** The signed-in user as /api/me returns it. */
export interface MeUser {
  id: number;
  name: string;
  username: string;
  role: Role;
  commission_pct: number | null; // percent; null = the salon default
  avatar_url: string | null;
  can_add_expense: boolean;
}

/** GET /api/me */
export interface MeResponse {
  user: MeUser;
  org: { id: string; slug: string; name: string; status: string; planId: string };
  settings: SettingsResponse; // includes wa_ready (a boolean only; WhatsApp credentials are never returned)
  features: string[]; // enabled feature keys for the org's plan
  limits: { max_staff: number | null };
  subscription: { status: string; planId: string; trialEndsAt: number | null; graceEndsAt: number | null };
  brand: { name: string };
  today: string; // business day (YYYY-MM-DD) in the org timezone
  /** Support mode: a SalonKit support person is signed in as the owner (2 hours, audited). */
  support?: boolean;
}

/**
 * GET/PUT /api/settings (as SettingsResponse). snake_case like FM; rates are percents (5 = 5%); money in minor units.
 * FM's legacy whatsapp_mode is not ported.
 */
export interface Settings {
  display_name: string;
  salon_name_ar: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  licence_no: string | null;
  trn: string | null; // exactly 15 digits when phone_country is 971, else free text up to 40
  vat_enabled: boolean;
  vat_rate: number; // percent, 5 = 5%
  default_commission_pct: number; // percent, 20 = 20%
  quick_amounts: number[]; // major units, as typed by the user
  thank_you_text: string;
  receipt_footer: string | null;
  // Push notifications (hours are org timezone, 0-23).
  notify_sales: boolean; // admin: any new bill (by a barber or the admin)
  notify_sale_min: number; // minor units; 0 = every sale
  notify_summary: boolean; // admin: end-of-day summary at summary_hour
  summary_hour: number;
  notify_reminder: boolean; // barbers with no sale yet at reminder_hour
  reminder_hour: number;
  notify_barber_changes: boolean; // barber: the admin edited or deleted their sale
  google_review_url: string | null; // shown after a 4-5 star rating
  instagram_url: string | null;
  google_maps_url: string | null; // directions, on the public bill
  // Regional.
  timezone: string; // IANA
  day_start_hour: number; // 0-12; the business day starts at this local hour
  currency: string; // ISO 4217, 3 capitals
  locale: string;
  phone_country: string; // calling code digits, e.g. "971"
  bill_prefix: string; // 1-6 of A-Z 0-9
  // WhatsApp (sent only when the org has the whatsapp feature and a connected number). Template names: ^[a-z0-9_]{1,64}$.
  wa_bill_auto: boolean; // send the bill automatically after each sale with a phone
  wa_bill_template: string; // default ss_bill
  wa_bill_pdf_template: string; // default ss_bill_pdf
  wa_reminder_enabled: boolean; // "time for a fresh cut" reminders
  wa_reminder_days: number; // 1-90 days since the last visit
  wa_reminder_hour: number; // 0-23, org timezone
  wa_reminder_template: string; // default ss_fresh_cut
  wa_language: string; // Meta language code: "en", "en_US", "ar"
  wa_feedback_enabled: boolean; // rating request after a visit
  wa_feedback_delay_min: number; // 0-1440 minutes after the sale
  wa_feedback_template: string; // default ss_rating
  wa_feedback_reminder_min: number; // 0-1440 minutes after an unanswered request
  wa_feedback_reminder_template: string; // default ss_rating_reminder
  wa_rating_image_url: string | null; // https, <= 500; null = the generic SalonKit picture
  wa_rating_reminder_image_url: string | null;
  wa_fresh_cut_image_url: string | null;
  // Read-only (ignored on PUT).
  currency_minor: number; // minor units per major unit
  logo_url: string | null; // derived: /api/public/logo/<v>?org=<slug>; set via PUT/DELETE /api/settings/logo
  brand_color: string | null;
}

/** PUT /api/settings body: every editable field is required (full replace, like FM). */
export type SettingsInput = Omit<Settings, "currency_minor" | "logo_url" | "brand_color">;

/** Every key PUT /api/settings requires, so clients can build a complete body. The type check below keeps it in step with SettingsInput. */
export const SETTINGS_INPUT_KEYS = [
  "display_name", "salon_name_ar", "tagline", "address", "phone", "licence_no", "trn", "vat_enabled", "vat_rate",
  "default_commission_pct", "quick_amounts", "thank_you_text", "receipt_footer", "notify_sales", "notify_sale_min",
  "notify_summary", "summary_hour", "notify_reminder", "reminder_hour", "notify_barber_changes", "google_review_url",
  "instagram_url", "google_maps_url", "timezone", "day_start_hour", "currency", "locale", "phone_country", "bill_prefix", "wa_bill_auto",
  "wa_bill_template", "wa_bill_pdf_template", "wa_reminder_enabled", "wa_reminder_days", "wa_reminder_hour",
  "wa_reminder_template", "wa_language", "wa_feedback_enabled", "wa_feedback_delay_min", "wa_feedback_template",
  "wa_feedback_reminder_min", "wa_feedback_reminder_template", "wa_rating_image_url", "wa_rating_reminder_image_url",
  "wa_fresh_cut_image_url",
] as const satisfies readonly (keyof SettingsInput)[];
type _MissingSettingsKeys = Exclude<keyof SettingsInput, (typeof SETTINGS_INPUT_KEYS)[number]>;
const _settingsKeysComplete: [_MissingSettingsKeys] extends [never] ? true : _MissingSettingsKeys = true;
void _settingsKeysComplete;

/** GET/PUT /api/settings response: the settings plus whether WhatsApp can send (feature on and a number connected). */
export type SettingsResponse = Settings & { wa_ready: boolean };

/** PUT /api/settings/logo (raw png/jpeg/webp body, max 200 KB) and DELETE /api/settings/logo. */
export interface LogoResponse {
  logo_url: string | null;
}

/** POST/DELETE /api/push/tokens: this device's FCM registration token. */
export interface PushTokenInput {
  token: string;
}

/**
 * Announcements (admin only)
 *   GET  /api/announcements                 -> Announcement[]   (recent, newest first)
 *   POST /api/announcements  AnnouncementInput -> Announcement   (sends the push, then logs it)
 */
export interface Announcement {
  id: number;
  sender_id: number;
  sender_name: string;
  audience: "all" | "barber";
  target_id: number | null;
  target_name: string | null; // the barber's name when audience = "barber"
  title: string;
  body: string;
  recipients: number; // how many users it reached
  created_at: number;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  audience: "all" | "barber";
  barber_id?: number; // required when audience = "barber"
}

/**
 * Notification feed (the top-bar bell), per signed-in user.
 *   GET  /api/notifications?limit=  -> NotificationFeed
 *   POST /api/notifications/read  NotificationReadInput -> { ok }   (the given ids, or all unread when ids is omitted)
 * Both need feature `push` (403 otherwise).
 */
export interface NotificationReadInput {
  ids?: number[]; // at most 50; ids that aren't the signed-in user's are ignored
}

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  path: string | null;
  created_at: number;
  read_at: number | null; // null = unread
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

/**
 * POST/PUT /api/users body. On PUT, an omitted optional field keeps its stored value; for `phone` and `commission_pct`
 * an explicit null or "" clears it (commission then falls back to the org default). On POST, omitted means none.
 */
export interface UserInput {
  name: string;
  username: string;
  phone?: string | null; // PUT: omitted = keep, null/"" = clear
  password?: string; // required on create
  role?: Role;
  commission_pct?: number | null; // PUT: omitted = keep, null/"" = clear (use the org default)
  sort_order?: number;
  active?: boolean;
  can_add_expense?: boolean;
}

export interface Service {
  id: number;
  category: string;
  name: string;
  description: string | null;
  price: number; // minor units
  sort_order: number;
  active: boolean;
}

export interface ServiceInput {
  category: string;
  name: string;
  description?: string | null;
  price: number | string; // major units, as typed by the user
  sort_order?: number;
  active?: boolean;
}

/** One line on a bill. service_id is null for a one-off item. name/price are snapshots. */
export interface SaleItem {
  service_id: number | null;
  name: string;
  price: number; // minor units per unit
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
  commission_pct: number; // percent (20 = 20%), snapshot at sale time
  commission: number; // minor units
  vat_rate: number; // percent (5 = 5%); 0 when VAT was off
  vat_amount: number; // minor units, inside amount
  created_at: number;
  items: SaleItem[]; // empty for an amount-only sale
}

export interface SaleInput {
  /** Major units. Ignored when items are given (the total is their sum). */
  amount?: number | string;
  /** At most 30. Catalogue services ({service_id, qty, price? (major units, when changed on the bill; else the catalogue price)}) and/or one-off items ({name, price (major units), qty}). qty is clamped to 1..20. */
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
  /** The sale's own org's branding (from the token's row, never the host). salon_name = display_name (FM name). */
  salon: { salon_name: string } & Pick<
    Settings,
    "display_name" | "salon_name_ar" | "tagline" | "address" | "phone" | "trn" | "licence_no" | "receipt_footer" | "google_maps_url" | "logo_url" | "currency" | "currency_minor" | "locale" | "timezone"
  >;
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
  amount: number | string; // major units, as typed by the user; 0 deletes the day's entry
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
  amount: number | string; // major units, as typed by the user
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
 *   Transfer/payout edits and deletes, and PUT balances, are compare-and-set: 409 { error, code: "stale" } when someone
 *   else changed them first (reload). Feature `ledger`; 403 { code: "feature_disabled" } without it.
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
  amount: number | string; // major units, as typed by the user
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

/** What the admin counted right now, in major units. Barbers not listed keep their balance. */
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
  amount: number; // signed minor units
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
  amount: number | string; // major units, as typed by the user
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
 *   GET    /api/whatsapp/config                -> WaConfigView | null (owner/admin; never the token)
 *   PUT    /api/whatsapp/config WaConfigInput  -> { wa_ready: true }  (owner/admin; 409 when another salon has the number)
 *   DELETE /api/whatsapp/config                -> { wa_ready: false } (owner/admin)
 */
/** The salon's own Meta WhatsApp number. The token is write-only: stored encrypted, never returned. */
export interface WaConfigInput {
  phone_number_id: string; // 5-25 digits
  waba_id: string; // 5-25 digits
  token: string; // non-empty, at most 512 chars, no whitespace
  test_numbers?: string | null; // comma-separated phones (at most 20); when set only these are messaged
}

export interface WaConfigView {
  phone_number_id: string;
  waba_id: string;
  test_numbers: string[]; // canonical phones; empty = everyone is messaged
  has_token: true;
}

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
  from: string; // org-timezone YYYY-MM-DD, inclusive
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

/** GET /api/customers autocomplete row (the sale form). */
export type CustomerSuggestion = Pick<Customer, "id" | "name" | "phone">;

/** GET /api/customers/:id (admin): one customer's profile; their visits come from GET /api/sales?customer_id=. */
export interface CustomerDetail extends Customer {
  first_visit_at: number | null;
  avg_bill: number; // minor units
  cash_visits: number;
  card_visits: number;
  barbers: { id: number; name: string; visits: number }[]; // most visits first
  services: { name: string; qty: number }[]; // most taken first, top 5
}
