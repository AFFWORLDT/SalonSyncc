# Mobile Stage 3 (Admin core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (user's choice: inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** An owner or admin can run the day from the phone: dashboard, every sale (add for any barber / any past day, edit,
delete), bills, barber and company expenses, the daily sheet (with Excel), and staff.

**Architecture:** Same as Stage 2: one `FeatureModule` per screen, screens take small data classes over `ApiClient`, widget
tests use `FakeAdapter` and fixtures captured from `wrangler dev` as the owner. No backend change: every call is an
existing web endpoint (list in each task). Admin tabs: Dashboard, Sales, Daily sheet; the rest under More.

**Tech Stack:** Stage 2 stack. One new package: `excel` (pure Dart .xlsx writer) for the daily-sheet export (spec §3.2:
"Excel downloads open the share sheet with the .xlsx file"); `path_provider` comes with share_plus's `XFile` flow.

**Spec:** docs/superpowers/specs/2026-11-04-mobile-app-design.md (§2 Stage 3, §3.2 "Screens: admin", §4 Errors)

## Global Constraints

- Everything in Stage 2's Global Constraints still holds (money in minor units, `me.today`, verbatim web copy, motion, offline).
- Admin = role owner or admin. Admin modules are `roles: {Role.admin}`. A module's `featureKey` is the web nav's.
- Every date picker: `lastDate = me.today`. The server answers future days with "Pick a valid day (not in the future)".
- Profit = sales − expense − commission (expense includes company expenses) — shown, never computed on the phone.
- 409 `stale` → show the server text, reload the list, keep the dialog open. 402 → the web's read-only text, writes hidden.
- Lists of rows use `SkGlass(blur: false)` per row or one glass around the list (Stage 2 review).

## Review Focus

1. An admin adds a sale for another barber on a past day → body carries `barber_id` and `day`; it shows under that barber. (Task 3 `admin picks barber and day`.)
2. Staff at the plan limit → "Add staff" disabled with "{active} of {max} staff on your plan · upgrade your plan to add more"; a 409 `staff_limit` shows "Your plan allows {max} active staff. Upgrade your plan to add more." (Task 7.)
3. Deleting a staff member with sales → server deactivates instead; the phone says "{name} has sales, so they were made inactive (history kept)". (Task 7.)
4. Dashboard without `reports_advanced` → only "1D"; a 2-year custom range is accepted (server caps 731 days) and the series switches to months. (Task 2.)
5. Daily sheet for a month with an inactive barber → the column is still there, dimmed; totals match the server's. (Task 6.)

---

### Task 1: Admin models, fixtures and data layer

**Files:** `lib/models/overview.dart` (`Overview`, `RangeTotals`, `BarberDay`, `SeriesPoint`), `lib/models/staff.dart` (`Staff`),
`lib/models/expense.dart` (`Expense`, `CompanyExpense`), `lib/models/daily_sheet.dart` (`DailySheet`, `SheetRow`, `SheetCell`),
`lib/models/setup.dart` (`SetupState`); `lib/data/admin_reports_api.dart`, `lib/data/staff_api.dart`, `lib/data/expenses_api.dart`;
extend `SalesApi.search` with `barberId`, `payment`; `SaleDraft` with `barberId`, `day`; fixtures from `wrangler dev` as owner
(`overview.json`, `users.json`, `expenses.json`, `company_expenses.json`, `daily.json`, `setup.json`); seed adds a second barber.

Endpoints and shapes (from the web):
- `GET /api/reports/overview?from=&to=` → `{today, from, to, series_by, totals, prev_totals, per_barber[], series[], recent: Sale[]}`;
  totals `{sales, count, commission, expense, profit, company_expense}`; per_barber `{id, name, avatar_url, sales, count, commission, expense, expense_entered}`; series `{key, sales, profit}`.
- `GET /api/settings/setup` → `{logo, services, staff, vat, google_review}` (bools).
- `GET /api/users` → `[{id, name, username, phone, role, commission_pct, sort_order, active, can_add_expense, avatar_url, created_at}]`;
  `POST /api/users` (+password) → 201; `PUT /api/users/:id` (+active, no password); `POST /api/users/:id/reset-password {password}`;
  `DELETE /api/users/:id` → `{ok, deleted:true}` | `{ok, deactivated:true}`.
- `GET /api/expenses?month=&barber_id=` → `[{id, barber_id, barber_name, day, amount, note, updated_at}]`; `PUT /api/expenses {amount, note?, day, barber_id}`.
- `GET /api/company-expenses?month=` → `[{id, day, amount, note, paid_from, created_by, created_by_name, updated_at}]`; `POST`, `PUT /:id`, `DELETE /:id`.
- `GET /api/reports/daily?month=` → `{month, barbers:[{id, name, active, avatar_url}], rows:[{day, cells:{id:{sales, commission, expense, count}}, sales, expense, company_expense, commission, profit}], totals}`.
- [ ] Tests `test/admin_models_test.dart`, `test/admin_data_test.dart`: every fixture parses; request paths / queries / bodies match the web's; `SaleDraft` with `barberId: 5, day: '2026-11-01'` adds `barber_id` and `day`.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): admin models and data layer`.

### Task 2: Dashboard

**Files:** `lib/modules/dashboard/dashboard_module.dart` (admin, tab, order 0 — home becomes barber-only), `dashboard_screen.dart`,
`setup_checklist.dart`, `lib/core/ui/bar_chart.dart` (CustomPaint, no chart package); Test `test/dashboard_test.dart`.
- Header "Dashboard"; subtitle "Today, {date}" / "{date}" / "{from} – {to}" + " · live" when `to` is today.
- Range chips 1D, 7D, 30D, 1Y, Custom (only 1D without `reports_advanced`); preset → `from = today − (days−1)`, `to = today`.
- Tiles: "Sales {word}" (hint "{count} customers · ±x% vs yesterday|previous period"), "Expense {word}" (hint "incl. {x} company";
  "+" opens Add company expense when `expenses` and not read-only), "Commission {word}", "Profit {word}" (red < 0). `{word}` = today / that day / in range.
- "Barbers {word}": Barber, Cust., Sales, Comm., Exp. ("–" when `expense_entered` false); link "Daily sheet →".
- "Latest sales {word}": up to 8 rows (tap → bill); empty "No sales {word}."; link "All sales →".
- Chart when `series.length > 1`: "By day" / "By month", "{sales} sales, {profit} profit".
- Setup checklist "Get your salon ready" / "{done} of {n} done" with the five steps; dismiss stored per salon (prefs `sk.setup.dismissed.{slug}`).
- [ ] Widget tests: tiles + deltas from fixture; only 1D without reports_advanced; preset 7D requests from=today−6; empty "No sales today."; checklist hides when all done or dismissed.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): admin dashboard`.

### Task 3: Admin sale sheet

**Files:** modify `lib/modules/sale/sale_sheet.dart` (admin: step 0 "Who did this customer?" grid of active staff, admins marked ★;
"More (day, note)" with day picker and hint "Change only to enter a missed sale"; edit any sale, any day; title "Edit {bill_no}";
delete confirm "Delete this sale?" / "It will be removed from today's totals."). Bill screen: admins can always Edit.
- [ ] Widget tests: `admin picks barber and day` (body has barber_id + day); no barber chosen → Next disabled; barber sheet unchanged (existing tests stay green); admin edit changes barber.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): admin new and edit sale`.

### Task 4: Sales + Bills

**Files:** `lib/modules/sales/sales_module.dart` (admin, tab, `core_sales`): "Sales", filters day (X → "All days"), barber ("All barbers",
"{name} (inactive)"), payment ("Cash + card" / "Cash" / "Card"); header "{total} sales · {sum}"; empty "No sales match."; paged "Show more".
`lib/modules/bills/` admin flavour: "Bills" / "Every sale makes a bill. Open one to see or print it." rows show barber name; empty "No bills match.".
- [ ] Widget tests: filters build the query (`barber_id`, `payment_mode`, `day`); paging appends; admin bill rows show barber.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): admin sales and bills`.

### Task 5: Expenses

**Files:** `lib/modules/expenses/` (admin, More, `expenses`): tabs "Barbers" / "Company", month picker (no future months), barber filter on Barbers.
Barbers: rows barber · "{day} · note" · amount; empty "No expenses this month."; "Add expense" → "Add expense for" (barber + day) → edit dialog
("Add expense" / "Edit expense", "{barber} · {day} — one entry per day. Enter the total.", "Amount ({CUR})", "What for? (optional)",
"Save expense", "Remove" = amount "0"). Company: rows note · "{day} · Bank|Cash" · amount; empty "No company expenses this month. Add rent, bills or supplies here.";
dialog "Add company expense" / "Edit company expense", "Shop costs like rent, electricity or supplies. They come off the shop profit.",
"Amount", "What for?" (placeholder "e.g. rent, DEWA bill, towels"), "Paid from" Cash/Bank, "Day". Toasts "Expense saved" / "Expense removed".
- [ ] Widget tests: month back queries previous month; existing barber/day entry opens in edit; Remove sends "0"; company add/edit/delete calls; 409 text kept in dialog.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): expenses`.

### Task 6: Daily sheet + Excel

**Files:** `lib/modules/sheet/` (admin, tab, `daily_sheet`): month picker, tiles "Total sale", "Expense" ("incl. X company"), "Total commission",
"Total profit"; switch "Show each barber's expense"; table with sticky Date column (horizontal scroll), per barber Sale / Com. (/ Exp.),
shop Sale / Exp. / Com. / Profit, newest first, today highlighted, inactive barbers dimmed, "Total" row; tapping a date opens Sales for that day.
Footnote verbatim. "Excel" button (with `excel_export`): `lib/core/export/daily_xlsx.dart` builds the web's two sheets
("{MONTH} SALE RECORD", "EXPENSES") and opens the share sheet with "{salon} {Month YYYY}.xlsx".
- [ ] Tests: table cells from fixture; inactive barber dimmed; xlsx builder unit test (sheet names, header row, TOTAL row, skipped empty days).
- [ ] FAIL → implement → PASS. Commit `feat(mobile): daily sheet and Excel`.

### Task 7: Staff

**Files:** `lib/modules/staff/` (admin, More, `core_sales`): "Staff", "Shop default commission: {pct} (change in Settings)",
limit line; groups Owner / Admins / Barbers (active first, then sort_order); card: avatar, name, badges, "@username · {pct}{ (default)} · phone";
menu Edit, Reset password, Make inactive / Make active, Delete (hidden for self and owner). Form "Add barber" / "Edit {name}" with the web's fields,
hints and validation copy; toasts "Saved", "{name} added. Share the username and password with them.", "{name} can sign in again",
"{name} is now inactive", "New password set for {name}. They are signed out everywhere.", delete outcomes.
- [ ] Widget tests: limit disables Add; staff_limit 409 text; delete → deactivated message; reset password calls; owner card has no Delete.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): staff`.

### Task 8: End-to-end + finish

- [ ] `integration_test/admin_flow_test.dart`: owner signs in → dashboard shows → New sale for "Barber Ali" → Sales lists it → Daily sheet shows the amount → add a company expense → Staff lists Barber Ali.
- [ ] Full suites, final whole-branch review, one fix pass, merge to main, push.
