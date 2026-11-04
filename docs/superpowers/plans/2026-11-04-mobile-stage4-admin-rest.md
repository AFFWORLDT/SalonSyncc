# Mobile Stage 4 (Admin, everything else) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (user's choice: inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** The rest of the web admin on the phone: Monthly, Ledger, Ratings, Audit log, Services, Customers, Announcements (send),
Settings, Plan. After this an owner never needs the web panel (AI connect stays web-only, spec §2).

**Architecture:** Stage 3's pattern: one `FeatureModule` per screen (admin, under More), data classes over `ApiClient`,
widget tests with `FakeAdapter` + fixtures captured from `wrangler dev` as the owner, no backend change. Screens render with the
app theme in tests (`themed_layout_test`), and repeated cards use `SkGlass(blur: false)`.

**Tech Stack:** Stage 3 stack. One new package: `image_picker` for the salon logo (spec: admins get everything the web has;
resized on pick with `maxWidth/maxHeight 512` + `imageQuality` so the upload stays ≤ 200 KB as the API requires).

**Spec:** docs/superpowers/specs/2026-11-04-mobile-app-design.md (§2 Stage 4, §3.2 "Screens: admin")

## Global Constraints

- Stage 2 / 3 Global Constraints hold (money minor units, `me.today`, verbatim web copy, 402 read-only, 409 stale keeps the dialog).
- Never run `dart format` (it reflows to 80 columns; the project uses long lines).
- A module whose feature is off is hidden (registry); the server still answers 403 `feature_disabled`.
- Every write button is hidden or disabled when `me.readOnly`, except Plan (billing stays allowed when lapsed).
- Stripe checkout / portal open the returned `url` in the external browser; on return (app resume) `/api/me` is re-read.

## Review Focus

1. Ledger "Set balances" with 0 or a negative cash amount → accepted (server allows 0 and negatives); "Move money" with the same account twice → server text "Pick two different accounts" shown.
2. Settings save sends every settings key (full replace, `SETTINGS_INPUT_KEYS`) — a field the phone doesn't show must be sent back unchanged, never dropped or nulled.
3. Audit search hides and omits the From/To dates while a search is typed; "Show more" pages instead of growing past 200.
4. Services "Hide from new sales" sends the full service with price in major units (3-decimal currency: "12.345").
5. Plan: a non-owner admin never sees "Stay on Free"; an owner on a paid card plan gets the server's 409 text.

---

### Task 1: Models, fixtures and data layer

**Files:** `lib/models/{monthly,ledger,ratings,audit,customer,announcement,billing}.dart`; `lib/data/{monthly_api,ledger_api,ratings_api,audit_api,services_admin_api,customers_api,announcements_api,settings_api,billing_api}.dart`; fixtures from `wrangler dev` as owner (seed adds a transfer, a payout, a rating if possible, an announcement).
Endpoints (shapes in packages/contract/src/index.ts):
- `GET /api/reports/monthly?year=` → `{year, barbers[{id,name,active,avatar_url}], months[{month, cells{id:{sales,count,commission,expense}}, totals{sales,count,commission,expense,profit,company_expense}}]}`.
- Ledger: `GET/PUT /api/ledger/balances` `{cash, bank, barbers}`; `GET /api/ledger/shop?from=&to=&account=` → `{from,to,account,opening{cash,bank},closing{cash,bank},lines[LedgerLine]}`; `GET /api/ledger/barbers`; `GET /api/ledger/barbers/:id?from=&to=` → `{barber, from, to, opening, lines}`; transfers `GET ?month= / POST / PUT /:id / DELETE /:id` `{amount, from_account, to_account, day?, note?}`; payouts same with `{barber_id, amount, paid_from, day?, note?}`.
- `GET /api/ratings?from=&to=` → `{from,to,count,average,barbers[],ratings[],google{asked,clicked,barbers[]}}`.
- `GET /api/audit?entity=&actor_id=&from=&to=&q=&page=&page_size=` → `Paged<AuditEntry{id,at,actor_id,actor_name,entity,entity_id,ref,action,before,after,changed[]}>`.
- Services: `GET /api/services?all=1`, `POST`, `PUT /:id`, `DELETE /:id`, `POST /api/services/starter`; body `{category, name, description?, price (major), sort_order?, active?}`.
- Customers: `GET /api/customers?q=&page=&page_size=` → `Paged<{id,name,phone,visits,spent,last_visit_at,wa_opt_out}>`; `GET /api/customers/:id` → + `{first_visit_at, avg_bill, cash_visits, card_visits, barbers[{id,name,visits}], services[{name,qty}]}`; `PUT /api/customers/:id/whatsapp {opt_out}`; `GET /api/sales?customer_id=`.
- Announcements: `GET /api/announcements` → `[{id,sender_name,audience,target_id,target_name,title,body,recipients,created_at}]`; `POST {title, body, audience:"all"|"barber", barber_id?}`.
- Settings: `GET /api/settings`, `PUT /api/settings` (all keys), `PUT/DELETE /api/settings/logo` (raw bytes, Content-Type), `GET/PUT/DELETE /api/whatsapp/config`, `POST /api/wa/reminders/run`, `POST /api/wa/feedback/run`.
- Billing: `GET /api/billing` → `{enabled, provider, stripe_status, current_period_end, cancel_at, can_manage, plans[{id,name,price_monthly,currency,can_checkout}]}`; `POST /api/billing/checkout {plan_id}` / `portal` → `{url}`; `POST /api/billing/free`.
- [ ] Tests `test/stage4_models_test.dart`, `test/stage4_data_test.dart`: fixtures parse; paths / queries / bodies match the web's; settings PUT round-trips every key it was given.
- [ ] FAIL → implement → PASS. Commit `feat(mobile): stage 4 models and data layer`.

### Task 2: Monthly (+ Excel)
`lib/modules/monthly/` (admin, More, `reports_advanced`). "Monthly", year ‹ › (next off at this year), "Excel" (with `excel_export`; failure "Couldn't create the Excel file"), tiles "Sales {year}" / "Expense" ("incl. {money} company") / "Commission" / "Profit"; "Per barber, {year}" (Barber | Cust. | Sales | Comm. | Exp. | Net, 0 → "–", inactive greyed); "Month by month" (month → Daily sheet for that month; per-barber sales, Sale | Exp. | Com. | Profit); empty "No records in {year}."; footer "All amounts in {CUR}. Barber columns show sales.". Excel = web `exportMonthly` ("{year} SUMMARY", file "{salon} {year} summary.xlsx").
- [ ] Widget + xlsx unit tests. Commit `feat(mobile): monthly`.

### Task 3: Ledger
`lib/modules/ledger/` (admin, More, `ledger`). "Ledger" / "Every money movement, in order. Nothing here is ever rewritten."; tabs "Shop" | "Barbers".
Shop: tiles "Cash drawer" ("Should be in the drawer now"), "Bank" ("Card payments and deposits"), "Total"; "Move money", "Set balances", "Excel"; From/To + "Cash + Bank" | "Cash drawer" | "Bank"; "Opening balance", lines (memo, struck when reversed, "{day} · {time} · Bank|Cash · {actor}", signed amount, running balance), "Closing balance", empty "No money moved in these days.", footer verbatim; tapping a transfer line opens it (not found "This money move was removed").
Barbers: "Owed to barbers" ("Commission earned minus payouts"), "Pay barber"; Barber | Earned | Paid | Owed; footer verbatim; statement with "Pay {name}", "Earned" / "Paid" / "Owed now", "Owed on {from}", empty "Nothing in these days.", payout lines open the payout.
Dialogs (copy verbatim from the web): Move money / Edit money move, Set balances, Pay barber / Edit payout; toasts "Money moved", "Money move removed", "Balances set", "Payout saved", "Payout removed". Excel = web `exportShopLedger`.
- [ ] Widget tests: balances tiles; account filter query; transfer same-account server error kept in dialog; set balances accepts 0; payout create body; statement opening line. Commit `feat(mobile): ledger`.

### Task 4: Services
`lib/modules/services/` (admin, More, `core_sales`). "Services" / "What barbers pick on a new sale, and what prints on the bill."; empty "No services yet" + "Add starter price list" (toast "Starter price list added. Edit the prices to match your salon."); cards per group with "+ Add"; row menu Edit / "Hide from new sales" | "Show again" / Delete (confirm text verbatim, toast "{name} deleted. Old bills keep it."); form "Add service" / "Edit {name}" with Group (suggestions), Name, Short description, Price, Order; toasts "{name} added" / "Service saved".
- [ ] Widget tests incl. Review Focus 4. Commit `feat(mobile): services`.

### Task 5: Customers
`lib/modules/customers/` (admin, More, `customers_crm`). List ("Customers", subtitle verbatim, search, "{total} customers", rows, "No match." / "No customers yet.", Show more) and profile (tiles Visits / Total spent / Average bill / Last visit, Barbers + Favourite services chips, WhatsApp opt-out card when `whatsapp` and a phone, "Visit history" with SaleRows, "No visits yet.").
- [ ] Widget tests. Commit `feat(mobile): customers`.

### Task 6: Announcements (send)
`lib/modules/announcements/send_screen.dart` (admin, More, `announcements`): "New announcement" / "A push notification to your team’s devices.", "Everyone" | "One barber" (active barber chips), Title (80), Message (500), "Send to everyone" / "Send", toast "Sent to {everyone|name} · {n} person/people"; history "Sent" with badge, "{dateTime} · {n} people · by {sender}"; empty "No announcements yet" / "Your sent messages will show here.".
- [ ] Widget tests. Commit `feat(mobile): send announcements`.

### Task 7: Ratings + Audit log
`lib/modules/ratings/` (admin, More, `ratings`): From/To; Google card ("{clicked} of {asked} customer(s) tapped “Rate your visit” ({pct})" + note), "Google taps by barber"; when count > 0 average card, "By barber", "Latest" with "All ratings" | "1-3 stars" | "With a comment".
`lib/modules/audit/` (admin, More, `audit_log`): "Audit log" + subtitle, search (hides dates), From/To (today), Type and Person menus, "{total} change(s)", rows "{actor} {summary} {ref}", empty "No changes for this filter.", paged Show more; detail sheet with old → new per changed field (labels as the web's LABELS map for the common keys).
- [ ] Widget tests incl. Review Focus 3. Commit `feat(mobile): ratings and audit log`.

### Task 8: Settings
`lib/modules/settings/` (admin, More, no gate): sections Billing, WhatsApp Business (with `whatsapp`: connect form, switches, reminder/rating timings, "Send due … now", templates under "Message templates (advanced)"), Reviews, WhatsApp thank-you (+ live preview), Notifications (with `push`), Region, Salon details (+ logo upload / remove via image_picker). One "Save settings" → PUT with every key (Review Focus 2) → refresh /api/me → "Settings saved". Server errors shown as-is.
- [ ] Widget tests: unchanged keys round-trip; VAT on shows VAT % and TRN/Tax no. by country; thank-you preview fills tokens; WhatsApp section hidden without the feature. Commit `feat(mobile): settings`.

### Task 9: Plan
`lib/modules/plan/` (admin, More): "Plan", "You're on {Plan}{ · banner}", billing card + "Manage billing", "Included in your plan" (✓ / lock per feature), plan cards ("Current" / "Your trial", price or "Free", "Choose {name}", owner-only "Stay on Free" with confirm verbatim), billing-off text with the support email; checkout / portal open the browser; resume re-reads /api/me.
- [ ] Widget tests incl. Review Focus 5. Commit `feat(mobile): plan`.

### Task 10: End-to-end + finish
- [ ] `integration_test/admin_more_test.dart` (owner): Services add → Monthly shows the month → Ledger move money → Settings change the receipt footer and save → Plan shows the current plan.
- [ ] Full suites, both existing e2e flows (iOS, and Android when the emulator is up), final review, one fix pass, merge, push.
