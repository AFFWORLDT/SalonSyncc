# FM Salon -> SalonStation port inventory (2026-11-02)

Source: `/Users/laxmikant/Desktop/ERP/gents-salon` (read-only). `api/` = Hono Worker + D1 (src ~5,500 LOC incl. 2,156 routes.ts), `web/` = Next 16 static export (~12.8k LOC).
Conventions in FM: money = integer fils (AED x 100); `day` = business day `YYYY-MM-DD` (Dubai, day starts 04:00); timestamps = epoch ms; booleans = INTEGER 0/1; `PRAGMA foreign_keys` is ON (users delete code clears FK children manually, routes.ts:1912-1920).
Facts that bite multi-tenancy are collected in section 8 ("Tenancy hazards") - read it before planning.

---

## 1. Final schema per table (replay of migrations 0001-0020)

21 tables. "Last" = last migration touching it. org_id is NOT present anywhere in FM (single tenant); add per SalonStation rules.

### settings (single row, `id=1`) - last 0017 (+0019/0020 data)
Final columns (name TYPE constraints DEFAULT) with the migration that added them:
| col | type / constraint | default | mig |
|---|---|---|---|
| id | INTEGER PK CHECK(id=1) | - | 0001 |
| salon_name | TEXT NOT NULL | seed 'Faizan Mohammed Gents Salon' | 0001 |
| salon_name_ar | TEXT | seed FM Arabic | 0001 |
| tagline | TEXT | seed FM | 0001 |
| address | TEXT | seed 'Shop 3, Rokane G24, Warsan 4, Dubai, UAE' | 0001 |
| phone | TEXT | seed '0558422430' | 0001 |
| licence_no | TEXT | seed '1014250' | 0001 |
| trn | TEXT | NULL (UAE VAT id; route validates exactly 15 digits, routes.ts:2053) | 0001 |
| vat_enabled | INTEGER NOT NULL | 0 | 0001 |
| vat_rate | REAL NOT NULL | 0.05 | 0001 |
| default_commission_pct | REAL NOT NULL | 0, then seed UPDATE to 20 | 0001/0002 |
| quick_amounts | TEXT NOT NULL (csv AED) | '15,20,25,30,35,50' | 0001 |
| whatsapp_mode | TEXT NOT NULL CHECK IN('off','link') | 'link' | 0001 (legacy; only stored/echoed) |
| thank_you_text | TEXT NOT NULL | seed FM text w/ {name}{salon}{amount}{link} | 0001 |
| receipt_footer | TEXT | seed 'Thank you for visiting...' | 0001 |
| updated_at | INTEGER NOT NULL | seed 0 | 0001 |
| notify_sales | INTEGER NOT NULL | 1 | 0005 |
| notify_sale_min | INTEGER NOT NULL (fils) | 0 | 0005 |
| notify_summary | INTEGER NOT NULL | 1 | 0005 |
| summary_hour | INTEGER NOT NULL (Dubai hour) | 23 | 0005 |
| notify_reminder | INTEGER NOT NULL | 1 | 0005 |
| reminder_hour | INTEGER NOT NULL (Dubai hour) | 13 | 0005 |
| notify_barber_changes | INTEGER NOT NULL | 1 | 0005 |
| wa_bill_auto | INTEGER NOT NULL | 0 | 0013 |
| wa_bill_template | TEXT NOT NULL | 'fm_bill' (not editable via PUT /settings) | 0013 |
| wa_reminder_enabled | INTEGER NOT NULL | 0 | 0013 |
| wa_reminder_days | INTEGER NOT NULL | 15 | 0013 |
| wa_reminder_hour | INTEGER NOT NULL | 11 | 0013 |
| wa_reminder_template | TEXT NOT NULL | 'fm_visit_reminder' -> UPDATE 'fm_fresh_cut' (0019); not editable via API | 0013/0019 |
| wa_language | TEXT NOT NULL | 'en' (not editable via API) | 0013 |
| wa_feedback_enabled | INTEGER NOT NULL | 0 | 0016 |
| wa_feedback_delay_min | INTEGER NOT NULL | 120, then `UPDATE ... = 0` (0017, data) | 0016/0017 |
| wa_feedback_template | TEXT NOT NULL | 'fm_feedback' -> UPDATE 'fm_rating' (0019); not editable via API | 0016/0019 |
| google_review_url | TEXT | DEFAULT FM maps.app.goo.gl link (column default!), UPDATE to FM writereview?placeid (0020) | 0016/0020 |
| instagram_url | TEXT | DEFAULT 'https://www.instagram.com/f.m_salon_/' | 0016 |
| wa_feedback_reminder_min | INTEGER NOT NULL (0=none) | 120 | 0017 |
| wa_feedback_reminder_template | TEXT NOT NULL | 'fm_feedback_reminder' -> UPDATE 'fm_rating_reminder' (0019); not editable | 0017/0019 |
Dropped: `barber_expenses` (added 0008, dropped 0009; replaced by users.can_add_expense). Read via `SELECT *` (db.ts:41) so any added column leaks into SettingsRow; `getSettings` maps only a subset to the `Settings` contract (template/language columns are NOT exposed in the API, only read directly by wa-jobs `waConfig`).
Idx/unique: none.

### users - last 0009
`id INTEGER PK AUTOINCREMENT; name TEXT NOT NULL; username TEXT NOT NULL UNIQUE COLLATE NOCASE; phone TEXT; password_hash TEXT NOT NULL; role TEXT NOT NULL CHECK IN('admin','barber'); commission_pct REAL (NULL=use settings default); sort_order INTEGER NOT NULL DEFAULT 0; active INTEGER NOT NULL DEFAULT 1; session_version INTEGER NOT NULL DEFAULT 1; created_at INTEGER NOT NULL; updated_at INTEGER NOT NULL; avatar BLOB; avatar_type TEXT; avatar_v INTEGER NOT NULL DEFAULT 0; can_add_expense INTEGER NOT NULL DEFAULT 0`. (0003 avatars, 0009 can_add_expense).
Unique: username (global, NOCASE). Indexes: none besides the unique. `USER_COLS` (db.ts:93) deliberately omits avatar/avatar_type.

### customers - last 0013
`id PK AUTOINCREMENT; name TEXT; phone TEXT UNIQUE (canonical: 05XXXXXXXX UAE, +<digits> other); visits INTEGER NOT NULL DEFAULT 0; spent INTEGER NOT NULL DEFAULT 0; last_visit_at INTEGER; created_at INTEGER NOT NULL; wa_opt_out INTEGER NOT NULL DEFAULT 0 (0013); wa_reminded_at INTEGER (0013)`. Unique: phone (global; nullable). Indexes: none.

### sales - last 0020
`id PK AUTOINCREMENT; bill_no TEXT NOT NULL UNIQUE; token TEXT NOT NULL UNIQUE (public link); day TEXT NOT NULL; barber_id INTEGER NOT NULL REF users; customer_id INTEGER REF customers; customer_label TEXT NOT NULL; amount INTEGER NOT NULL CHECK(amount>0); payment_mode TEXT NOT NULL CHECK IN('cash','card'); note TEXT; commission_pct REAL NOT NULL; commission INTEGER NOT NULL; vat_rate REAL NOT NULL; vat_amount INTEGER NOT NULL; created_by INTEGER NOT NULL REF users; created_at INTEGER NOT NULL; updated_at INTEGER NOT NULL; deleted_at INTEGER (soft delete); wa_feedback_at INTEGER (0016); wa_feedback_reminded_at INTEGER (0017); review_clicked_at INTEGER (0020)`.
Indexes: `sales_day (day, barber_id) WHERE deleted_at IS NULL`; `sales_barber_day (barber_id, day)`; `sales_customer (customer_id)`; `sales_review_clicked (review_clicked_at)`. Uniques: bill_no, token (both global).

### sale_items - last 0004
`id PK AUTOINCREMENT; sale_id INTEGER NOT NULL REF sales; service_id INTEGER REF services (NULL one-off); name TEXT NOT NULL (snapshot); price INTEGER NOT NULL (fils/unit snapshot); qty INTEGER NOT NULL DEFAULT 1 CHECK(qty>0)`. Index `sale_items_sale (sale_id)`. Items are inserted with `sale_id = (SELECT id FROM sales WHERE bill_no = ?)` (routes.ts:618-623).

### services - last 0004
`id PK AUTOINCREMENT; category TEXT NOT NULL; name TEXT NOT NULL; description TEXT; price INTEGER NOT NULL CHECK(price>=0); sort_order INTEGER NOT NULL DEFAULT 0; active INTEGER NOT NULL DEFAULT 1; created_at; updated_at (INTEGER NOT NULL)`. Index `services_order (sort_order, id)`. FM seed of 16 services in 0004.

### expenses (barber, one per barber per day) - last 0001
`id PK AUTOINCREMENT; barber_id INTEGER NOT NULL REF users; day TEXT NOT NULL; amount INTEGER NOT NULL CHECK(amount>0); note TEXT; created_at; updated_at (INTEGER NOT NULL); UNIQUE(barber_id, day)`. Index `expenses_day (day)`. Upsert uses ON CONFLICT(barber_id, day) (routes.ts:~958).

### company_expenses - last 0012
`id PK AUTOINCREMENT; day TEXT NOT NULL; amount INTEGER NOT NULL CHECK(amount>0); note TEXT NOT NULL; created_by INTEGER REF users ON DELETE SET NULL; created_at; updated_at (INTEGER NOT NULL); paid_from TEXT NOT NULL DEFAULT 'cash' CHECK IN('cash','bank') (0012)`. Index `company_expenses_day (day)`.

### counters - last 0001
`name TEXT PK; seq INTEGER NOT NULL`. Keys used: `bill_YYYYMMDD`, `cust_YYYYMMDD` (db.ts nextSeq: INSERT..ON CONFLICT DO UPDATE seq+1 RETURNING). GLOBAL PK -> must become (org_id, name).

### login_failures - last 0001
`key TEXT PK; n INTEGER NOT NULL; first_at INTEGER NOT NULL`. Keys `ip:<ip>`, `u:<username>|<ip>`, `u:<username>` (limits.ts:10-16). Username keys are not org-scoped.

### rate_hits - 0018
`key TEXT PK; window INTEGER NOT NULL; n INTEGER NOT NULL`. Keys `pub:<ip>` / `pdf:<ip>`. Per-IP; probably stay global (no org_id) or keep as infra table.

### push_tokens - 0005
`token TEXT PK; user_id INTEGER NOT NULL REF users; created_at; updated_at (INTEGER NOT NULL)`. Index `push_tokens_user (user_id)`. Token follows whoever signs in on that device.

### announcements - 0006
`id PK AUTOINCREMENT; sender_id INTEGER NOT NULL REF users; audience TEXT NOT NULL ('all'|'barber'); target_id INTEGER REF users; title TEXT NOT NULL; body TEXT NOT NULL; recipients INTEGER NOT NULL; created_at INTEGER NOT NULL`. Index `announcements_created (created_at)`.

### notifications - 0007
`id PK AUTOINCREMENT; user_id INTEGER NOT NULL REF users; title TEXT NOT NULL; body TEXT; path TEXT; created_at INTEGER NOT NULL; read_at INTEGER`. Index `notifications_user (user_id, created_at)`.

### audit_log - 0011 (append only)
`id PK AUTOINCREMENT; at INTEGER NOT NULL; actor_id INTEGER REF users ON DELETE SET NULL; actor_name TEXT NOT NULL; entity TEXT NOT NULL; entity_id INTEGER; ref TEXT; action TEXT NOT NULL; before TEXT (JSON); after TEXT (JSON)`. Indexes `audit_entity (entity, entity_id)`, `audit_at (at)`. entity values: sale, expense, company_expense, payout, transfer, opening, user, service, settings (WA template/campaign/opt-out also logged as entity 'settings'). Action: create/update/delete/password_reset.

### ledger_entries - last 0012 (never rewritten; reversal rows)
`id PK AUTOINCREMENT; at INTEGER NOT NULL; day TEXT NOT NULL; book TEXT NOT NULL CHECK IN('shop','barber'); account TEXT CHECK IN('cash','bank'); barber_id INTEGER REF users; amount INTEGER NOT NULL (signed fils); kind TEXT NOT NULL; source TEXT NOT NULL; source_id INTEGER NOT NULL; ref TEXT; memo TEXT NOT NULL; reverses_id INTEGER REF ledger_entries; reversed INTEGER NOT NULL DEFAULT 0; actor_id INTEGER REF users ON DELETE SET NULL`. Indexes `ledger_book_day (book, day)`, `ledger_source (source, source_id)`, `ledger_barber_day (barber_id, day)`. source in sale|expense|company_expense|payout|transfer|opening; `opening` uses source_id=0 for the shop and source_id=<barber id> per barber (routes.ts:1172-1210).

### barber_payouts - 0012
`id PK AUTOINCREMENT; barber_id INTEGER NOT NULL REF users; day TEXT NOT NULL; amount INTEGER NOT NULL CHECK(amount>0); paid_from TEXT NOT NULL CHECK IN('cash','bank'); note TEXT; created_by INTEGER REF users ON DELETE SET NULL; created_at; updated_at (INTEGER NOT NULL)`. Index `payouts_day (day)`.

### money_transfers - 0012
`id PK AUTOINCREMENT; day TEXT NOT NULL; amount INTEGER NOT NULL CHECK(amount>0); from_account, to_account TEXT NOT NULL CHECK IN('cash','bank'); note TEXT; created_by INTEGER REF users ON DELETE SET NULL; created_at; updated_at (INTEGER NOT NULL); CHECK(from_account <> to_account)`. Index `transfers_day (day)`.

### wa_campaigns - 0013
`id PK AUTOINCREMENT; template TEXT NOT NULL; language TEXT NOT NULL; params TEXT NOT NULL (JSON WaParam[]); total INTEGER NOT NULL DEFAULT 0; created_by INTEGER REF users ON DELETE SET NULL; created_at INTEGER NOT NULL; finished_at INTEGER`.

### wa_messages - last 0016 (table rebuilt: wa_messages_new -> renamed)
`id PK AUTOINCREMENT; kind TEXT NOT NULL CHECK IN('bill','reminder','announcement','test','feedback'); customer_id INTEGER REF customers ON DELETE SET NULL; phone TEXT NOT NULL; template TEXT NOT NULL; params TEXT (JSON); status TEXT NOT NULL CHECK IN('queued','sent','failed','skipped'); wa_id TEXT; error TEXT; sale_id INTEGER REF sales ON DELETE SET NULL; campaign_id INTEGER REF wa_campaigns ON DELETE CASCADE; created_by INTEGER REF users ON DELETE SET NULL; created_at INTEGER NOT NULL; sent_at INTEGER; delivered_at INTEGER; read_at INTEGER`.
Indexes (recreated in 0016 after rebuild): `wa_messages_campaign (campaign_id, status)`, `wa_messages_sale (sale_id)`, `wa_messages_created (created_at)`, `wa_messages_wa_id (wa_id)`. NOTE `sent_at` doubles as the campaign-drain claim marker (wa-jobs.ts:245-256).
Port gotcha: the 0016 rebuild pattern (CREATE new / copy / DROP / RENAME) is the only way to change a CHECK; SalonStation should define the final DDL directly, not replay.

### ratings - 0016
`id PK AUTOINCREMENT; sale_id INTEGER NOT NULL UNIQUE REF sales ON DELETE CASCADE; customer_id INTEGER REF customers ON DELETE SET NULL; barber_id INTEGER NOT NULL REF users; stars INTEGER NOT NULL CHECK BETWEEN 1 AND 5; comment TEXT; created_at; updated_at (INTEGER NOT NULL)`. Indexes `ratings_barber (barber_id, created_at)`, `ratings_created (created_at)`.

### Migration classification
| # | file | structural | FM-only data (do NOT port) |
|---|---|---|---|
| 0001 | init | all base tables + indexes | INSERT settings row (FM name/AR name/address/phone/licence/thank-you) -> becomes per-org settings default row created at org signup |
| 0002 | default_commission_20 | - | **FM seed** `UPDATE settings SET default_commission_pct=20` |
| 0003 | avatars | users.avatar* | - |
| 0004 | services | services, sale_items | **FM seed** 16 FM price-sheet services (categories Haircuts / Beard & shave / Colour & care / Face & extras) -> optional per-org starter catalogue |
| 0005 | push_notifications | push_tokens + 7 settings cols | - (defaults 23h/13h are Dubai hours) |
| 0006 | announcements | table | - |
| 0007 | notifications | table | - |
| 0008 | barber_expenses | (settings col, dropped in 0009) | - |
| 0009 | per_barber_expenses | users.can_add_expense; DROP settings.barber_expenses | - |
| 0010 | company_expenses | table | - |
| 0011 | audit_log | table | - |
| 0012 | ledger | ledger_entries, barber_payouts, money_transfers, company_expenses.paid_from | **FM go-live backfill**: 4 INSERT..SELECT posting ledger lines for all existing sales/expenses/company_expenses (skip) |
| 0013 | whatsapp | settings wa_* cols, customers wa_*, wa_campaigns, wa_messages | defaults 'fm_bill','fm_visit_reminder' are FM template names (schema-level hardcode) |
| 0014 | whatsapp_delivery | wa_messages.delivered_at/read_at + wa_id index | - |
| 0015 | business_day_4am | - | **FM-only data fix**: re-days sales made 00:00-04:00 Dubai, ledger + audit rows (skip; uses UTC+4 math) |
| 0016 | whatsapp_feedback | settings feedback cols, sales.wa_feedback_at, ratings, wa_messages rebuild | column DEFAULTs = FM Google/Instagram URLs, 'fm_feedback' |
| 0017 | feedback_reminder | sales.wa_feedback_reminded_at, 2 settings cols | **FM data** `UPDATE settings SET wa_feedback_delay_min=0`; default 'fm_feedback_reminder' |
| 0018 | rate_hits | table | - |
| 0019 | picture_templates | - | **FM data**: switches settings template names to fm_rating / fm_rating_reminder / fm_fresh_cut |
| 0020 | google_review | sales.review_clicked_at + index | **FM data**: FM Google placeid URL UPDATE |
Also: `api/scripts/sync-stage-from-prod.sh`, `api/scripts/demo` and root `fm-salon-db-backup-*.sql` are ops artefacts (not ported; backups contain real customer data - not opened).

---

## 2. Route inventory

Base: all under `/api` (index.ts mounts `routes` at `/api`; routes.ts = `api` Hono, `api.onError` maps `HttpError(400/401/403/404/409/429)` -> `{error}`, else 500 "Something went wrong"). index.ts middleware (`app.use("/api/*")`): `ensureSeed(env)`, then no-store + nosniff + X-Frame DENY + Referrer-Policy headers; unknown `/api/*` -> 404 `{error:"Not found"}`; everything else -> `ASSETS.fetch` (static web). Cookie `fm_session` (HMAC-signed `{uid,v,exp}`, 60 days, HttpOnly, Lax).
Auth levels: P=public, U=any signed-in active user, A=admin (`requireAdmin`), B=barber-scoped U (admin sees all), W=webhook (Meta). Session gate = `api.use("*")` at routes.ts:389-400 (everything registered after it needs U); it loads the user row from D1 every request and compares `session_version`.
Response types are from contract.ts (type names in backticks). Helper module column uses the short names: money, ledger, audit (audit.ts), reports, limits, push, pdf, wa (whatsapp.ts), waj (wa-jobs.ts), db, crypto.

Line-range map of routes.ts: helpers 17-110 | public 111-387 | gate+me+password 389-432 | push tokens 434-457 | notification feed 459-481 | announcements 483-530 | sales 532-912 | expenses 914-983 | company expenses 985-1063 | ledger/transfers/balances 1065-1242 | payouts/barber book 1244-1378 | WhatsApp 1380-1554 | ratings 1556-1596 | customer wa opt-out 1598-1610 | audit 1612-1671 | reports 1673-1695 | customers 1697-1782 | users 1784-1921 | photos 1923-1957 | services 1959-2035 | settings 2037-2155.

Legend feature keys: `core` (login/me/settings/staff/services/bills), plus the 14 requested keys.

### 2.1 Public / webhook (routes.ts:111-387)
| M | path (line) | auth | reads / writes | helpers | response | feature |
|---|---|---|---|---|---|---|
| POST | /auth/login (125) | P (rate limited by login_failures) | R users, login_failures; W login_failures (clear/insert) | crypto.checkPassword/sign, limits.loginLimits/isLocked/LOGIN_WINDOW_MS | `{ok:true}` + cookie | core |
| POST | /auth/logout (165) | P | - | - | `{ok}` | core |
| (mw) | /public/* (174) | P | W rate_hits | limits.PUBLIC_LIMITS/minuteWindow | 429 + Retry-After | core (applies to all public routes) |
| GET | /public/receipt/:token (200) | P | R sales(+items,users,customers via SALE_SELECT), settings | db.getSettings, receiptOf | `Receipt` | core |
| GET | /public/bill/:token (209) | P (pdf bucket 10/min) | R sales, settings | pdf.billPdf, SALON_WHATSAPP const (206) | application/pdf | whatsapp (used only as WA document header; could be core) |
| GET | /public/review/:token (252) | P | W sales.review_clicked_at; R settings | db.getSettings, GOOGLE_REVIEW_FALLBACK const (246) | 302 redirect | ratings |
| GET | /public/feedback/:token (266) | P | R sales, ratings, customers, settings | feedbackPage (224), wa.firstName | `FeedbackPage` | ratings |
| POST | /public/feedback/:token (269) | P | R/W ratings (upsert on sale_id); R users(admin ids); W notifications | push.adminIds/recordNotifications/pushToUsers (waitUntil) | `FeedbackPage` | ratings |
| GET | /wa/webhook (338) | W (echoes hub.challenge for ANY verify token) | - | - | text | whatsapp |
| POST | /wa/webhook (344) | W (HMAC `x-hub-signature-256` only if WA_APP_SECRET set) | W wa_messages (delivered/read/failed by wa_id), W customers.wa_opt_out by phone | wa.webhookEvents/validSignature, money.canonicalPhone | text "ok" | whatsapp |
| GET | /public/services (368) | P, CORS `*`, cache 60s | R services | - | `{category,name,description,price}[]` | public_services_api |
| GET | /users/:id/avatar (378) | P (no session; registered before gate) | R users.avatar | - | image bytes, immutable cache | core |

### 2.2 Session, me, push, notifications, announcements (389-530)
| M | path (line) | auth | tables | helpers | response | feature |
|---|---|---|---|---|---|---|
| GET | /auth/me (402) | U | R users, settings | db.getSettings, avatarUrl, today() | `{user: Me, settings: Settings, today}` | core |
| PUT | /me/password (420) | U | R/W users (password_hash, session_version) | crypto | `{ok}` + fresh cookie | core |
| POST | /push/tokens (439) | U | W push_tokens (upsert) | - | `{ok}` (body `PushTokenInput`) | push |
| DELETE | /push/tokens (452) | U | W push_tokens | - | `{ok}` | push |
| GET | /notifications (462) | U | R notifications | - | `NotificationFeed` | push (feed also written by sales/ratings; tie to `push`) |
| POST | /notifications/read (477) | U | W notifications.read_at | - | `{ok}` | push |
| GET | /announcements (490) | A | R announcements, users | - | `Announcement[]` | announcements |
| POST | /announcements (497) | A | R users; W announcements, notifications; FCM | push (notify()) | `Announcement` 201 (`AnnouncementInput`) | announcements |

### 2.3 Sales (532-912)
| M | path (line) | auth | tables | helpers | response | feature |
|---|---|---|---|---|---|---|
| GET | /sales (639) | B (barber: own only) | R sales, sale_items, users, customers; filters day/from/to/barber_id/q/customer_id/payment_mode, paging | db.SALE_SELECT/listSales, money.DAY_RE | `Paged<Sale>` (items,total,sum) | core_sales |
| POST | /sales (688) | U (admin may set barber_id, past day) | R settings, users, services; W sales, sale_items, customers (upsert), counters, audit_log, ledger_entries; async customers stats, WA bill+feedback, notifications/FCM | db.nextSeq/getSettings, money.toFils/commissionOf/vatOf/canonicalPhone/businessDay, crypto.randomToken, audit, ledger.saleLines/postStmts, waj.sendBill/runFeedback, push | `Sale` 201 (`SaleInput`) | core_sales |
| PUT | /sales/:id (811) | B (barber: own + same business day only; admin any) | R/W sales, sale_items (delete+reinsert), customers, counters(cust_), audit_log, ledger_entries (reverse+repost only if money lines changed), notifications | ledger.needsRepost, audit | `Sale` | core_sales |
| DELETE | /sales/:id (894) | B (same rules) | W sales.deleted_at, audit_log, ledger reversal, customers stats | ledger.reverseStmts | `{ok}` | core_sales |
| GET | /sales/:id/whatsapp (1420) | B | R wa_messages | waj.WA_MESSAGE_SELECT | `WaMessage \| null` | whatsapp |
| POST | /sales/:id/whatsapp (1426) | B (needs waReady) | R sales/settings; W wa_messages; Graph API | waj.sendBill | `WaMessage` | whatsapp |
| GET | /sales/:id/history (1665) | A | R audit_log | audit.changedFields | `AuditEntry[]` | audit_log |
Internal helpers (not routes): saleBarber 535 (active barber check), upsertCustomer 549 (ON CONFLICT(phone) rename rule: admin overwrites name, barber only fills), refreshCustomerStats 565, resolveItems 584 (MAX_ITEMS 30, qty cap 20, catalogue price override), itemInserts 618, readSaleInput 626, editableSale 786, notify 798, aedText 809.
Bill number: `FM-<YYYYMMDD>-<seq3>` at routes.ts:~716 (`billNo = \`FM-${stamp}-${...}\``); customer label `Customer N` from counter `cust_<stamp>`.

### 2.4 Expenses, company expenses (914-1063)
| M | path (line) | auth | tables | helpers | response | feature |
|---|---|---|---|---|---|---|
| GET | /expenses (919) | B | R expenses, users | - | `Expense[]` | expenses |
| PUT | /expenses (938) | B (barber needs users.can_add_expense; amount 0 deletes) | R/W expenses (upsert barber_id+day), audit_log, ledger (cash) | ledger.expenseLines | `Expense \| {ok,deleted}` (`ExpenseInput`) | expenses |
| GET | /company-expenses (1008) | A | R company_expenses, users | - | `CompanyExpense[]` | expenses |
| POST | /company-expenses (1018) | A | W company_expenses, audit_log, ledger; uses `(SELECT MAX(id) ...)` | ledger.companyExpenseLines | `CompanyExpense` | expenses (ledger posting = ledger) |
| PUT | /company-expenses/:id (1033) | A | same | | `CompanyExpense` | expenses |
| DELETE | /company-expenses/:id (1053) | A | W company_expenses, audit, ledger reversal | | `{ok}` | expenses |

### 2.5 Ledger: transfers, balances, shop book, payouts, barber book (1065-1378) - all A
| M | path (line) | tables | helpers | response | feature |
|---|---|---|---|---|---|
| GET | /transfers (1091) | R money_transfers | - | `Transfer[]` | ledger |
| POST | /transfers (1101) | W money_transfers, audit, ledger(2 lines); MAX(id) pattern | ledger.transferLines | `Transfer` 201 | ledger |
| PUT | /transfers/:id (1117) | same | | `Transfer` | ledger |
| DELETE | /transfers/:id (1138) | | | `{ok}` | ledger |
| GET | /ledger/balances (1163) | R ledger_entries | `balances()` 1151 | `Balances` | ledger |
| PUT | /ledger/balances (1172) | R/W ledger_entries (source 'opening', source_id 0 / barber id), audit | signedFils, ledger.openingLines/reverseStmts/postStmts | `Balances` (`BalanceInput`) | ledger |
| GET | /ledger/shop (1212) | R ledger_entries, users | | `ShopLedger` (opening/closing/lines w/ running balance) | ledger |
| GET | /payouts (1267) | R barber_payouts, users | | `Payout[]` | ledger |
| POST | /payouts (1283) | W barber_payouts, audit, ledger (shop -, barber -); MAX(id) | ledger.payoutLines | `Payout` 201 | ledger |
| PUT | /payouts/:id (1299) | | | `Payout` | ledger |
| DELETE | /payouts/:id (1320) | | | `{ok}` | ledger |
| GET | /ledger/barbers (1350) | R users, ledger_entries (`barberBalances` 1333) | | `BarberBalance[]` | ledger |
| GET | /ledger/barbers/:id (1355) | R ledger_entries | | `BarberLedger` | ledger |

### 2.6 WhatsApp / ratings / opt-out (1380-1610)
| M | path (line) | auth | tables | helpers | response | feature |
|---|---|---|---|---|---|---|
| GET | /wa/templates (1434) | A (+waReady) | Graph `{WABA}/message_templates` | wa.listTemplates | `WaTemplate[]` | whatsapp_campaigns |
| POST | /wa/templates (1440) | A | Graph create; audit_log | wa.createTemplate/templateVars/templateSlots | `WaTemplate` 201 (`WaTemplateInput`) | whatsapp_campaigns |
| POST | /wa/test (1463) | A | W wa_messages; Graph | waj.sendTest, readParams, approvedTemplate | `WaMessage` (`WaTestInput`) | whatsapp_campaigns |
| GET | /wa/audience (1476) | A | R customers (`phone NOT NULL AND wa_opt_out=0`) | | `{customers}` | whatsapp_campaigns |
| GET | /wa/campaigns (1482) | A | R wa_campaigns, wa_messages | waj.CAMPAIGN_SELECT | `WaCampaign[]` | whatsapp_campaigns |
| POST | /wa/campaigns (1488) | A | W wa_campaigns, wa_messages (bulk queued rows from customers), audit; `MAX(id)` | | `WaCampaign` 201 (`WaCampaignInput`) | whatsapp_campaigns |
| POST | /wa/campaigns/:id/next (1515) | A | W wa_messages/wa_campaigns; Graph | waj.drainCampaign (40/batch) | `WaCampaign` | whatsapp_campaigns |
| POST | /wa/reminders/run (1523) | A | W wa_messages, customers.wa_reminded_at | waj.runReminders | `WaReminderRun` | whatsapp |
| POST | /wa/feedback/run (1529) | A | W wa_messages, sales.wa_feedback_at/_reminded_at | waj.runFeedback/runFeedbackReminders | `WaReminderRun` | whatsapp (+ratings) |
| POST | /wa/media (1541) | A | Graph /media (jpg/png<=5MB, mp4<=16MB) | wa.uploadMedia | `{id}` | whatsapp_campaigns |
| GET | /ratings (1562) | A | R ratings, sales, users, wa_messages | | `RatingsReport` | ratings |
| PUT | /customers/:id/whatsapp (1598) | A | W customers.wa_opt_out, audit | | `Customer` (opt_out bool body) | whatsapp |

### 2.7 Audit, reports, customers (1612-1782)
| M | path (line) | auth | tables | helpers | response | feature |
|---|---|---|---|---|---|---|
| GET | /audit (1626) | A | R audit_log (filters entity/actor_id/from/to/q, paging) | audit.changedFields, money.businessDayStart | `Paged<AuditEntry>` | audit_log |
| GET | /reports/me (1675) | U | R sales, expenses | reports.myReport | `MyReport` | core_sales |
| GET | /reports/overview (1680) | A | R sales, expenses, company_expenses, users | reports.overview | `Overview` | core_sales |
| GET | /reports/daily (1685) | A | same | reports.dailySheet | `DailySheet` | daily_sheet |
| GET | /reports/monthly (1691) | A | same | reports.monthlyReport | `MonthlyReport` | reports_advanced |
| GET | /customers (1699) | U (barber: own recent customers; q>=3 chars + exact phone only; admin: full paged list incl. visits/spent/wa_opt_out) | R customers, sales | money.canonicalPhone | `Paged<Customer>` | customers_crm (barber autocomplete branch is needed by core_sales) |
| GET | /customers/:id (1747) | A | R customers, sales, sale_items, users | | `CustomerDetail` | customers_crm |
Excel export is client-side only (web/src/lib/excel.ts, uses `xlsx`) -> `excel_export` has no API route; it is a UI flag on /sheet, /monthly, /ledger.

### 2.8 Users, photos, services, settings (1784-2155)
| M | path (line) | auth | tables | helpers | response | feature |
|---|---|---|---|---|---|---|
| GET | /users (1789) | A | R users | db.toUser | `User[]` | core |
| POST | /users (1822) | A | W users, audit | crypto.hashPassword, money.canonicalPhone | `User` 201 (`UserInput`); 409 username taken | core |
| PUT | /users/:id (1844) | A | W users (bumps session_version when deactivated), audit | | `User` | core |
| POST | /users/:id/reset-password (1872) | A | W users, login_failures, audit | | `{ok}` | core |
| DELETE | /users/:id (1892) | A | counts sales/expenses/payouts/ledger; deactivates if used else deletes + FK children (push_tokens, notifications, announcements, login_failures) | | `{ok, deactivated?/deleted?}` | core |
| PUT/DELETE | /me/avatar (1948/1949) | U | W users.avatar (<=200KB webp/jpeg/png) | | `{avatar_url}` | core |
| PUT/DELETE | /users/:id/avatar (1950/1954) | A | same | | `{avatar_url}` | core |
| GET | /services (1961) | U (`?all=1` only for admin) | R services | db.toService | `Service[]` | core |
| POST | /services (1994) | A | W services, audit (MAX(id) pattern) | | `Service` 201 | core |
| PUT | /services/:id (2008) | A | W services, audit | | `Service` | core |
| DELETE | /services/:id (2025) | A | W sale_items.service_id=NULL, services, audit | | `{ok}` | core |
| GET | /settings (2039) | U | R settings | db.getSettings | `Settings` | core |
| PUT | /settings (2041) | A | W settings (30 columns, `WHERE id = 1`), audit | | `Settings` | core (sub-sections gated by feature) |
Counts: 79 `api.<verb>` handlers + 2 middlewares in routes.ts (public rate-limit mw 174, session gate 389); index.ts adds 1 mw, `/api/*` 404 and static fallthrough. Per-group handler counts: auth/public/webhook 12, me/push/notif/announce 8, sales 4(+3 sale-linked), expenses 6, ledger 13, wa 11, ratings 1, audit 2, reports 4, customers 3(+1), users/photos 9, services 4, settings 2.

---

## 3. Helper modules

(line numbers = file lines; "FM hardcode" = must become per-org setting or a constant moved to org config.)

### money.ts (127 LOC, pure, no deps)
Exports: `signedFils(v):number|null` (9) | `toFils(v):number|null` (18; positive, max 1,000,000 AED, <=2 decimals) | `commissionOf(amount,pct)` (27) | `vatOf(amount,rate)` (32; VAT-inclusive) | `dubaiDay(ms)` (38) | `DAY_START_HOUR=4` (43) | `businessDay(ms)` (46) | `businessDayStart(day)` (51) | `DAY_RE`, `MONTH_RE` (55-56) | `daysOfMonth(month)` (59) | `addDays(day,delta)` (66) | `prevMonth` (73) | `canonicalPhone(raw)` (84) | `whatsappDigits(phone)` (109) | `DayTotals` iface, `barberNet(t)` (120) sales-expense | `shopProfit(t)` (125) sales-expense-commission.
FM hardcodes: `DUBAI_OFFSET_MS = 4*3_600_000` (6, fixed UTC+4, no DST); `DAY_START_HOUR = 4` (43); `businessDayStart` literal `T0${DAY_START_HOUR}:00:00+04:00` (52; also breaks if hour >= 10 due to `T0` prefix); `canonicalPhone` UAE rules: 971/00971/0 prefixes, mobile `^5\d{8}$`, landline `^[234679]\d{7}$` -> `0XXXXXXXXX` (84-106); `whatsappDigits` prefixes `971` (110); comment "AED x 100 / fils". Port: parametrise `tz offset` (IANA tz or minutes), `dayStartHour`, `countryCode` + phone regex table (web/src/lib/format.ts COUNTRIES already has a multi-country list), currency minor unit.

### ledger.ts (122 LOC; imports type IdExpr from audit; uses D1 types)
Exports: types `Account`, `LedgerSource`, `Line` | `saleLines(s)` (42) | `expenseLines(e)` (57) | `companyExpenseLines(e)` (61) | `payoutLines(p)` (65) | `transferLines(t)` (69) | `openingLines(o)` (78) | `needsRepost(old,next)` (87) | `postStmts(db, source, sourceId|IdExpr, ref, actorId, lines):D1PreparedStatement[]` (98) | `reverseStmts(db, source, sourceId, actorId)` (110).
Depends: table `ledger_entries` (column list const `COLS` line 96), D1. Barber expenses always post to `cash`; card sales -> `bank`; cash -> `cash` (51).
FM hardcodes: memo strings in English ("Bill X · label", "Commission · X", "Expense · name", "Company · note", "Paid name", "Moved to cash drawer/bank", "Balance set", "Reversed · ..."); accounts fixed to cash/bank; terms "barber". Must add `org_id` to the INSERT/UPDATE/SELECT-reverse statements (postStmts/reverseStmts take only db).

### audit.ts (47 LOC, pure except D1 type)
Exports: types `AuditEntity` (9 values), `AuditAction`, `IdExpr` | `changedFields(before,after)` (13) | `userSnapshot(u)` (23; strips password_hash/avatar/avatar_type/session_version) | `auditStmt(db, {actor,entity,entityId|IdExpr,ref,action,before,after})` (27). Writes `audit_log`. No FM hardcodes. Needs org_id in INSERT; IdExpr subselects like `(SELECT id FROM sales WHERE bill_no = ?)` need org scope.

### reports.ts (258 LOC; imports contract types, db {avatarUrl,listSales,SALE_SELECT}, env, money)
Exports: `myReport(env, barberId, month):MyReport` (69) | `dailySheet(env, month):DailySheet` (106) | `monthlyReport(env, year):MonthlyReport` (152) | `overview(env, fromQ?, toQ?):Overview` (195). Private: `aggregate` (29), `companyBy` (47), `barberCols` (56), `totalsBetween` (177), `daysBetween`, `nextMonth`.
Reads sales, expenses, company_expenses, users, via SALE_SELECT sales+items. All queries unscoped -> need `org_id = ?` everywhere.
FM hardcodes: uses `businessDay(Date.now())` (71, 196) -> Dubai/4 AM; overview caps range at 731 days, switches to monthly series if > 92 days (200, 204); profit definition `shopProfit` = sales - expense(barber+company) - commission; "barber" column semantics.

### limits.ts (26 LOC, pure)
Exports: `LOGIN_WINDOW_MS` = 15 min (8) | `loginLimits(username, ip)` (10; ip 20, user|ip 8, user 50) | `PUBLIC_LIMITS {pub:60, pdf:10}` (19) | `minuteWindow(at)` (22) | `isLocked(row,max,at)` (24). No FM hardcodes beyond tuning numbers. `u:<username>` key must include org (or org+username) after port.

### push.ts (135 LOC; env FCM_SERVICE_ACCOUNT, APP_URL)
Exports: `interface Push {title,body,path?,tag?}` | `pushToUsers(env, userIds, push)` (74; FCM HTTP v1, JWT RS256 from service account, module-level token cache `cached` (24) keyed by client_email, deletes dead tokens from push_tokens) | `recordNotifications(env, userIds, push)` (114; INSERT notifications) | `adminIds(env, except?)` (132; active admins).
Depends: tables push_tokens, notifications, users; `env.APP_URL` for click link (83); `/icon-192.png` icon+badge (94).
FM hardcodes: none by name in code, but the single global FCM service account/project is FM's ("fm-salon-app", see web); icon path. Port: one shared FCM project is fine for all tenants (tokens are per device); `APP_URL` is single-host (subdomain per org? decide); queries need org_id (adminIds especially: "all active admins" would cross tenants).

### pdf.ts (168 LOC; deps pdf-lib, ./assets/logo.ts base64 FM logo, contract Receipt)
Exports: `BillPdfInput {receipt, whatsapp, instagram, link}` | `pdfSafe(text)` (27; Helvetica WinAnsi only, strips emoji, others -> "?") | `money(fils)` (40; en-US 2 decimals) | `billPdf(input):Promise<Uint8Array>` (44; A5 page 420pt wide).
FM hardcodes: embedded FM logo `LOGO_JPG_BASE64` (7, 51; the logo.ts asset file); header tagline fallback "Gents Salon" (76); colours ACCENT = FM logo blue (16); `AED` literal in TOTAL (140) + "Prices include VAT" + "TAX INVOICE" (80, UAE phrase), `TRN` label (158), time zone "Asia/Dubai" + locale en-GB/en-US (87-88), footer fallback "Thank you for visiting..." (154), "Walk-in customer", "Tel", "WhatsApp"/"Instagram @". Latin-only font: Arabic salon_name_ar not printed; non-Latin names become "?". Port: logo per org (R2 or settings blob), currency, tz, tax label.

### whatsapp.ts (271 LOC; env WHATSAPP_TOKEN, WA_PHONE_ID, WA_WABA_ID, WA_TEST_NUMBERS)
Pure (tested): `templateVars` (16) | `templateSlots(header, body, media?)` (32) | `waRecipient(phone)` (36) | `allowedRecipient(testNumbers, phone)` (46) | `firstName(label)` (57; "there" for `Customer N`) | `rateLinkSuffix(appUrl, token)` (76) | `visitTime(at)` (83) | `bodyParams(spec, customerName)` (93) | `templateComponents(values)` (105) | `previewText` (128) | `webhookEvents(payload)` (219) | `validSignature(appSecret, rawBody, header)` (254). Types `WaValue`, `SendResult`, `WaStatusEvent`.
Network: `waReady(env)` (136) | `sendTemplate(env, phone, template, language, params):SendResult` (151; never throws) | `uploadMedia(env, file)` (170) | `listTemplates(env)` (184) | `createTemplate(env,{name,category,language,body,examples})` (206).
FM hardcodes: `GRAPH = https://graph.facebook.com/v21.0` (11); `PROD_URL = "https://fm-salon.affworld0.workers.dev"` (73) used by `rateLinkSuffix` ("s." prefix hack for staging, since templates' button URL is a fixed base); `visitTime` zone "Asia/Dubai", en-GB (85); `waRecipient` `971` + leading-0 rule (40); `firstName` "there" fallback; creds are global env (single WABA/phone id) -> multi-tenant needs per-org WABA/phone-id/token (or a shared SalonStation number with per-org templates); WA_TEST_NUMBERS staging allow-list.

### wa-jobs.ts (291 LOC; imports db {getSale, now}, env, money {addDays,businessDay,businessDayStart}, wa-sql, whatsapp)
Exports: `WA_BATCH=40` (13) | `WA_MESSAGE_SELECT` (34) | `BILL_PDF_TEMPLATE="fm_bill_pdf"` (64) | `RATING_TEMPLATE="fm_rating"`, `RATING_REMINDER_TEMPLATE="fm_rating_reminder"`, `FRESH_CUT_TEMPLATE="fm_fresh_cut"` (70-72) | `servicesLine(items)` (89) | `sendBill(env, saleId, actorId)` (98) | `sendTest(env, phone, template, language, spec, actorId)` (134) | `runFeedback(env, at, limit, saleId?)` (145) | `runFeedbackReminders(env, at, limit)` (175) | `runReminders(env, at, limit)` (200) | `CAMPAIGN_SELECT` (227) | `drainCampaign(env, campaignId, limit)` (238) | `FEEDBACK_HOURS={from:9,to:22}` (275) | `waHourly(env, at, hour)` (281).
Private: `waConfig` (28; reads template names/delays from settings), `logSend` (36), `picture` (74), `ratingParams` (77), `appUrl`, `dearName`.
FM hardcodes: all template names `fm_*` + legacy `fm_feedback`/`fm_feedback_reminder` string compare (82); picture assets `${APP_URL}/wa/{rating,rating-reminder,fresh-cut}.jpg` (web/public/wa/, FM-branded images) (73-74); text `"Salon service"`, `"visit"`, "Customer"; rate link `${APP_URL}/rate/?t=` and receipt `${APP_URL}/r/?t=` (81, 105); bill date `toLocaleString("en-GB", timeZone "Asia/Dubai")` (108-116); `Cash`/`Card` labels; `FEEDBACK_HOURS` Dubai-hour window 9-22 (275) compared against Dubai hour passed in from scheduled.ts; "exactly N business days ago" via `businessDayStart`; one-per-customer-per-20h rule (153); batch 12 per job per hour (free-plan ~50 subrequests). Amount formatting en-US.

### wa-sql.ts (29 LOC, pure SQL strings)
Exports `FEEDBACK_DUE_SQL` (9; numbered params ?1..?5, joins sales/customers/users/sale_items/wa_messages) and `REMINDER_DUE_SQL` (21; ?1..?4, joins ratings). Uses kinds 'feedback', status 'sent'. No FM hardcode, but must be org-scoped (add `s.org_id = ?6`, `m.org_id`) and the numbered-placeholder lesson (comment lines 3-8) must be kept.

### scheduled.ts (56 LOC) - see section 5.
Exports `hourly(env, at)` (17). Hardcodes: `dubaiHour = (UTC hour + 4) % 24` (11); `aed()` formatter "AED x" en-US (8); push strings "Today: AED ... · N customer(s)", "Profit ... · expense ... · commission ... · top: ...", "No sales logged yet today" (35-52); path "/", tags `summary-<day>`, `reminder-<day>`.

### db.ts (216 LOC; imports contract, crypto.hashPassword, env)
Exports: `now()` (5) | `SettingsRow` iface (7) | `getSettings(env):Settings` (40; `WHERE id = 1`, throws "settings row missing", sets `wa_ready`, `wa_test_numbers` from env) | `nextSeq(env, name)` (83) | `USER_COLS` (93) | `avatarUrl(id,v)` (97; `/api/users/${id}/avatar?v=`) | `UserRow`, `toUser` (118) | `SALE_SELECT` (134; sales JOIN users JOIN customers + items json_group_array) | `toSale`, `getSale(env,id)` (156), `listSales(stmt)` (161) | `ServiceRow`, `toService` | `STARTER_BARBERS` (181) | `ensureSeed(env)` (190).
FM hardcodes: `STARTER_BARBERS = ["Sonu","Monu","Hasib","Qasam","Ghazi","Jatin","Nadeem","Rafiq"]` (181, FM staff from SALOON RECORD.xlsx); admin seed name "Faizan" and username default "admin" (199); first-boot `ADMIN_PASSWORD`/`BARBER_PASSWORD` env flow + module-level `seeded` flag (183) (replace with org signup flow); `settings WHERE id = 1`; `counters` global. Port: `getSettings(env, orgId)`, `nextSeq(env, orgId, name)`, `SALE_SELECT ... WHERE s.org_id=?`.

### crypto.ts (77 LOC, Web Crypto)
Exports: `b64url`, `fromB64url` | `sign(payload, secret)` / `verify<T>(token, secret)` (HMAC-SHA256 `body.sig`) | `safeEqual` | `hashPassword`, `checkPassword` (PBKDF2-SHA256 10,000 iterations, format `pbkdf2$iter$salt$hash`; 10k because of the Workers free plan 10 ms CPU) | `randomToken(bytes=12)`. No FM hardcodes; secret = `SESSION_SECRET` (global env). Port as-is; consider including org_id in the signed session payload and raising iterations if on paid plan.

### contract.ts (630 LOC, types only; header comment 1-46 is the API doc)
Exports (names): Role, PaymentMode, Me, Settings, PushTokenInput, Announcement(+Input), Notification, NotificationFeed, User(+Input), Service(+Input), SaleItem, Sale, SaleInput, Receipt, Expense(+Input), CompanyExpense(+Input), MoneyAccount, Transfer(+Input), Balances, BalanceInput, LedgerLine, Payout(+Input), BarberBalance, BarberLedger, ShopLedger, AuditEntry, WaStatus, WaMessage, WaTemplate, WaSlot, Rating, RatingsReport, FeedbackPage, FeedbackInput, WaTemplateInput, WaParam, WaTestInput, WaCampaignInput, WaCampaign, WaReminderRun, Paged<T>, Totals, MyReport, BarberCol, DailySheet, MonthlyReport, Overview, Customer, CustomerDetail. web/src/lib/types.ts (620 LOC) is a hand-copied mirror of this file (not generated).
FM hardcodes: comments only (AED, Dubai hours); `Settings` type mixes salon identity, UAE VAT (`trn`, `licence_no`), notification hours (Dubai), WA toggles and read-only env flags (`wa_ready`, `wa_test_numbers`). Contract drift: header says login returns `{ok,user}` but route returns `{ok:true}`.

### env.ts / index.ts (infra)
env.ts: `Env {DB, ASSETS, SESSION_SECRET, ADMIN_PASSWORD?, ADMIN_USERNAME?, BARBER_PASSWORD?, FCM_SERVICE_ACCOUNT?, APP_URL, WHATSAPP_TOKEN?, WA_PHONE_ID?, WA_WABA_ID?, WA_TEST_NUMBERS?, WA_APP_SECRET?}`, `Viewer`, `AppEnv`. wrangler.jsonc: name fm-salon, cron `0 * * * *`, assets `../web/out` with `run_worker_first: ["/api/*"]`, D1 `fm-salon-db`, staging env (no cron, WA_TEST_NUMBERS), smart placement, nodejs_compat, Affworld0 account id (do not reuse). `PUBLIC_PATHS` etc. live in web.

---

## 4. Existing tests (api/; web has 2)

Runner: plain Node, no framework: `node --experimental-strip-types --no-warnings src/<name>.test.ts` (Node >= 22.6; wa-sql.test needs `node:sqlite` -> Node >= 22.5/24). `npm test` chains 7 of them (audit, money, ledger, whatsapp, pdf, limits, wa-sql) - `panels.test.ts` is NOT in the chain (it uses `node:test`: run with `node --test --experimental-strip-types --no-warnings src/panels.test.ts`). Import specifiers use the `.ts` extension (`./money.ts`).
| file | LOC | covers | pure / portable as-is? |
|---|---|---|---|
| money.test.ts | 93 | signedFils, businessDay/businessDayStart (4 AM Dubai boundaries, year/Feb roll), toFils, commissionOf, vatOf (5%), dubaiDay, daysOfMonth, addDays, canonicalPhone (UAE/foreign), whatsappDigits | Pure, but asserts FM behaviour (Dubai +04:00, 971). Portable only after parametrising tz/country; keep as the UAE test case plus add other-tz cases |
| ledger.test.ts | 71 | sale/expense/company/payout/transfer/opening lines, needsRepost | Pure (no DB). Portable as-is (uses bill "FM-1" label only as string) |
| audit.test.ts | 15 | changedFields, userSnapshot | Pure, portable as-is |
| limits.test.ts | 21 | loginLimits keys, isLocked, minuteWindow | Pure, portable as-is (update key format if org prefixed) |
| whatsapp.test.ts | 157 | templateVars/Slots/Components, waRecipient (971), allowedRecipient, firstName, bodyParams, previewText, webhookEvents, validSignature, rateLinkSuffix/visitTime | Pure; async validSignature uses global crypto.subtle (Node ok). waRecipient/PROD_URL assertions are FM-specific |
| pdf.test.ts | 49 | pdfSafe, money(), billPdf renders `%PDF-` incl. Arabic label (needs `pdf-lib` + `src/assets/logo.ts`; `PDF_OUT=<file>` writes sample) | Pure/no network; contains FM sample data (address, Instagram) and FM URL |
| wa-sql.test.ts | 47 | FEEDBACK_DUE_SQL / REMINDER_DUE_SQL against in-memory SQLite (created with a trimmed schema: users, customers, sales, sale_items, wa_messages, ratings) | Needs `node:sqlite`; schema inline, so adding org_id to the SQL requires updating the inline CREATE TABLEs. Regression for the numbered-placeholder bug |
| panels.test.ts | 208 | Admin/Barber panel logic: toFils, barberNet, canonicalPhone, commissionOf, shopProfit, dubaiDay, crypto sign/verify/hashPassword/checkPassword | Pure; duplicates money.test; portable |
Web (`web/package.json` test script): `src/lib/numpad.test.ts` (34) and `src/lib/format.test.ts` (12) - pure Node strip-types. No tests exist for routes.ts, reports.ts, db.ts, push.ts, scheduled.ts, wa-jobs.ts (network/D1 code is untested).

---

## 5. Cron jobs (scheduled.ts + index.ts:24-28)

Single trigger `0 * * * *` (hourly; wrangler.jsonc, no cron in staging). `export default { scheduled(controller, env, ctx) { ctx.waitUntil(hourly(env, controller.scheduledTime)) } }`. `hourly(env, at)` (scheduled.ts:17) computes `hour = (UTC hour + 4) % 24` and does, in order:
| # | job | schedule logic | tables | settings used |
|---|---|---|---|---|
| 1 | Throttle cleanup | every run: `DELETE FROM rate_hits WHERE window < floor(at/60000)-5`; `DELETE FROM login_failures WHERE first_at < at-24h` | rate_hits, login_failures | - |
| 2 | `waHourly(env, at, hour)` (wa-jobs.ts:281) (skipped when !waReady) | every run | | |
| 2a | finish unfinished WA campaign | first `wa_campaigns WHERE finished_at IS NULL ORDER BY id LIMIT 1` -> `drainCampaign(.., 12)` | wa_campaigns, wa_messages | - |
| 2b | visit reminders | `wa_reminder_enabled && hour >= wa_reminder_hour` (so runs every hour after the set hour; dedup by customers.wa_reminded_at) -> `runReminders(.., 12)`: customers whose `last_visit_at` falls in the 24 h business-day window exactly `wa_reminder_days` business days ago (04:00-04:00), not opted out, not reminded since last visit; failed sends retried next run | customers, wa_messages | wa_reminder_enabled, wa_reminder_hour, wa_reminder_days, wa_reminder_template, wa_language |
| 2c | rating requests | `wa_feedback_enabled && 9 <= hour < 22` (FEEDBACK_HOURS) -> `runFeedback(.., 12)`: sales created <= now - delay_min and within the last 24 h, not yet asked (`wa_feedback_at IS NULL`), customer with phone, not opted out; max one per customer per 20 h (others marked done silently); sets `sales.wa_feedback_at` | sales, customers, users, sale_items, wa_messages | wa_feedback_enabled, wa_feedback_delay_min (0 = sent inline at POST /sales), wa_feedback_template, wa_language |
| 2d | rating reminder | same window -> `runFeedbackReminders(.., 12)`: bills whose request was sent `wa_feedback_reminder_min` ago (within 24 h), not rated, `review_clicked_at IS NULL`, not reminded; `0` disables; sets `wa_feedback_reminded_at` | sales, wa_messages, ratings | wa_feedback_reminder_min, wa_feedback_reminder_template |
| - | early return | `if (!env.FCM_SERVICE_ACCOUNT) return` -> push jobs below skipped entirely | | |
| 3 | admin end-of-day summary | `notify_summary && hour === summary_hour` (default 23): `overview(env, day, day)` for `businessDay(at)` (note: at 23:00 Dubai it is still the same business day), best barber by sales, push+notification to all admins | sales, expenses, company_expenses, users (via reports.overview), notifications, push_tokens | notify_summary, summary_hour |
| 4 | barber reminder | `notify_reminder && hour === reminder_hour` (default 13): active barbers with no non-deleted sale on `businessDay(at)` get "No sales logged yet today" | users, sales, notifications, push_tokens | notify_reminder, reminder_hour |
Each failed section is caught with console.error; the whole `hourly` is wrapped in `.catch`. Multi-tenant port: loop over orgs, compute the hour from each org's tz, and bound per-invocation sends (comment in wa-jobs.ts:3: free plan ~50 outbound subrequests; 12 per sub-job, 40 per UI-triggered batch). Also note FM-only: the summary job is gated on FCM being configured, while WhatsApp jobs are gated on `waReady`.

---

## 6. Web app (web/, Next 16 App Router, `output: "export"`, `trailingSlash: true`)

Prod = static export in `web/out` served by the Worker (`ASSETS`); dev = `next dev` with rewrite `/api/* -> http://localhost:8787`. Stack: React 19, Tailwind 4, shadcn/base-ui components, sonner, recharts, lucide, date-fns, firebase (push), xlsx (via CDN tarball). Query params instead of dynamic routes (static export): `/customers/view/?id=`, `/r/?t=`, `/rate/?t=`.

### 6.1 Pages (web/src/app) with API calls and roles
Role gate is client-side only: `AppShell` (components/admin/app-shell.tsx:42-43) has `PUBLIC_PATHS = ["/login","/r","/rate"]` and `ADMIN_PATHS = ["/services","/sales","/expenses","/sheet","/monthly","/audit","/ledger","/barbers","/customers","/settings"]` (barbers redirected home). NOT in ADMIN_PATHS but admin-only in nav/API: `/ratings`, `/announcements` (API enforces 403).
| route | file (LOC) | role | API calls (from page + its components) |
|---|---|---|---|
| `/` | page.tsx (10) | admin -> `AdminDashboard`; barber -> `BarberToday` | admin: GET /reports/overview?from&to; barber: GET /reports/me?month, GET /sales?..., POST/PUT/DELETE via SaleSheet |
| `/login` | login (101) | public | POST /auth/login, GET /auth/me (via auth-context) |
| `/r?t=` | r (57) | public | GET /public/receipt/:token (renders `<Bill>`) |
| `/rate?t=` | rate (50) | public | redirects to GET /public/review/:token (staging host const `fm-salon-staging.affworld0.workers.dev` line 6 forwards `s.`-prefixed tokens) |
| `/sales` | sales (108) | admin | GET /users, GET /sales?day&barber_id&payment_mode&page_size; SaleSheet: POST/PUT /sales, DELETE /sales/:id, GET /services |
| `/bills` | bills (105) | admin + barber ("My bills") | GET /sales?q&day&page_size; Bill dialog: GET/POST /sales/:id/whatsapp |
| `/expenses` | expenses (188) | admin | GET /users, GET /expenses?month&barber_id, PUT /expenses (expense-dialog), company-expenses component: GET/POST/PUT/DELETE /company-expenses |
| `/sheet` | sheet (188) | admin | GET /reports/daily?month; Excel export client-side (lib/excel.ts exportDailySheet) |
| `/monthly` | monthly (165) | admin | GET /reports/monthly?year; Excel export |
| `/ledger` | ledger (26) | admin | tabs: LedgerShop (GET /ledger/balances, GET /ledger/shop?from&to&account, GET/POST/PUT/DELETE /transfers) + LedgerBarbers (GET /ledger/barbers, GET /ledger/barbers/:id, GET/POST/PUT/DELETE /payouts, PUT /ledger/balances in ledger-dialogs); Excel export |
| `/ratings` | ratings (148) | admin | GET /ratings?from&to |
| `/audit` | audit (167) | admin | GET /users, GET /audit?entity&actor_id&from&to&q&page; audit-diff: GET /sales/:id/history |
| `/barbers` | barbers (323) | admin | GET /users, POST /users, PUT /users/:id, DELETE /users/:id, POST /users/:id/reset-password, avatar PUT/DELETE /users/:id/avatar (avatar-picker) |
| `/services` | services (206) | admin | GET /services?all=1, POST/PUT/DELETE /services/:id |
| `/customers` | customers (94) | admin | GET /customers?q&page_size |
| `/customers/view?id=` | view (201) | admin | GET /customers/:id, GET /sales?customer_id, PUT /customers/:id/whatsapp |
| `/announcements` | announcements (220) | admin | tab "Barbers (app)": GET/POST /announcements; tab "Customers (WhatsApp)" = `wa-announcements.tsx` (723): GET/POST /wa/templates, POST /wa/test, POST /wa/media, GET /wa/audience?, GET/POST /wa/campaigns, POST /wa/campaigns/:id/next |
| `/settings` | settings (382) | admin | GET (auth-context) / PUT /settings, POST /wa/reminders/run, POST /wa/feedback/run |
| `/history` | history (72) | barber | GET /reports/me?month |
| `/account` | account (100) | admin + barber | PUT /me/password, avatar PUT/DELETE /me/avatar, push on/off (lib/push.ts: POST/DELETE /push/tokens), notifications-card |
Shared (in app shell): notification-bell (GET /notifications, POST /notifications/read), push-prompt, customer-suggest/customer-picker (GET /customers?q), service-picker (GET /services), SaleSheetProvider (sale-sheet.tsx 610 LOC: the New/Edit sale sheet; global provider mounted in AppShell), pull-to-refresh, env-badge (yellow TEST banner if host contains "staging"/localhost).

### 6.2 nav.ts (components/admin/nav.ts, 101 LOC)
Static arrays: `ADMIN: NavGroup[]` = groups "Today" (/ Dashboard*, /sales Sales*, /bills, /expenses), "Reports" (/sheet Daily sheet*, /monthly, /ledger, /ratings, /audit), "Shop" (/barbers, /services, /customers, /announcements, /settings, /account); `BARBER` = group "Me" (/ Today*, /history, /bills, /account). `NavItem {href, label, icon: LucideIcon, tab?: boolean}` (`*` = shown in phone bottom bar); `NavGroup {label, items}`. API: `navFor(role)`, `cleanPath`, `isActive(pathname, href)` (trailing-slash aware, longest prefix wins), `titleForPath(role, pathname)` (fallback title literal "FM Salon", line 99). Consumed by app-sidebar.tsx (69), bottom-bar.tsx (70), top-bar.tsx (91), app-shell. For per-route feature gating: add `feature?: FeatureKey` to `NavItem`, filter in `navFor`, and make `ADMIN_PATHS`/guard consult the same table (today guard and nav are two separate hardcoded lists).

### 6.3 lib/api.ts, hooks/use-api.ts, auth-context
- `api<T>(path, {method?, body?, redirectOn401?})` (api.ts:12): `fetch` with `credentials: "include"`, JSON or FormData, default method POST when a body is given else GET, on 401 (and not already on /login) `window.location.href = "/login"`; errors -> `ApiError(message from {error}, status)`; helpers `errorMessage`, `qs(params)` (skips empty). Relative same-origin paths (`/api/...`) - no base URL, so subdomain-per-org works with no change; path-prefix-per-org would not.
- `useApi<T>(path|null)` (hooks/use-api.ts): module-level `Map` cache (stale-while-revalidate), refetch on `window` event `fm:data-changed` (`DATA_CHANGED`, fired by `notifyDataChanged()` after mutations), returns `{data, stale, error, loading, reload, setData}`; `clearApiCache()` on logout.
- `AuthProvider`/`useAuth()` (lib/auth-context.tsx): state `{user: Me, settings: Settings, today}` from GET `/api/auth/me`; localStorage cache key `fm_session_cache` for instant paint; exposes `{user, settings, isAdmin, loading, login, logout, refresh}`; logout calls `forgetPushToken()` then POST /auth/logout. Settings (and thus any feature flags) ride on /auth/me - natural place to also return `features`/`org`.
- localStorage/event keys with FM prefix: `fm_session_cache`, `fm_sidebar_collapsed`, `fm-sidebar-collapsed`, `fm:data-changed`, `fm:wa-bill`, `fm_push_token`, `fm_push_optout`.

### 6.4 Components/files that hardcode FM branding or UAE assumptions
- app/layout.tsx:10-13 metadata title/description "FM Salon", "Faizan Mohammed Gents Salon", appleWebApp title.
- app/login/page.tsx:45,57 and app/rate/page.tsx:38 literal "Faizan Mohammed Gents Salon"; rate/page.tsx:6 staging host constant.
- components/logo.tsx (32) FM logo mark/badge (`/logo-mark.png`, `/logo.png`; alt text FM).
- public/: `manifest.webmanifest` (name "FM Salon - Faizan Mohammed Gents Salon", theme colours), `icon-192.png`, `icon-512.png`, `logo*.png`, `default-avatar.webp`, `wa/{rating,rating-reminder,fresh-cut}.jpg` (FM WhatsApp header pictures), `firebase-messaging-sw.js` and `lib/push.ts:12-24` Firebase web config of project `fm-salon-app` (projectId, senderId 923048894140; public web config, not a secret; see also FM notification default title "FM Salon" in push.ts:139).
- lib/format.ts: `aed()` + Intl `en-AE` (3-9), `DUBAI = "Asia/Dubai"` (23), `DAY_START_HOUR = 4` (31), `dayLabel/dateTimeLabel/timeLabel` en-GB + Dubai tz, `whatsappDigits` 971 (92), `COUNTRIES` list default "971" (115-131), `splitPhone` default cc 971 (159). Web duplicates money.ts day logic (businessDay) - must stay in lock-step with server.
- components/app/bill.tsx (328): "AED", "Prices include VAT. Amounts in AED.", fallback `"FM Salon"` (47,55,86), tz Asia/Dubai (292), localStorage-event `fm:wa-bill`.
- lib/excel.ts: export filenames "FM Salon <month>.xlsx" (69,92,127); sheet layout copies client's SALOON RECORD.xlsx (columns Dates | Details | barbers+Commission | Total Sale | Expense | Total Commission | Total Profit; "SALE/COM"); `salon_name ?? "FM Salon"` in sheet/page.tsx:46.
- Money labels "(AED)" in: settings, services, expenses, ledger-dialogs, company-expenses, service-picker, expense-dialog, monthly, history, sheet, ledger-*, money-tile.
- settings/page.tsx: "Times are Dubai time" (258), preview sample barber "Sonu" (70), TRN/licence fields (UAE).
- components/theme/*, globals.css: "deHertz admin design system" tokens (branding comment only).
- web copy uses "barber" everywhere (role label, nav, pages); SalonStation may want a role/term setting.
- next.config.ts: dev proxy to :8787; `images.unoptimized`.

---

## 7. Suggested port units (dependency order)

LOC are source LOC to read/translate (routes.ts line counts + helper files + web).
| # | unit | routes | tables | helpers | api LOC | web LOC | depends on |
|---|---|---|---|---|---|---|---|
| P0 | Tenancy foundation + auth + core admin (`core`) | ~25: login/logout/me/password, settings GET/PUT, users CRUD + reset-password + avatars (+public avatar), services CRUD, `/public/services` | organizations (new), settings (org_id PK, + new columns: timezone, day_start_hour, currency, country_code, locale, tax label), users, services, counters (org-scoped), login_failures, rate_hits | money (param'd), crypto, limits, db (getSettings/nextSeq/toUser/toService/USER_COLS), env, audit.ts helpers (needed by every write) + audit_log table (write side only), index.ts, org resolution middleware (subdomain/slug/session) | ~750 routes (17-110,111-200 login parts,389-432,1784-2155) + ~600 helpers | login, layout, auth-context, api.ts, use-api, nav.ts (+feature gating), app-shell, settings, barbers, services, account (~1,900) | none. Do first; includes a org_id test harness for money/limits/audit tests |
| P1 | `core_sales`: sales + customers + bills + receipts + basic reports | 12: /sales GET/POST/PUT/DELETE, /customers (barber branch) , /public/receipt, /public/bill (PDF), /reports/me, /reports/overview | sales, sale_items, customers, counters (bill_/cust_) | reports (myReport, overview, aggregate, totalsBetween), ledger.saleLines (or stub until P3), pdf.ts, SALE_SELECT; sale hooks that notify/WA must be feature-flag no-ops | ~380 sales + 260 reports + 170 pdf | sale-sheet (610), service-picker, customer-picker/suggest, bill (328), barber-today, admin-dashboard, sales, bills, history, r (~2,600) | P0 |
| P2 | `expenses` + `daily_sheet` + `reports_advanced` + `excel_export` | 8: /expenses GET/PUT, /company-expenses x4, /reports/daily, /reports/monthly | expenses, company_expenses | reports (dailySheet, monthlyReport, companyBy, barberCols), ledger.expenseLines/companyExpenseLines hooks | ~150 routes + 150 reports | expenses page, expense-dialog, company-expenses, sheet, monthly, excel.ts (~950) | P1 (reports.ts, sales) |
| P3 | `ledger` (shop book, transfers, payouts, balances, barber book) | 13: transfers x4, ledger/balances x2, ledger/shop, payouts x4, ledger/barbers x2 | ledger_entries, money_transfers, barber_payouts | ledger.ts (full), audit; retrofit: sales/expenses must post lines whenever `ledger` is ON (decide: always post vs flag; FM backfill 0012 shows lines must exist before balances are meaningful) | ~315 routes + 122 | ledger page, ledger-shop, ledger-barbers, ledger-dialogs (~870) | P1, P2 |
| P4 | `audit_log` viewer + `announcements` + `push` + notification feed + cron summary/reminder | 9: /audit, /sales/:id/history, announcements x2, push tokens x2, notifications x2 | audit_log (read side), announcements, notifications, push_tokens | push.ts (FCM), scheduled.ts (jobs 3,4 + cleanup), audit.changedFields | ~210 routes + 135 push + 56 scheduled | audit page, audit-diff, announcements (team tab), notification-bell, notifications-card, push-prompt, lib/push.ts, firebase-messaging-sw.js (~800) | P0 (P1 for notify hooks) |
| P5 | `ratings` + public review/feedback | 5: GET/POST /public/feedback/:token, GET /public/review/:token, GET /ratings (+ opt: /wa/feedback/run lives in P6) | ratings, sales.review_clicked_at | feedbackPage, push (low-star admin alert) | ~140 | ratings page, rate page (~200) | P1, P4 (alerts) |
| P6 | `whatsapp` (per-org WABA, bills, reminders, feedback requests, webhook, opt-out) | ~9: /sales/:id/whatsapp x2, /wa/webhook x2, /wa/reminders/run, /wa/feedback/run, /customers/:id/whatsapp, (+ /public/bill used here) | wa_messages (+ customers.wa_*, sales.wa_*), settings wa_* (+ new per-org credentials/template-name columns instead of env) | whatsapp.ts (271), wa-jobs.ts (sendBill, runFeedback, runFeedbackReminders, runReminders, logSend, waHourly), wa-sql.ts, scheduled.ts job 2; per-org creds + template names in settings; webhook org resolution by `phone_number_id` | ~170 routes + 600 helpers | bill WA button, settings WA cards (~400 of settings.tsx), customers/view opt-out | P1, P5 (ratings lookup in REMINDER_DUE_SQL), P0 |
| P7 | `whatsapp_campaigns` (templates, media, audience, campaigns, test) | 7: /wa/templates x2, /wa/test, /wa/audience, /wa/campaigns x3 (+/next), /wa/media | wa_campaigns, wa_messages | whatsapp.ts createTemplate/listTemplates/uploadMedia, wa-jobs drainCampaign/sendTest/CAMPAIGN_SELECT | ~140 | wa-announcements.tsx (723) + announcements page (220) | P6 |
| P8 | `customers_crm` (admin list/detail) + `public_services_api` | 2 (+ /public/services already in P0 if ungated) | customers (read) | - | ~90 | customers, customers/view (~300) | P1 |
Totals to port: ~21 tables, 79 handlers, 14 helper modules. Suggested minimal vertical slice to validate tenancy: P0+P1; P2-P5 are independent after that; P6/P7 last (external dependency, per-org credentials).

---

## 8. Tenancy hazards found while reading (carry into the plan)

1. **Global uniques**: `users.username` (NOCASE), `customers.phone`, `sales.bill_no` -> `(org_id, ...)`; `sales.token` stays global (public link has no org context; org derived from the token row). `counters.name` PK -> `(org_id, name)`; `settings.id=1` -> org_id PK. login_failures key `u:<username>` needs an org part.
2. **`MAX(id)` as "the row I just inserted"** inside batches: company_expenses (1022), money_transfers (1105), barber_payouts (1288), services (2001), wa_campaigns (1494-1502, 3 statements). With one shared D1 and parallel tenants these race across orgs. Replace with `RETURNING id` + second statement keyed by an org-scoped unique (e.g. `(org_id, bill_no)` like sales does) or restructure to two calls.
3. `(SELECT id FROM sales WHERE bill_no = ?)` (sale_items, audit/ledger IdExpr) and `(SELECT id FROM users WHERE username = ?)` (users POST audit, 1834) must include org_id.
4. **`opening` ledger source_id**: 0 = shop, barber id = per-barber (routes.ts:1172-1210); the `ledger_source (source, source_id)` index and `reverseStmts` live filter need org_id. `reverseStmts` selects live lines by `(source, source_id)` only.
5. **Settings is a hot global row** read on nearly every request (`getSettings`), includes env-derived fields (`wa_ready`, `wa_test_numbers`) -> make per-org + per-org credentials; PUT /settings writes 30 columns positional (2090-2125): add columns carefully (positional `.bind`).
6. Template/language columns (`wa_bill_template`, `wa_*_template`, `wa_language`) are not in the Settings contract/API; they are only changed by SQL migrations (0019). Expose or provision per org.
7. **Cron**: one Worker `scheduled` for all orgs; `hourly` uses a single global Dubai hour. Needs per-org tz, per-org batching, and subrequest budget (12/40 sends).
8. **Webhook** `POST /wa/webhook`: updates `wa_messages` by `wa_id` (unique at Meta) and `customers.wa_opt_out` by phone only -> a phone number shared by two orgs' customers would be opted out in all; resolve org via `entry[].changes[].value.metadata.phone_number_id` or via the wa_messages row. GET verify echoes any challenge; signature check only when `WA_APP_SECRET` set.
9. **Session**: cookie `fm_session`, payload `{uid, v, exp}`; user row loaded per request, so `org_id` can come from the user row (no payload change needed) but the cookie name/secret are global; avatar route is public and unscoped.
10. `ensureSeed` (FM staff list + env passwords + module-level `seeded` flag) is replaced by org signup; do not port `STARTER_BARBERS`.
11. `FCM` access-token cache is module-global (fine across tenants); `adminIds()` is not org-scoped (would push every tenant's admins).
12. PDF/WhatsApp copy, `Customer N` label regex (`/^Customer \d+$/`, used in whatsapp.ts:60, wa-jobs, pdf.ts) and "Walk-in customer" are English-only and duplicated in 3 files.
13. Public pages (receipt `/r`, rate `/rate`) render with no org context; org (branding) must come from the sale token's row (receipt payload already carries salon branding via `receiptOf`, routes.ts:302-330).
14. Web guards: role guard is a hardcoded path list in app-shell, separate from nav.ts; feature gating needs one shared table.
15. Tests: wa-sql.test.ts builds its own inline schema; any org_id change to FEEDBACK_DUE_SQL/REMINDER_DUE_SQL must update it. panels.test.ts is not in `npm test`.
