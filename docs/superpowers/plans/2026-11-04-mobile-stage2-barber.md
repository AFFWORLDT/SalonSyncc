# Mobile Stage 2 (Barber app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (user's choice: inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A barber can do on the phone everything the web gives a barber: today's totals and sales, add / edit / delete a bill,
share it (WhatsApp, link), their bills, their day-by-day history with commission, the announcements feed, and change password.

**Architecture:** Native Flutter screens as `FeatureModule`s in `appModules`, calling the existing tenant API (no backend change).
One small data layer per area (`lib/data/*.dart`) wraps `ApiClient`; screens are GetX-free StatefulWidgets that take that data class,
so widget tests inject a `FakeAdapter`-backed client. Money and dates are formatted by one `Fmt` built from the salon's settings.

**Tech Stack:** existing Stage 1 stack. No new packages.

**Spec:** docs/superpowers/specs/2026-11-04-mobile-app-design.md (§2 Stage 2, §3.2 "Screens: barber", §4 Errors)

## Global Constraints

- All money from the API is integer minor units; `settings.currency_minor` (1 / 100 / 1000) sets decimals. Amounts sent to the API are
  major-unit strings ("25.5"), exactly like the web.
- Money text: `"{CUR} {n}"`, no decimals when whole ("AED 25"), else all decimals ("AED 25.50"); grouping per `settings.locale`
  (fallback en-GB).
- The business day comes from `me.today`, never the device clock.
- Copy strings that the web shows are copied verbatim (listed in each task). Server error text is shown as-is.
- Barber modules are `roles: {Role.barber}`; the admin keeps Stage 1's home until Stage 3.
- Motion 150–350 ms, off with reduce-motion (`skDuration`). Skeletons, not spinners, for first load. Pull-to-refresh on every list.
- Offline taps on save show "You're offline"; nothing is queued.
- 402 `subscription_inactive` → the screen shows "Your subscription has ended. Upgrade to add or change sales." and hides New/Edit.

## Review Focus

1. A sale saved with a typed amount in a 3-decimal currency (BHD, minor 1000) → sent as "12.345", shown as "BHD 12.345". (Task 1 `fmt 3 decimals`, Task 5 `amount only body`.)
2. A double tap on "Save bill" → exactly one POST. (Task 5 `double tap saves once`.)
3. Editing a sale someone else changed → the server's 409 text is shown and the sheet stays open with the input kept. (Task 5 `stale keeps input`.)
4. A walk-in label "Customer 7" → WhatsApp text has no name ("Thank you for visiting …"). (Task 6 `walk-in no name`.)
5. A local phone "0501234567" with phone_country 971 → wa.me/971501234567. (Task 6 `local number gets country`.)

---

### Task 1: Formatting + salon settings

**Files:** Create `lib/core/format/fmt.dart`, `lib/models/settings.dart`; Test `test/fmt_test.dart`.

**Interfaces — Produces:**
- `class SalonSettings { currency, currencyMinor, locale, timezone, displayName, phoneCountry, vatEnabled, vatRate, quickAmounts (List<num> major), thankYouText, receiptFooter?, logoUrl?, waReady }` with `SalonSettings.fromJson(Map)`, and `Me.salon` getter.
- `class Fmt { Fmt(SalonSettings s); String money(int minor); String num(int minor); String? toMajorInput(String typed) /* null = invalid */; int? fromInput(String typed); String dayLabel(String ymd) /* "Wed 21 Oct" */; String dateLabel(String ymd) /* "21 Oct 2026" */; String time(int ms) /* HH:mm device local */; String phone(String) /* "050 123 4567" for 05XXXXXXXX */ }`

- [ ] Tests: `money(2500)` AED/100 → "AED 25"; `money(2550)` → "AED 25.50"; `fmt 3 decimals` BHD/1000 `money(12345)` → "BHD 12.345"; JPY/1 `money(1200)` → "JPY 1,200"; `fromInput("25.5")` → 2550; `fromInput("25.555")` (minor 100) → null; `fromInput("0")` → null; `dayLabel("2026-10-21")` → "Wed 21 Oct"; settings parse from `test/fixtures/me_barber.json`.
- [ ] Run `flutter test test/fmt_test.dart` → FAIL (missing) → implement with `intl` `NumberFormat.decimalPattern(locale)` + `minimumFractionDigits` → PASS. Commit `feat(mobile): money and date formatting`.

### Task 2: Models + fixtures from the real API

**Files:** Create `lib/models/sale.dart` (`Sale`, `SaleItem`), `lib/models/service.dart`, `lib/models/report.dart` (`MyReport`, `DayRow`, `Totals`), `lib/models/notice.dart` (`Notice`, `NoticeFeed`), `lib/models/paged.dart` (`Paged<T>`: items,total,page,pageSize,sum); extend `tool/seed_dev_salon.sh` to add services + 2 sales; fixtures `test/fixtures/{sale,sales_page,services,report_me,notifications,customers}.json` captured with curl against `wrangler dev --local` as barber.
- [ ] Test `test/models_stage2_test.dart`: each fixture parses; `Sale.isWalkIn` true for "Customer 3"; a missing field throws `FormatException`.
- [ ] FAIL → implement (`json.dart` helpers) → PASS. Commit `feat(mobile): sale, service, report and notice models`.

### Task 3: Data layer

**Files:** Create `lib/data/sales_api.dart`, `lib/data/report_api.dart`, `lib/data/notices_api.dart`, `lib/data/account_api.dart`; Test `test/data_test.dart`.

**Produces:**
- `SalesApi(ApiClient)`: `today(String day)` → `GET /api/sales?day=&page_size=200`; `search({q, day, pageSize})` → `GET /api/sales`; `create(SaleDraft)` → POST 201; `update(int id, SaleDraft)` → PUT; `delete(int id)`; `services()` → `GET /api/services` (active only); `customers(String q)` → `GET /api/customers?q=&page_size=6` (q empty → `page_size=8`); `saveExpense(String amount, String note)` → `PUT /api/expenses`; `sendWhatsApp(int id)` / `whatsAppStatus(int id)`.
- `SaleDraft { List<DraftLine> lines; String amount; String payment ('cash'|'card'); String? customerName, customerPhone, note; Map<String,Object?> toJson() }` — lines → `items:[{service_id, price, qty}|{name, price, qty}]`, else `amount`.
- `ReportApi.me(String month)` → `GET /api/reports/me?month=`; `NoticesApi.list()` / `markAllRead()`; `AccountApi.changePassword(current, next)`.
- [ ] Tests (FakeAdapter): request paths/queries/bodies match the web's (above); `amount only body` → `{amount:"12.345", payment_mode:"cash", customer_name:null, customer_phone:null, note:null}`; a 400 surfaces `Validation(message)` with the server text.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): barber data layer`.

### Task 4: Today (barber home)

**Files:** Modify `lib/modules/home/home_module.dart` (barber → `BarberToday`, admin → Stage 1 hello); Create `lib/modules/today/today_screen.dart`, `lib/modules/today/sale_row.dart`, `lib/modules/today/expense_card.dart`, `lib/core/ui/skeleton.dart`, `lib/core/ui/states.dart` (`ErrorState(message, onRetry)`, `EmptyState(text)`), `lib/core/ui/count_up.dart`; Test `test/today_test.dart`.
- Shows: "Hi {name} 👋", date; tile "My sales today" (count-up) with "{n} customer(s)"; tile "My commission" (today.commission); tile "Sales − expense" (red if < 0); expense card ("Not added yet — add it before you leave" if can add, else "None — the admin adds expenses"; editable only when `expenses` on and `can_add_expense`); "New sale" button; "Today's sales" list with sum; empty "No sales yet today. Tap “New sale” after each customer."
- [ ] Widget tests: skeleton while loading; data shows tiles + rows; empty text; server error → ErrorState + Retry refetches; expense card hidden-edit when `can_add_expense` false.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): barber today`.

### Task 5: New / edit sale sheet

**Files:** Create `lib/modules/sale/sale_sheet.dart` (two steps: Services → Customer), `service_picker.dart`, `customer_step.dart`, `sale_done.dart`; Test `test/sale_sheet_test.dart`.
- Services: chips by category; tap adds line or qty+1 (max 20); −/+; price override field; "Other item" (name + price); no lines → "Or just the amount ({CUR})" + `quick_amounts` chips. Customer: name, phone with `+{phone_country}` prefix, suggestions (debounce 250 ms, own customers), Cash / Card, "Note on the bill", button "Save bill · {total}". Edit mode prefills from the `Sale` and offers "Delete bill" (confirm dialog). Done view: "Congrats! Bill generated" + bill summary + Share link / WhatsApp + "Done" / "New sale".
- [ ] Widget tests: tap a service twice → qty 2, total updates; `amount only body`; `double tap saves once`; `stale keeps input` (409 text shown, sheet open); 400 text shown; delete confirms then DELETE; offline save → "You're offline".
- [ ] FAIL → implement → PASS. Commit `feat(mobile): new and edit sale`.

### Task 6: Bill view + sharing

**Files:** Create `lib/modules/sale/bill_view.dart`, `lib/core/share/bill_share.dart`; Test `test/bill_share_test.dart`.
- `receiptUrl(slug, token)` = `https://{slug}.salonkit.online/r/?t={encoded}` (dev host: same as `salonBase`).
- `thankYouText(settings, sale, fmt, url)`: template `thank_you_text` or `Thank you {name} for visiting {salon}! Your bill: {amount}. {link}`; `{name}` empty when `^Customer \d+$`; collapse `\s{2,}`, drop space before `,.!?`, trim.
- `waLink(phone, phoneCountry, text)`: digits without "+"; leading 0 → country + rest; no phone → `https://wa.me/?text=` with `"{display_name} bill {bill_no} · {money}\n{url}"`.
- Share link: `share_plus` with `Bill {bill_no} — {display_name}` / `{title} · {money}\n{url}`. Cloud WhatsApp button only when `whatsapp` on and `settings.wa_ready` and phone: POST, then one status re-check after 3.5 s ("Sent" / "Queued" / server error).
- Bill view: header (logo, name, address), No / Date / Barber / Client / Mode, lines (Service · Qty · Amount), Total (incl. VAT), Taxable amount, VAT r% (only when vat_rate > 0), footer.
- [ ] Unit tests: `walk-in no name`; `local number gets country`; named template fills all tokens; no-phone text. Widget: VAT rows hidden at 0%.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): bill view and sharing`.

### Task 7: My bills + My history

**Files:** Create `lib/modules/bills/bills_module.dart` (tab, "My bills", search + day filter, "Show more" paging by 50), `lib/modules/history/history_module.dart` (tab, "My history", month picker ‹ ›, tiles Sales (count) / My commission / Expense / Sales − expense, day rows, footer "All amounts in {CUR}"); Test `test/bills_history_test.dart`.
- Bills: today's bills editable (opens sale sheet in edit), older view-only (bill view). Empty: "No bills found".
- [ ] Widget tests: search debounces 250 ms then one GET with `q`; "Show more" requests page_size 100; history month back requests previous `YYYY-MM`; day row shows "–" for 0 expense.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): my bills and history`.

### Task 8: Announcements

**Files:** Create `lib/modules/announcements/announcements_module.dart` (featureKey `push`, barber, under More; list title/body/time, unread dot; opening the screen marks all read), unread badge on the More tab (`FeatureModule.badge: ValueListenable<int>?`, shown by the shell); refresh unread on launch/resume and on any push; Test `test/announcements_test.dart`.
- Empty: "No announcements yet".
- [ ] Widget tests: list renders unread dot; open → POST /api/notifications/read; badge count shown on More; module hidden when `push` off.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): announcements feed`.

### Task 9: Account — change password

**Files:** Modify `lib/modules/account/account_module.dart` (header with avatar/name/@username/role, "Change password" row → sheet: current, new, confirm); Test `test/account_test.dart`.
- Client checks: new ≥ 6 chars ("New password must be at least 6 characters"), confirm matches ("Passwords don't match"). Success: "Password changed" snackbar.
- [ ] Widget tests: short → message, no call; server "Current password is wrong" shown; success closes sheet.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): change password`.

### Task 10: End-to-end + release prep

- [ ] Extend `integration_test/sign_in_test.dart` (or add `barber_flow_test.dart`): barber signs in → New sale → pick a service → Cash → Save → "Congrats! Bill generated" → Done → the sale is in Today's list and My bills. Run on iOS simulator against `wrangler dev --local` + seed.
- [ ] Full suites: `flutter test`, `flutter analyze`, (no API change → API suite once for safety).
- [ ] Commit `test(mobile): barber flow end-to-end`. Final whole-branch review, fix pass, merge to main, push.
- Store builds (TestFlight / Play internal) wait for the Firebase files from the user.
