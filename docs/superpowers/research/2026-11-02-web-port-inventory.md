# FM web -> SalonStation dashboard port inventory (2026-11-02)

Source: `/Users/laxmikant/Desktop/ERP/gents-salon/web` (Next 16.3.1, static export, 13,183 lines under `src/` incl. ui kit, css and tests). Target: `salonsync/apps/web` (does not exist yet; `apps/` holds only `api`). SS API: `salonsync/apps/api`. Paths below are relative to `gents-salon/web/` unless prefixed `FM api/` (= `gents-salon/api/src/`) or `SS/` (= `salonsync/apps/api/src/`; `SS contract` = `salonsync/packages/contract/src/index.ts`; `SS features` = `salonsync/packages/features/src/index.ts`).

Terms: "admin" = SS role `owner` or `admin` (`SS/core/roles.ts:7`); FM only has `admin`/`barber`. Mismatch ids (M1...) are defined in section 1.3 and reused later.

---

## 1. Pages

### 1.1 Page inventory (every `src/app/**/page.tsx`)

Lines = the page file only. Calls made by child components are attributed to the page that renders them. All FM calls go through `api()` (`src/lib/api.ts:13`) or `useApi()` (`src/hooks/use-api.ts:21`) against a relative `/api/...` URL.

| Route | Lines | API calls (method path) -> SS route | Mismatch ids |
|---|---|---|---|
| `/` (`app/page.tsx`) | 10 | admin: `AdminDashboard` (`components/app/admin-dashboard.tsx:64`) GET `/api/reports/overview?from&to` -> `SS/tenant/reports/routes.ts:26`; its `CompanyExpenseDialog` POST `/api/company-expenses` -> `expenses/routes.ts:142`; `HomePushPrompt` -> push.ts (below). Barber: `BarberToday` GET `/api/reports/me?month` (`barber-today.tsx:24`) -> `reports/routes.ts:21`; GET `/api/sales?day&page_size=200` (`:25`) -> `sales/routes.ts:107`; `ExpenseDialog` PUT `/api/expenses` (`expense-dialog.tsx:59`) -> `expenses/routes.ts:66` | M2, M4, M12, M15, M18 |
| `/login` | 101 | POST `/api/auth/login` `{username,password}` (`lib/auth-context.tsx:73`) -> `SS/platform/auth.ts:25` (same path) | M3 |
| (all pages, via AuthProvider) | - | GET `/api/auth/me` (`auth-context.tsx:50`) -> **no such route**; SS has GET `/api/me` (`SS/platform/me.ts:14`). POST `/api/auth/logout` (`:83`) -> `auth.ts:76` ok | M1, M2 |
| `/account` | 100 | PUT `/api/me/password` `{current,next}` (`account/page.tsx:29`) -> `me.ts:32`; PUT/DELETE `/api/me/avatar` (`avatar-picker.tsx:49`) -> `staff/routes.ts:232-233`; `NotificationsCard` -> POST/DELETE `/api/push/tokens` (`lib/push.ts:85,120,126`) -> `notifications/routes.ts:27,37` | M10, M15, M21 |
| `/announcements` | 220 | GET `/api/users` (`:48`), GET `/api/announcements` (`:49`), POST `/api/announcements` (`:72`) -> `announcements/routes.ts:21,23`. Tab "WhatsApp" = `WaAnnouncements` (723 lines): GET `/api/wa/templates`, `/api/wa/audience`, `/api/wa/campaigns` (only when `settings.wa_ready`, `wa-announcements.tsx:67-74`), POST `/api/wa/test` (`:237`), POST `/api/wa/campaigns` (`:255`), POST `/api/wa/campaigns/:id/next` (`:517`), POST `/api/wa/media` multipart via raw `fetch` (`:475`), POST `/api/wa/templates` (`:636`) -> all in `SS/tenant/campaigns/routes.ts:89-175` | M13a, M14, M15b, M19, M20 |
| `/audit` | 167 | GET `/api/users` (`:68`), GET `/api/audit?entity&actor_id&from&to&q&page_size` (`:73`) -> `audit/routes.ts:18`; `AuditDiff` GET `/api/sales/:id/history` (`audit-diff.tsx:93`) -> `audit/routes.ts:39` | M6b, M24 |
| `/barbers` | 323 | GET `/api/users` (`:30`); PUT `/api/users/:id` `{...u,active}` (`:38,179`); DELETE `/api/users/:id` (`:49`, reads `deactivated`); POST `/api/users` (`:180`); PUT `/api/users/:id/avatar` (`:201` via picker); POST `/api/users/:id/reset-password` (`:293`) -> `staff/routes.ts:106-235` | M4, M9, M10, M11 |
| `/bills` | 105 | GET `/api/sales?q&day&page_size` (`:34`) -> `sales/routes.ts:107`; opening a bill (`bill.tsx`): GET/POST `/api/sales/:id/whatsapp` (`:260,282`) -> `whatsapp/routes.ts:116,122`; admin `BillHistory` GET `/api/sales/:id/history` | M6a, M15c, M16 |
| `/customers` | 94 | GET `/api/customers?q&page_size=50*pages` (`:28`) -> `customers/routes.ts:25` | M13 |
| `/customers/view` (`?id=`) | 201 | GET `/api/customers/:id` (`:37`) -> `customers/routes.ts:48`; GET `/api/sales?customer_id&page_size` (`:38`); PUT `/api/customers/:id/whatsapp {opt_out}` (`:94`) -> `whatsapp/routes.ts:134` | M13, M15c |
| `/expenses` | 188 | GET `/api/users` (`:25`); GET `/api/expenses?month&barber_id` (`:26`) -> `expenses/routes.ts:57`; PUT `/api/expenses` (dialog); `CompanyExpenses` GET `?month` (`company-expenses.tsx:25`), POST/PUT/DELETE `/api/company-expenses[/:id]` (`:123,161`) -> `expenses/routes.ts:135-165` | M12, M18 |
| `/history` | 72 | GET `/api/reports/me?month` (`:16`) -> `reports/routes.ts:21` | - |
| `/ledger` | 26 | `LedgerShop` (160 lines): GET `/api/ledger/balances`, `/api/ledger/shop?from&to&account` (`ledger-shop.tsx:33-34`), GET `/api/transfers?month` (`:41`); `LedgerBarbers` (290): GET `/api/ledger/barbers`, `/api/ledger/barbers/:id?from&to` (`ledger-barbers.tsx:27,112`), GET/POST/PUT/DELETE `/api/payouts[/:id]` (`:117,238,280`); `ledger-dialogs.tsx`: POST/PUT/DELETE `/api/transfers[/:id]` (`:62,97`), PUT `/api/ledger/balances` (`:127`) -> `SS/tenant/ledger/routes.ts:99-253` (same paths) | M18 |
| `/monthly` | 165 | GET `/api/reports/monthly?year` (`:23`) -> `reports/routes.ts:35` | - |
| `/r` (`?t=`) | 57 | GET `/api/public/receipt/:token` (`:23`, `redirectOn401:false`) -> `SS/core/public.ts:99` | M17 |
| `/rate` (`?t=`) | 50 | No fetch; `window.location.replace("/api/public/review/<token>")` (`:25-27`) -> `public.ts:225` (302) | M16 |
| `/ratings` | 148 | GET `/api/ratings?from&to` (`:43`) -> `ratings/routes.ts:12` | M15d |
| `/sales` | 108 | GET `/api/users` (`:23`), GET `/api/sales?day&barber_id&payment_mode&page_size` (`:32`); global `SaleSheet` (610 lines): GET `/api/services` (`sale-sheet.tsx:116`), GET `/api/users` (admin, `:115`), POST `/api/sales` (`:256`), PUT/DELETE `/api/sales/:id` (`:225,273`); `customer-suggest.tsx:31,39` GET `/api/customers?q&page_size=6|8` -> `sales/routes.ts:107-278`, `services/routes.ts:71`, `customers/routes.ts:25` | M6a, M13, M18 |
| `/services` | 206 | GET `/api/services?all=1` (`:24`), POST `/api/services` (`:160`), PUT `/api/services/:id` (`:37,159`), DELETE (`:48`) -> `services/routes.ts:71-108` | - |
| `/settings` | 382 | PUT `/api/settings` `{...s, vat_rate, notify_sale_min, wa_reminder_days, quick_amounts}` (`:59`) -> `settings/routes.ts:185`; POST `/api/wa/reminders/run` (`:159`), `/api/wa/feedback/run` (`:208`) -> `whatsapp/routes.ts:164,170`. Reads settings from AuthProvider; never calls GET `/api/settings` | M5, M6, M7, M8, M15e |
| `/sheet` | 188 | GET `/api/reports/daily?month` (`:31`) -> `reports/routes.ts:30`; `exportDailySheet` (client-side XLSX, `lib/excel.ts`) | M15f |

Not pages but make calls: `components/admin/top-bar.tsx:55` renders `NotificationBell` for every signed-in role -> GET `/api/notifications` (`notification-bell.tsx:30`), POST `/api/notifications/read` (`:51`) -> `notifications/routes.ts:43,50`. `app-shell.tsx:75-83` calls `startPush()` after every sign-in -> POST `/api/push/tokens`.

There are no other FM calls: no GET `/api/settings`, no `/api/public/services`, `/api/public/bill`, `/api/public/feedback` from the web app (those are used by the FM site, WhatsApp, and the removed in-app rating page).

### 1.2 SS routes with the same path and shape (no mismatch found)

`/auth/logout`, `/sales` list/create/update/delete (shape), `/expenses` GET/PUT, `/company-expenses`, `/transfers`, `/ledger/balances|shop|barbers`, `/payouts`, `/reports/me|overview|daily|monthly` (types identical in `lib/types.ts:569-600` vs `SS contract`), `/ratings` (RatingsReport identical), `/audit` (AuditEntry identical), `/services` (Service/ServiceInput identical, `price` major units in, minor out), `/announcements` (shape identical), `/notifications` (NotificationFeed identical), `/sales/:id/whatsapp`, `/wa/templates|test|audience|campaigns|media` bodies and `WaTemplate/WaCampaign/WaMessage` types (identical). Money is still integer minor units; day is still `YYYY-MM-DD`; timestamps epoch ms.

### 1.3 Mismatches

Each row: FM expectation (file:line) vs SS behaviour (file:line).

| Id | Area | FM | SS | Effect on port |
|---|---|---|---|---|
| M1 | Path | `GET /api/auth/me` (`lib/auth-context.tsx:50`; FM api `routes.ts:402`) | `GET /api/me` (`SS/platform/me.ts:14`); `/api/auth/me` falls to JSON 404 (`index.ts:98`) | Change path; 404 would be swallowed by `refresh()` catch (`:53`) and look like signed-out |
| M2 | Response shape `/me` | `{ user: Me{id,name,username,role,commission_pct,avatar_url,can_add_expense}, settings, today }` (`types.ts:10,48-58`) | `{ user:{id,name,username,role}, org, settings, features, limits, subscription, brand, today }` (`SS contract:100-109`, `me.ts:17-26`). `user` has NO `commission_pct`, `avatar_url`, `can_add_expense` | Used at `barber-today.tsx:21` (`can_add_expense`, always false -> barber expense button never shows), `top-bar.tsx:58`, `account/page.tsx:51`, `barber-today.tsx:32` (`avatar_url`, always undefined). Needs another source (GET `/users` is admin-only) or an API change |
| M3 | Login request | `{username,password}` (`auth-context.tsx:73`); FM lowercases username server-side | `{org?,username,password}`; org is taken from the host only when `ROOT_DOMAIN` is set and the host is a tenant subdomain; on workers.dev/localhost (`kind:"none"`) `body.org` (slug) is REQUIRED, else 401 (`auth.ts:37-41`). Case of username kept as typed. 401 text `"Wrong salon ID, username or password"` (`auth.ts:13`). Response `{ok, slug}` (`:73`) | Login page needs a salon-ID field when not on a tenant host; FM's login page (`login/page.tsx:26-38`) has none |
| M4 | Role | `Role = "admin" \| "barber"`; `isAdmin = role==="admin"` (`auth-context.tsx:95`), `navFor` (`nav.ts:79-81`), `app-shell.tsx:88`, `top-bar.tsx:65`, `account/page.tsx:47`, `barbers/page.tsx:159` | `Role = "owner"\|"admin"\|"barber"` (`SS contract:96`). The salon creator is `owner` -> FM code treats the owner as a barber (barber nav, redirected off all admin paths) | Every `role === "admin"` must become owner-or-admin. Barbers page: owner row has `role:"owner"`, PUT with role change/active=false/other username -> 400 `"The owner can't be changed here"` (`staff/routes.ts:14,144-147`); POST with role owner -> 400 |
| M5 | Field name | `Settings.salon_name` (`types.ts:61`), used at `settings/page.tsx:70,283`, `bill.tsx:30,47,55,86`, `sheet/page.tsx:46`, `r/page.tsx:29`, `bill.tsx:82` | `display_name` in Settings/SettingsInput (`SS contract:~64`). `Receipt.salon` keeps BOTH `salon_name` and `display_name` (`SS contract` Receipt, `public.ts:74-75`) | Rename for `/me.settings` and PUT /settings; `/r` page can keep `salon_name` |
| M6 | Units (response and request) | `vat_rate` is a fraction (0.05): `types.ts:69`; `settings/page.tsx:37` (`vat_rate*10000/100`) and `:51` (`Number(vatPct)/100`); `sale-sheet.tsx:234,252`; `bill.tsx:89,167` (`Math.round(vat_rate*100)%`); `audit-diff.tsx:48` | Percent (5 = 5%): `Settings.vat_rate` and `Sale.vat_rate` (`SS contract` Settings; `SS/lib/money.ts:26-30` `vatOf(amount, ratePct)`; `sales/routes.ts:159`). PUT accepts 0-100 (`settings/routes.ts:40-44`) | (a) bill/sale-sheet/receipt show "500%"; optimistic sale VAT wrong. (b) Settings save sends 0.05 -> stored as 0.05%. (c) audit diff shows "500%" and for settings audit rows the units follow SS |
| M7 | Settings PUT contract | Partial merge: omitted keys keep current values (FM api `routes.ts:2041-2072`); page spreads `s` (`settings/page.tsx:49-57`) | Full replace; EVERY editable field required, strict types (`settings/routes.ts:96-169`): needs `timezone, locale, currency, phone_country, bill_prefix, day_start_hour, wa_bill_template, wa_bill_pdf_template, wa_reminder_template, wa_language, wa_feedback_template, wa_feedback_reminder_template, wa_*_image_url`... Range changes: `wa_reminder_days` 1-90 (FM 1-365, `routes.ts:2062`); TRN 15 digits only when `phone_country==="971"` else free text <=40 (FM always 15 digits, UI strips to digits `settings/page.tsx:~287`); `quick_amounts` each <=1,000,000 (FM <100,000); `thank_you_text` required. Unknown keys (`wa_ready`, `currency_minor`, `logo_url`, `brand_color`) are ignored. Currency change that alters decimals -> 400 (`:196-198`) | Spreading `/me.settings` back works only if the form keeps all keys; new fields need UI (timezone, currency, locale, phone country, bill prefix, day start hour, templates) |
| M8 | Removed fields | `whatsapp_mode` ("off"\|"link") drives the wa.me share button and the settings toggle (`bill.tsx:25`, `settings/page.tsx:243`); `wa_test_numbers` string shown at `settings/page.tsx:127-129`, `wa-announcements.tsx:91-106` | Neither exists (`SS contract` Settings: "legacy whatsapp_mode is not ported"). Test numbers live in `GET /api/whatsapp/config` -> `{phone_number_id,waba_id,test_numbers[],has_token}` (admin, feature `whatsapp`, `whatsapp/routes.ts:64-70`) | `whatsappLink()` returns null / toggle needs removal or a new rule; test-mode banner needs the config route |
| M9 | Users | PUT body `{...u, active}` (`barbers/page.tsx:38`); POST returns 201; 409 text `"That username is taken"` (FM api `:1839`); no plan limit | SS 409 `"Username is taken"` (`staff/routes.ts:115,131`); POST/PUT(reactivate) 409 `{error:"Staff limit reached for your plan", code:"staff_limit"}` (`:104,128,169`); user-delete response adds `deleted:true` (`:202`); `username` regex allows `@`/`+` and keeps case (`:17`); password min 4 (`:79,183`) | Handle `staff_limit` (needs `limits.max_staff` from `/me` and active count); no field renames |
| M10 | Avatar URL/path | `avatar_url` = `/api/users/:id/avatar?v=` (public, FM api `routes.ts:378`; `types.ts:41`) | `avatar_url` = `/api/public/avatar/:id/:v?org=<slug>` (`SS/data/tenant/users.ts:36-38`); the FM public path is gone | Web only renders the opaque `avatar_url`, so no code change; `?org=` is meaningful only on workers.dev. Upload bodies unchanged (raw image, <=200 KB; `staff/routes.ts:207-221`) |
| M11 | Users list | GET `/api/users` returns all users ordered role, sort_order, name | Admin only (`staff/routes.ts:106`, 403 `"You don't have access to this"` for barber); includes `owner` role rows | `sales/page.tsx:23`, `expenses/page.tsx:25`, `audit/page.tsx:68` are admin-only pages so fine; barber `sale-sheet` correctly skips (`:115`) |
| M12 | Status code | Barber without `can_add_expense` -> 400 `"Expenses are added by the admin. Ask them to add yours."` (FM api `routes.ts:946`) | 403 with the same text (`expenses/routes.ts:84-86`); also feature `expenses` gate (403 `feature_disabled`) | Client treats all errors as toast text, so only a status-based branch would care |
| M13 | Response shape `/customers` | Admin always gets `Paged<Customer>` (visits, spent, last_visit_at, wa_opt_out) (`customers/page.tsx:28,64`) | Admin gets `Paged<Customer>` ONLY if feature `customers_crm`; admin without it (and barbers) get `Paged<CustomerSuggestion>` `{id,name,phone}`, `page:1,page_size:8,total=items.length` (`customers/routes.ts:30-44`). No 403. `GET /customers/:id` needs `customers_crm` + admin (403 `feature_disabled`) | The Customers page must be gated on `features.includes("customers_crm")` before calling, else rows render `aed(undefined)` and a fixed 8-row list. (M13a: `customer-suggest` page_size=6/8 works unchanged; its barber branch is identical: q>=3 chars or empty) |
| M14 | Recipients | Announcement audience "all" = every active user incl. sender (FM api `routes.ts:512-514`) | Every active user EXCEPT the sender (`announcements/routes.ts:42`; `recipients` count differs) | Wording only |
| M15 | Feature gating (403) | No gating at all | `403 {"error":"This feature isn't in your plan","code":"feature_disabled"}` (`SS/core/pipeline.ts:75`) on: (a) `/wa/*` -> `whatsapp_campaigns`; (b) `/announcements`, also push delivery only with `push`; (c) `/sales/:id/whatsapp`, `/customers/:id/whatsapp`, `/wa/reminders|feedback/run`, `/whatsapp/config` -> `whatsapp`; `/customers/:id` -> `customers_crm`; `/sales/:id/history`, `/audit` -> `audit_log`; (d) `/ratings` -> `ratings`; (e) PUT `/settings` has no feature gate but wa/google fields are useless without features; (f) `/reports/daily` -> `daily_sheet`, `/reports/monthly` -> `reports_advanced`; `/expenses`, `/company-expenses` -> `expenses`; `/ledger/*`, `/payouts`, `/transfers` -> `ledger`; `/notifications*`, POST `/push/tokens` -> `push` (DELETE `/push/tokens` ungated, `notifications/routes.ts:37`) | The FM client has zero 402/403/409 handling: `ApiError` (`lib/api.ts:3-9`) drops `code`; no caller reads `.status` (grep: none outside api.ts). Every page must be gated by `/me.features` and `api.ts` must expose `code` |
| M16 | Public rating flow | `/rate/?t=` just redirects to `/api/public/review/<token>` (`rate/page.tsx:25-27`); the 302 goes to `google_review_url`. Staging `s.` token prefix handling (`:6-23`) | `GET /api/public/review/:token` redirects to Google if `google_review_url` is an https URL, else to `${orgAppUrl}/rate/?t=<token>` (`public.ts:225-237`, `core/links.ts`) -> redirect LOOP with the FM `/rate` page whenever the org has no Google URL. Needs feature `ratings`, else JSON 404 `{"error":"Not found"}` | `/rate` must render the in-app rating page from `GET/POST /api/public/feedback/:token` (`FeedbackPage`, `FeedbackInput {stars,comment}`, `public.ts:182-222`); drop staging logic |
| M17 | Public receipt | 404 text `"Receipt not found"` (FM api `routes.ts:193-201`); salon block `{salon_name, salon_name_ar, tagline, address, phone, trn, receipt_footer}` | 404 `{"error":"Not found"}` (`public.ts:99-107`); salon block adds `display_name, licence_no, logo_url, currency, currency_minor, locale, timezone` (`public.ts:73-85`). Org comes from the token; works on any host | `r/page.tsx:29` fine; use new fields for currency/logo/tz |
| M18 | Error code `stale` | Last-write-wins | `409 {"error":"...changed by someone else. Reload and try again.","code":"stale"}` on PUT/DELETE of sales (`sales/routes.ts:208`), `PUT /expenses` zero/upsert, company expenses, transfers, payouts, PUT `/ledger/balances` (`expenses/routes.ts:12`, `ledger/routes.ts:78-83,174`) | UI must reload row and retry; currently shows raw text only |
| M19 | WA campaign limits | `/next` sends up to 40 (`types.ts:407`) | `CAMPAIGN_BATCH` 15 (`SS/tenant/campaigns/routes.ts:20-26,164`); create refuses >1000 audience with 400 and a second unfinished campaign with 409 `{code:"campaign_running"}` (`:151-155`); 409 `{code:"wa_not_ready"}` on every `/wa/*` and `/sales/:id/whatsapp` POST when no number connected | `drain()` loop (`wa-announcements.tsx:511-526`) still works (stops after 3 no-progress calls) but takes ~3x more calls; needs `campaign_running`/`wa_not_ready` UI |
| M20 | WA templates | Language fixed `"en"` (`FM api routes.ts:1460`) | Language from `settings.wa_language` (`campaigns/routes.ts:107`) | none beyond settings field |
| M21 | `/me/password` | Client enforces `minLength={4}` / `next.length < 4` (`account/page.tsx:90,92`); server min 4 | Server min **6**, max 200 (`me.ts:41-42`); wrong current -> 400; 429 after repeated failures (`:47-50`) | Raise client min to 6 |
| M22 | Origin guard | none | All writes incl. login/logout check `Origin` host == request host and `Sec-Fetch-Site` same-origin/none, else 403 `{"error":"Cross-site request blocked","code":"bad_origin"}` (`pipeline.ts:17-32`, `auth.ts:22-23`) | Fine in production same-origin. In `next dev` the FM rewrite (`next.config.ts:15-18`) forwards `/api` to `localhost:8787` while the browser Origin is `localhost:3000`; unless the proxy preserves Host, every write is 403 (not verified) |
| M23 | Lifecycle write block | none | 402 `subscription_inactive` for writes when org status not in trial/active/grace/past_due (see section 3.3); FM client does not branch on 402 | UI must switch to read-only/upgrade state |
| M24 | Audit vocabulary | Entity filter list `audit/page.tsx:20-29`; verbs `audit-diff.tsx:60` (create/update/delete/password_reset); labels `audit-diff.tsx:10-30` | SS also writes entity `whatsapp` (`data/tenant/whatsapp.ts:90,110`, actions create/update/delete) and action `starter` (services seed); settings rows now carry `display_name`, `timezone`, `currency`... (no label -> generic fallback) | Add filter option + verb + labels; `vat_rate` formatting (M6) |
| M25 | Cookie | FM cookie `secure` only on https (FM api `routes.ts:114`) | Name `ss_session`, `httpOnly`, `Secure` always, `SameSite=Lax`, path `/`, 60 days (`SS/core/session.ts:6-16`) | Local http dev: Secure cookie not stored by Safari |
| M26 | 401 behaviour | Any 401 not on `/login` -> `window.location.href="/login"` (`api.ts:26-30`) | 401 also for deactivated/deleted org (`pipeline.ts:57`, no code) and `wrong_org` code (host org != session org, `:50,53`) | A `wrong_org` 401 sends the user to `/login` on the wrong host; cache `fm_session_cache` must also be cleared |

Count: **26 numbered mismatches** (M13 includes sub-case M13a; M15 spans six feature areas; M6 has three effects).

---

## 2. Shared libraries

### 2.1 `src/lib/api.ts` (60 lines)
- Base URL: none; relative same-origin `fetch(path)` with `credentials:"include"` (`:19-24`). Requires dashboard to be served from the API's origin (section 5).
- Cookie name: not referenced client-side (httpOnly). FM cookie is `fm_session` in FM api; SS `ss_session`.
- Error handling: parses `{error}` only (`:39-45`); `ApiError{status,message}` no `code`. 401 -> hard redirect `/login` (`:26-30`).
- Body: JSON, FormData, no Blob (avatar/media bypass it with raw `fetch`: `avatar-picker.tsx:49`, `wa-announcements.tsx:475`; these also drop 401 redirect).

### 2.2 `src/lib/auth-context.tsx` (110 lines)
- Fetches `/api/auth/me` (M1); session type `{user: Me, settings: Settings, today}` (`:9-13`). Caches in `localStorage` key `fm_session_cache` (`:26`) -> rename per brand (and key by org slug, since one browser can host many tenant subdomains but the same key per origin is fine; on workers.dev multiple salons share one origin).
- `isAdmin = role === "admin"` (`:95`) -> owner/admin (M4).
- `login(username,password)` (`:71`) -> add `org`.
- Must hold: `user, org, settings (+wa_ready), features, limits, subscription, brand, today`. Exact `/api/me` handler output (`SS/platform/me.ts:14-27`, type `MeResponse` `SS contract:100-109`):
  ```
  { user:{id,name,username,role}, org:{id,slug,name,status,planId},
    settings:{...Settings, wa_ready}, features:string[], limits:{max_staff:number|null},
    subscription:{status,planId,trialEndsAt:number|null,graceEndsAt:number|null},
    brand:{name}, today:"YYYY-MM-DD" }
  ```
  `brand.name` = Worker var `BRAND_NAME` ("SalonStation", `wrangler.jsonc:vars`). `today` is the org business day. `settings.logo_url`, `settings.brand_color` (nullable) are the per-org branding. The design spec (`docs/.../specs/...-design.md:277`) lists `subscription.plan`; the implementation returns `planId`.
- Places that must read `/api/me` data: AuthProvider; `nav.ts` (features + role); `app-shell.tsx:88` (`ADMIN_PATHS`, role); `top-bar.tsx:58-65`; `account/page.tsx`; `barber-today.tsx:21,32`; `sale-sheet.tsx:114,234,246,251`; `bill.tsx:25,206`; `settings/page.tsx`; `wa-announcements.tsx:67-106`; plus a new subscription banner, plan view, staff-limit hint (`limits.max_staff`).

### 2.3 `src/lib/types.ts` (620 lines)
Hand-copied contract. Replace by `@ss/contract` (workspace dep). Differences vs `SS contract`: `Role` (M4); `Me` vs `MeUser` (M2); `Settings` (M5-M8: `salon_name`->`display_name`, fraction->percent, no `whatsapp_mode`/`wa_test_numbers`; adds `timezone, day_start_hour, currency, locale, phone_country, bill_prefix, wa_*_template, wa_language, wa_*_image_url, currency_minor, logo_url, brand_color, wa_ready`); `Receipt.salon` extra fields (M17); doc comments say "AED", "fils", "Dubai" (`:5,75,77,89,167,176,185,211-213,239,258,287,300,313,345,592,615`). Everything else (Sale, Expense, Ledger, Audit, Wa*, Report, Customer types) is byte-compatible.

### 2.4 `src/lib/push.ts` (157 lines)
- Hardcoded Firebase web config for project `fm-salon-app`: `apiKey AIzaSyBBs6u...`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId 923048894140`, `appId` (`:14-21`), VAPID key (`:30`); duplicated verbatim in `public/firebase-messaging-sw.js:9-16`. SS uses ONE FCM project for all salons (`FCM_SERVICE_ACCOUNT`, README "Secrets") so this becomes ONE SalonStation Firebase web config (build-time env), not per-org; it is not delivered by `/api/me`.
- localStorage keys `fm_push_token`, `fm_push_optout` (`:22-23`); default title `"FM Salon"` (`:139`); SW path `/firebase-messaging-sw.js`, SW notification click logic.
- API: POST `/api/push/tokens {token}`, DELETE same (`:85,120,126`). SS gates POST on feature `push` (M15); DELETE ungated. `startPush` runs for every user after sign-in (`app-shell.tsx:75-83`), so without `push` it will call a 403 route unless gated.
- Server-side push link uses `env.APP_ORIGIN` (`SS/integrations/push-client.ts:86`), not the tenant subdomain; notification paths used by SS: `/`, `/history/`, `/ratings/` (`sales/hooks.ts:110`, `public.ts:213`), so these must exist as routes with trailing slash.

### 2.5 `src/lib/format.ts` (164 lines)
- Currency: `aed()` hardcodes the prefix `"AED "` and divides by 100 (`:6-10`), `Intl.NumberFormat("en-AE")` (`:3-4`), `num()`, `toInput()` divide by 100 (`:13-21`). Needs `settings.currency`, `settings.currency_minor`, `settings.locale`. Same /100 or *100 assumptions elsewhere: `settings/page.tsx:38,52`, `service-picker.tsx:75,155`, `sale-sheet.tsx:123,151,163,180,216,236,246`, `bill.tsx:145,147`, `admin-dashboard.tsx:236-237`, `services/page.tsx:37`, `excel.ts:4`, `numpad.ts:5` (6 whole digits "AED 999,999").
- Time zone: `DUBAI = "Asia/Dubai"` (`:23`) used by `dubaiDay`, `businessDay`, `timeLabel`, `dateTimeLabel` (`:26,34,67-75`); also `bill.tsx:292` and `excel.ts:109` use `"Asia/Dubai"` inline. Must come from `settings.timezone`.
- Day start: `DAY_START_HOUR = 4` (`:31`) -> `settings.day_start_hour` (0-12; SS clock uses wall-time in zone, DST-safe, `SS/lib/clock.ts`). The client could instead use `/me.today` and sale `day` fields; `businessToday()` is used for the admin sale-day default (`sale-sheet.tsx:530`).
- Phone: `whatsappDigits()` adds `971` (`:90-93`); `phoneLabel()` only formats `05xxxxxxxx` (`:84-88`); `COUNTRIES` list, UAE first (`:115-132`); `splitPhone()` default `971` and `0`-prefix = UAE (`:158-164`); `phone-field.tsx:8` "UAE +971 by default"; `customer-picker.tsx:17`; `sale-sheet.tsx:201` `setCc("971")`. Must use `settings.phone_country`. Canonical phone format from the SS API: for `971` local `05XXXXXXXX`/`0[234679]XXXXXXX`, foreign `+digits`; for other codes always `+<cc><national>` (`SS/lib/phone.ts`), so `startsWith("0")` -> UAE is wrong for other orgs.
- `format.test.ts` asserts Dubai +04:00 (see section 6).

### 2.6 `src/hooks/use-api.ts` (69 lines)
- Module-level cache `Map` keyed by path (`:7`); `DATA_CHANGED = "fm:data-changed"` (`:10`); cleared on logout (`:67`). Path-only keying: on workers.dev with several salons in one origin the cache is cleared on logout so safe; add org key if multi-session.
- Assumes any failing GET is a plain message; with 403 `feature_disabled` it sets `error` (`:40`) -> page shows error state. Needs gating before request (`useApi(null)` supports skip).

### 2.7 `src/lib/excel.ts` (128 lines)
- File names `"FM Salon <month>.xlsx"`, `"FM Salon <year> summary.xlsx"`, `"FM Salon ledger ...xlsx"` (`:69,92,127`); title row embeds `salonName` (`:46`); `aedNum` divides by 100 (`:4`); time `"Asia/Dubai"` (`:109`); layout "client's SALOON RECORD.xlsx" (`:11-16`) with column name "Details = SALE/COM". Feature key `excel_export` (Pro+; API has no route, `README.md` "reserved"): the export buttons (`sheet/page.tsx:46`, monthly, ledger) need `features.includes("excel_export")`. Dependency: `xlsx` from `cdn.sheetjs.com` tarball (`package.json`).

### 2.8 Other hardcoded FM/brand things (outside the six files)

| Thing | Where | Becomes |
|---|---|---|
| "FM Salon" strings | `app/layout.tsx:10,13` (title, template, apple title); `top-bar.tsx:35`; `nav.ts:99`; `app-sidebar.tsx:26` ("FM Salon", subtitle "Gents salon · Dubai" `:27`); `app-shell.tsx:116`; `notifications-card.tsx:15`; `push-prompt.tsx:53`; `bill.tsx:47,55,86`; `sheet/page.tsx:46`; `push.ts:139`; SW comment; `public/manifest.webmanifest:2-3` ("FM Salon — Faizan Mohammed Gents Salon"); `login/page.tsx:12,45-49,57` (Arabic name, tagline); `rate/page.tsx:34` | per-org `settings.display_name` / `brand.name`; the manifest and `<title>` are static in a static export, so need runtime `document.title` and a dynamic/neutral manifest |
| Logos | `/logo-mark.png`, `/logo.png` (`components/logo.tsx:8,24`, `bill.tsx:94`, `rate/page.tsx:36`); `app/icon.png`, `apple-icon.png`, `public/icon-192/512.png` | `settings.logo_url` (`/api/public/logo/<v>?org=<slug>`, `SS/tenant/settings/routes.ts:223,236`); fallback SalonStation mark. PNG logo capped 512x512, 200 KB |
| Colours | `components/theme/theme.ts:9` `DEFAULT_ACCENT "#3B4CCA"` ("blue of the FM scissors"), `ACCENTS` list `:11-19`; `app-theme.css`; `layout.tsx:25-26` theme-color `#F4F4F2`/`#000000`; manifest `theme_color #000000`; `theme-provider.tsx` accent prefs key `fm_ui_prefs` (`:20`) | `settings.brand_color` (nullable) as default accent; per-user override stays in localStorage |
| localStorage / event keys | `fm_session_cache`, `fm_push_token`, `fm_push_optout`, `fm_ui_prefs`, `fm_sidebar_collapsed`, events `fm:data-changed`, `fm-ui-prefs`, `fm-sidebar-collapsed`, `fm:wa-bill` | rename prefix |
| Staging detection | `components/app/env-badge.tsx:5`, `rate/page.tsx:6` (`fm-salon-staging.affworld0.workers.dev`) | drop or point at SS staging host |
| Fonts | `components/theme/fonts.ts` Google Sans Flex/Code via `next/font/google` (build-time fetch) | keep or swap |
| Dubai wording in UI copy | `settings/page.tsx:258` "Times are Dubai time"; "AED" in labels: `settings/page.tsx:91,262`, `services/page.tsx:192`, `expense-dialog.tsx:87`, `company-expenses.tsx:133`, `ledger-dialogs.tsx:73,137,140`, `ledger-barbers.tsx:88,257`, `ledger-shop.tsx:140`, `history/page.tsx:65`, `monthly/page.tsx:162`, `sheet/page.tsx:164`, `sale-sheet.tsx:386`, `service-picker.tsx:154,190`, `bill.tsx:175` ("Amounts in AED"), `money-tile.tsx:6` | currency code from settings |
| VAT/TRN UAE assumptions | `settings/page.tsx:~106` "TRN (15 digits)" and digits-only input; `bill.tsx` "tax invoice with TRN" | gate on `phone_country==="971"` or locale |
| Per-org clock vs client clock | `lib/format.ts` (above), `barber-today.tsx`, `sales/page.tsx` | use `/me.today` |

---

## 3. Feature mapping

### 3.1 Feature keys (`SS features:1-16`)
`core_sales` (always on), `expenses`, `daily_sheet`, `customers_crm`, `ratings`, `reports_advanced`, `excel_export`, `push`, `announcements`, `ledger`, `audit_log`, `whatsapp`, `whatsapp_campaigns`, `public_services_api`. Plans (`:32-62`): free = core_sales+expenses+daily_sheet (max_staff 2); pro adds customers_crm, ratings, reports_advanced, excel_export, push, announcements (max_staff 10); pro_max = all (max_staff null). Trial orgs = pro_max minus `whatsapp`, `whatsapp_campaigns` (`:67-69`). Per-org overrides can flip any key except `core_sales`.

### 3.2 Nav items and pages

"Roles" = who may use it in SS (`requireAdmin` = owner/admin).

| FM nav item (`nav.ts`) / page | SS feature key | Roles (SS) | FM client guard today |
|---|---|---|---|
| Dashboard `/` (admin) | `core_sales` (`/reports/overview`) | admin | `app/page.tsx:9` |
| Today `/` (barber) | `core_sales` (`/reports/me`, `/sales`); expense button also `expenses` + `can_add_expense` | barber (admin gets /reports/me too) | `barber-today.tsx:21` |
| Sales `/sales` | `core_sales` | admin page (API lets barbers list own) | `ADMIN_PATHS` `app-shell.tsx:34` |
| Bills `/bills` | `core_sales` | admin all; barber own | none |
| Expenses `/expenses` | `expenses` | admin (company expenses admin only; barber PUT own day with `can_add_expense`) | `ADMIN_PATHS` |
| Daily sheet `/sheet` | `daily_sheet` (+ `excel_export` for the XLSX button) | admin | `ADMIN_PATHS` |
| Monthly `/monthly` | `reports_advanced` (+ `excel_export`) | admin | `ADMIN_PATHS` |
| Ledger `/ledger` | `ledger` (+ `excel_export`) | admin | `ADMIN_PATHS` |
| Ratings `/ratings` | `ratings` | admin | NOT in `ADMIN_PATHS` (barber would reach the page and get 403) |
| Audit log `/audit` | `audit_log` | admin | `ADMIN_PATHS` |
| Barbers `/barbers` | `core_sales`; `limits.max_staff` | admin (owner row locked) | `ADMIN_PATHS` |
| Services `/services` | `core_sales` (writes admin; GET any role) | admin | `ADMIN_PATHS` |
| Customers `/customers`, `/customers/view` | `customers_crm`; opt-out switch also `whatsapp` | admin | `ADMIN_PATHS` |
| Announcements `/announcements` (Team tab) | `announcements` (delivery to feed/push needs `push`) | admin | in-page `isAdmin` |
| Announcements WhatsApp tab | `whatsapp_campaigns` AND `whatsapp` + connected number (`settings.wa_ready`) | admin | `settings.wa_ready` only |
| Settings `/settings` | `core_sales`; Billing/Business sections core; Push section `push`; WhatsApp section `whatsapp`; rating/Google/Instagram fields `ratings` | admin | `ADMIN_PATHS` |
| My account `/account` | `core_sales`; notifications card `push` | all | none |
| My history `/history` (barber) | `core_sales` | barber | none |
| Notification bell (top bar) | `push` | all | none (calls unconditionally) |
| Bill dialog: WhatsApp send/status | `whatsapp` (+ `settings.wa_ready`) | admin; barber own sale | `bill.tsx:206` |
| Bill dialog: history | `audit_log` | admin | `bill.tsx:318` (role only) |
| `/r` receipt (public) | none | public | public path |
| `/rate` rating page (public) | `ratings` | public | public path |
| (no FM page) WhatsApp connection | `whatsapp` | admin | - |
| (no FM page) public price list API | `public_services_api` | public | - |

### 3.3 Responses the UI must handle (exact JSON)

Error body is always `{ "error": string, "code"?: string }` (`SS/index.ts:100-103`; `HttpError` `core/errors.ts`).

| Status | JSON | Source | Meaning |
|---|---|---|---|
| 403 | `{"error":"This feature isn't in your plan","code":"feature_disabled"}` | `pipeline.ts:75` | feature not enabled for the org; no feature name in the body, UI must know which call it made |
| 402 | `{"error":"Your subscription is inactive. Upgrade to continue.","code":"subscription_inactive"}` | `pipeline.ts:96` | any POST/PUT/PATCH/DELETE when org status is not `trial`,`active`,`grace`,`past_due` (`WRITE_OK` `:80`), i.e. `expired`. Reads still pass. Always allowed writes: paths starting `/api/auth/`, `/api/billing/`, `/api/me` and `/api/me/*`, `DELETE /api/push/tokens`, `POST /api/notifications/read` (`:83-90`) |
| 403 | `{"error":"Cross-site request blocked","code":"bad_origin"}` | `pipeline.ts:18` | writes only |
| 401 | `{"error":"Please sign in"}` | `pipeline.ts:46,57,62` | no/invalid session, user inactive, org `deactivated`/`deleted`, session_version changed |
| 401 | `{"error":"Please sign in","code":"wrong_org"}` | `pipeline.ts:50,53` | host's org != session org, or admin host |
| 401 login | `{"error":"Wrong salon ID, username or password"}` | `auth.ts:68` | |
| 429 | `{"error":"Too many attempts. Try again in a few minutes."}` | `auth.ts:60`, `me.ts:50` | login / password lockout; public routes `{"error":"Too many requests"}` + `Retry-After` (`public.ts:42-45`) |
| 409 | `{"error":"...","code":"stale"}` | sales/expenses/ledger | compare-and-set lost (M18) |
| 409 | `{"error":"Staff limit reached for your plan","code":"staff_limit"}` | `staff/routes.ts:104` | |
| 409 | `{"error":"Finish the current campaign first","code":"campaign_running"}` | `campaigns/routes.ts:105` | |
| 409 | `{"error":"<NOT_READY text>","code":"wa_not_ready"}` | `whatsapp/routes.ts:126,158`, `campaigns/routes.ts:67` | no connected WhatsApp number |
| 409 | `{"error":"That WhatsApp number is already connected to another salon"}` / 400 `"WhatsApp token cannot access this phone number"` | `whatsapp/routes.ts:27-28` | PUT `/whatsapp/config` |

Statuses `expired` also affects what the status banner shows: spec (`design.md:224-225`) wants grace/past_due = full use with a red banner, expired = full-screen "Upgrade to continue" (reads and export still allowed by the API). `/api/me` returns `org.status` and `subscription.{status,planId,trialEndsAt,graceEndsAt}` for this. No `/api/billing/*` routes exist yet (prefix is only allow-listed).

---

## 4. Gaps

### 4.1 FM calls with no SS route
- `GET /api/auth/me` (M1) -> `GET /api/me`.
- `GET /api/users/:id/avatar?v=` (public, FM) -> `GET /api/public/avatar/:id/:v?org=` (M10; no FM code builds it).
- Everything else the web app calls exists in SS (see 1.1).

### 4.2 SS routes with no FM page/UI
| SS route | Feature | Missing UI |
|---|---|---|
| `GET/PUT/DELETE /api/whatsapp/config` (`whatsapp/routes.ts:64-96`) | `whatsapp`, admin | Connect WhatsApp: `phone_number_id`, `waba_id`, write-only `token`, `test_numbers`; shows `has_token`; 409 duplicate, 400 no access |
| `POST /api/services/starter` (`services/routes.ts:82`) | core | "Add starter price list" when the list is empty (409 `"Your service list isn't empty"`) |
| `PUT/DELETE /api/settings/logo` (`settings/routes.ts:209,226`) | core, admin | Logo upload (raw png/jpeg/webp <=200 KB, PNG <=512 px) |
| `GET /api/settings` | core | unused (settings arrive in `/me`) |
| `GET/POST /api/public/feedback/:token` (`public.ts:182,192`) | `ratings` | Public rating page (M16) |
| `GET /api/public/bill/:token` PDF (`public.ts:122`) | `whatsapp` | none needed (WhatsApp fetches it); could be a "download PDF" link |
| `GET /api/public/services` (`servicesPublic`) | `public_services_api` | none (for the salon's own website); could show the URL in settings |
| Subscription/plan view | - | `/api/me` gives `subscription`, `features`, `limits`, `org.planId/status`; no FM page, no upgrade/billing routes (`/api/billing/` only allow-listed), no plan matrix route, no super-admin routes registered in `index.ts` |
| Staff limit | - | `limits.max_staff` vs active users; 409 `staff_limit` |
| Salon branding settings | core | timezone, currency, locale, phone country, bill prefix, day start hour, `brand_color`, WhatsApp template names, language, image URLs (all required by PUT `/settings`, M7) |
| Campaign sends/limits | `whatsapp_campaigns` | caps (1000 audience, one running, batch 15) |
| `/api/wa/webhook` | - | server only |

---

## 5. Build and serving

### 5.1 How FM deploys the static export today
- `web/next.config.ts:1-20`: production = `output: "export"`, `trailingSlash: true`, `images.unoptimized`; dev = `next dev` with a rewrite `/api/:path*` -> `http://localhost:8787/api/:path*`. Export lands in `web/out` (present: `index.html`, one folder per route: `account/ announcements/ audit/ barbers/ bills/ customers/ expenses/ history/ ledger/ login/ monthly/ r/ rate/ ratings/ sales/ services/ settings/ sheet/`, `404.html`, `_headers`, `_next/`).
- `gents-salon/api/wrangler.jsonc:30-35`: `"assets": { "directory": "../web/out", "binding": "ASSETS", "not_found_handling": "404-page", "run_worker_first": ["/api/*"] }`. FM Worker also falls back in code: `api/src/index.ts:22` `app.all("*", c => c.env.ASSETS.fetch(c.req.raw))`, and `index.ts:9-18` adds `Cache-Control: no-store`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` to API responses.
- `web/public/_headers` (served by assets): `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, nosniff, Referrer-Policy, Permissions-Policy.
- No dynamic routes: the one detail page is `/customers/view/?id=` read from `window.location.search` (`customers/view/page.tsx:27-33`; comment "Static export, so the id is a query param"). Also `sales/page.tsx:26-30` reads `?day=&barber_id=`; `r` and `rate` read `?t=`. Next dynamic segments (`[id]`) are impossible without `generateStaticParams`, because ids are unknown at build; keep query params (links must be `?id=` with trailing slash `/customers/view/?id=`).
- `nav.ts:84-86` strips trailing slashes for active-link matching; `app-shell.tsx:33` treats `/login /r /rate` as public (frameless).

### 5.2 What the SS Worker needs
Current SS state: `salonsync/apps/api/wrangler.jsonc` has NO `assets` block; `Env` (`SS/env.ts:6-26`) has NO `ASSETS` binding; `index.ts:98` `app.notFound` returns JSON `{"error":"Not found"}` for every unknown path including `/` (no static fallback); `tenantApi` guard only runs on matched `/api` handlers (`:44-59`) and unknown `/api/*` paths 404.

Needed (mirroring FM):
1. `wrangler.jsonc`: `"assets": { "directory": "../web/out", "binding": "ASSETS", "not_found_handling": "404-page", "run_worker_first": ["/api/*"] }` (path is relative to `apps/api`). `404-page` is right for a trailing-slash export; `"single-page-application"` fallback is only needed if some route is client-routed without its own `index.html`. With `run_worker_first: ["/api/*"]` the Worker never sees static requests, so no catch-all handler is required; if instead it is omitted, add an `ASSETS.fetch` fallback after the `/api` routes (FM does both).
2. Add `ASSETS: Fetcher` to `Env` and the vitest bindings if a test touches it.
3. `vars.APP_ORIGIN` (`https://salonstation-app.affworld0.workers.dev`) and `ROOT_DOMAIN: ""` today: on workers.dev the org is not in the host, so login needs `org` in the body (M3) and public image routes need `?org=<slug>` (already baked into `avatar_url`/`logo_url`). With `ROOT_DOMAIN` set (`<slug>.salonstation.online`) wrangler needs `routes` for `*.salonstation.online` and `admin.`; none are configured yet.
4. Same-origin: `originGuard` (`pipeline.ts:17-32`) compares `new URL(Origin).host` to `new URL(c.req.url).host` for writes, and rejects `Sec-Fetch-Site` other than `same-origin`/`none`. A dashboard served by the same Worker on the same host passes. The Next dev rewrite is the exception (M22). The marketing site (`salonsync-site`) must not POST cross-origin to `/api/auth/login`; spec uses a one-time token redirect.
5. Security headers: copy `web/public/_headers` into `apps/web/public`; SS `index.ts` has no equivalent of FM `index.ts:9-18` (no-store, nosniff, frame deny on API answers) - not present today.
6. Cookie `Secure` always (M25): local dev must use `wrangler dev` over https or Chrome.
7. Pages that links in SS messages expect (`core/links.ts`): `/r/?t=<token>` and `/rate/?t=<token>`; push paths `/`, `/history/`, `/ratings/`; public review fallback `/rate/?t=`. `firebase-messaging-sw.js` must be served from the origin root (scope), with the SalonStation Firebase config.
8. Free plan note (project memory): Workers free; static assets requests are free and unmetered, but dashboard JS should avoid per-page extra API calls (each authenticated request costs up to 6 D1 statements in `tenantAuth`, `pipeline.ts:35-38`; FM's bell + `/auth/me` + users on every page add up). The notification bell polls only on load/DATA_CHANGED.

### 5.3 Package/workspace
Root `package.json` workspaces `apps/*`, `packages/*`; adding `apps/web` makes `npm test`/`typecheck` run its scripts. FM web depends on `next 16.3.1`, `react 19.2.8`, `@base-ui/react`, `firebase ^13.1.0`, `recharts`, `xlsx` (sheetjs CDN tarball), `sonner`, `date-fns`, `shadcn`, tailwind 4. Spec (`design.md:133`) plans `packages/ui` (shared shadcn + FM tokens).

---

## 6. Tests

FM web tests (plain Node with `--experimental-strip-types`, run via `npm test` `package.json:scripts.test`):
- `src/lib/numpad.test.ts` (34 lines): `applyKey` money/digits rules (digit append, leading zero, one dot, two decimals, 6 whole digits). Currency-agnostic except the 6-digit cap and 2 decimals (currencies with 0 or 3 minor digits differ, `numpad.ts:5`).
- `src/lib/format.test.ts` (12 lines): `businessDay` with the 4:00 AM Dubai (+04:00) boundary (`:5-11`). Must be rewritten against per-org `timezone`/`day_start_hour`.
No component, page, API-client or e2e tests; no test runner/framework in `web/`. SS API tests (`salonsync/apps/api/test/*.test.ts`, vitest + `@cloudflare/vitest-plugin`, e.g. `me.test.ts`, `pipeline.test.ts:24-57`) cover the contract that the web client must match (e.g. `/api/me` shape at `me.test.ts:27-39`, `feature_disabled` JSON at `pipeline.test.ts:28`).
