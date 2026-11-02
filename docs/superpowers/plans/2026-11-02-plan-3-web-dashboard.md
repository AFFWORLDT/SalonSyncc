# Plan 3: Salon Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port FM Salon's web app into `apps/web` as the SalonStation salon dashboard. Its menus, pages and actions follow each salon's features, role and subscription, and per-salon settings replace everything FM hardcodes.

**Architecture:**
- **Copy, then adapt.** Copy the FM web code (`/Users/laxmikant/Desktop/ERP/gents-salon/web/src`, Next 16 static export, shadcn/base-ui, Tailwind 4) and change only what SalonStation needs. Keep FM's look, components and behaviour.
- **One source for salon data.** `GET /api/me` is the single source of user, org, settings, features, limits and subscription. A typed session context feeds:
  - the navigation
  - `<FeatureGate>`
  - the subscription banner
  - formatting (currency, minor digits, locale, time zone, day start, phone country)
- **Same origin.** The API Worker serves the static export from the same origin through Workers static assets.

**Tech Stack:** Next 16.3.1 (`output: "export"`), React 19.2, Tailwind 4, `@base-ui/react`, sonner, recharts, firebase 13 (web push), xlsx (SheetJS tarball, as in FM), vitest with jsdom and @testing-library/react for web tests, Playwright for one end-to-end smoke test, and `@ss/contract` for types.

**Spec:** `docs/superpowers/specs/2026-11-02-salonsync-saas-design.md`, mainly §3 (layout), §7.2–7.3 (features, `/api/me`, FeatureGate, banner) and §8 (per-salon settings).
**Research (read before each task):** `docs/superpowers/research/2026-11-02-web-port-inventory.md`. Mismatch ids M1–M26 below refer to its §1.3.

## Global Constraints

- **Where the code goes:**
  - All web code lives in `apps/web`, workspace name `@ss/web`.
  - Root `npm test` and `npm run typecheck` must run its tests and typecheck.
  - `packages/ui` stays deferred to Plan 4. Ruling: no second consumer exists yet.
- **Static export only:**
  - `output: "export"`, `trailingSlash: true`.
  - No dynamic segments. Ids go in query params (`/customers/view/?id=`).
  - Push links depend on these paths existing: `/`, `/history/`, `/ratings/`, `/r/?t=`, `/rate/?t=`.
- **Types:**
  - Import API types from `@ss/contract`. Do not hand-copy `types.ts`.
  - If the web needs a type the contract lacks, add it to the contract.
- **Nothing hardcoded per salon or brand:**
  - No `AED`, `Asia/Dubai`, `en-AE`, `971`/`+971` defaults, `FM`/`FM Salon`/`Faizan`, hardcoded `/100` money maths, or `DAY_START_HOUR = 4` in `apps/web/src`.
  - These values come from:
    - `/api/me` `settings`: `currency`, `currency_minor`, `locale`, `timezone`, `day_start_hour`, `phone_country`, `display_name`, `logo_url`, `brand_color`.
    - The brand name from `NEXT_PUBLIC_BRAND_NAME`, default `"SalonStation"`.
  - A guard test (Task 2) enforces this.
- **Roles:**
  - `isAdmin = role === "owner" || role === "admin"` everywhere (M4).
  - The owner row on the staff page is read-only for role, active and username.
- **Features:**
  - Never call a feature-gated route unless `features.includes(key)` for its key. The mapping is in inventory §3.2.
  - A locked page renders the Upgrade card. It never shows an error state or a 404.
- **Errors:**
  - `ApiError` carries `status`, `message` and `code`.
  - Handle these globally:
    - `402 subscription_inactive`: refresh `/me`, then show the read-only state.
    - `403 feature_disabled`: refresh `/me`, then show the Upgrade card.
    - `401 wrong_org`: clear the cache, then go to `/login/`.
  - Handle these locally:
    - `409 stale`: toast "Changed by someone else", reload the row's data and keep the dialog open.
    - `staff_limit`, `campaign_running`, `wa_not_ready`.
- **Free plan:**
  - Exactly one `/api/me` per page load, cached in session context.
  - No polling.
  - The notification bell fetches on load and on the `ss:data-changed` event only.
- **Storage:** localStorage and event keys use the `ss_` / `ss:` prefix. The session cache key includes the org slug: `ss_session_cache:<slug>`.
- **Login:** POST `/api/auth/login` `{org, username, password}`.
  - The salon ID field is shown when the host is not a tenant subdomain, meaning `NEXT_PUBLIC_ROOT_DOMAIN` is empty or the host doesn't end with it.
  - Remember the last salon ID in `ss_last_org`.
- **Passwords:** minimum 6 characters (M21).
- **VAT** is a percent everywhere (5 = 5%) (M6).
- **Money:**
  - Major ↔ minor conversion uses `10 ** currency_minor`.
  - Number pad decimals = `currency_minor`.
  - The whole-digits cap stays at 6.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Accounts:**
  - Never open or print `gents-salon/fmcreds/`, `apps/api/.dev.vars` or the `*.sql` backups.
  - Wrangler only with `XDG_CONFIG_HOME=/Users/laxmikant/.wrangler-affworld`, and only with `--local`. No deploys.

## Review Focus

1. **The salon owner signs in.** They must get the admin navigation and admin pages everywhere, not barber views. Test it in Task 4 (nav) and in the Task 13 smoke test.
2. **A salon with a 3-decimal currency (KWD) or a 0-decimal currency (JPY).** Amounts must format, enter on the number pad and save correctly. Test it in Task 3 (format and numpad) and Task 5 (sale sheet totals).
3. **A salon in `Asia/Kolkata` with `day_start_hour = 6` at 05:30 local time.** "Today" defaults must match the API's business day, and sale-day defaults must equal `/me.today`. Test it in Task 3 and Task 5.
4. **An expired salon.** It sees the full-screen Upgrade state. Reads, exports and logout still work, and a 402 never leaves a dialog spinning. Test it in Task 4 and Task 13.
5. **A super admin switches a feature off while the owner is using it.** The next call returns 403 `feature_disabled`, `/me` refreshes, the menu item disappears and the page shows the Upgrade card. Test it in Task 4.

---

### Task 1: API prep for the dashboard

**Files:**
- Modify:
  - `apps/api/src/platform/me.ts`
  - `packages/contract/src/index.ts` (`MeUser`)
  - `apps/api/src/data/tenant/users.ts` (avatar v, toUser)
  - `apps/api/src/tenant/sales/routes.ts` (PUT FK → 400)
  - `apps/api/src/core/pipeline.ts` (dev origins)
  - `apps/api/src/index.ts` (security headers)
  - `apps/api/src/env.ts`
  - `apps/api/wrangler.jsonc`
- Test: `apps/api/test/me.test.ts`, `staff.test.ts`, `sales-edit.test.ts`, `pipeline.test.ts`, `health.test.ts`

**Interfaces:**
- Produces:
  - `MeUser = {id, name, username, role, commission_pct, avatar_url: string|null, can_add_expense: boolean}` (M2).
  - `Env.ASSETS?: Fetcher`.
  - `Env.DEV_ALLOWED_ORIGINS?: string`.

- [ ] **Step 1: Write the failing tests.**
  - `/api/me` returns `commission_pct`, `avatar_url` and `can_add_expense` for a barber and for the owner.
  - After clear-then-upload, a new avatar upload gets a new `avatar_url`. `avatar_v` only increases, and `has_avatar` follows `avatar IS NOT NULL` (followups "Plan 3 start").
  - `toUser` for an inactive user returns `avatar_url: null`.
  - PUT `/api/sales/:id` with a service deleted mid-request returns 400 "One of the services no longer exists".
  - With `DEV_ALLOWED_ORIGINS="http://localhost:3000"`, a write whose Origin is `http://localhost:3000` passes originGuard. The same request without the var gets 403 `bad_origin`. With the var set, other origins still get 403.
  - Every `/api/*` response carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`.
- [ ] **Step 2: Run them and see them fail.** Run `npm test -w @ss/api`.
- [ ] **Step 3: Implement.**
  - `DEV_ALLOWED_ORIGINS` is a comma-separated list read only from env; it is never set in `wrangler.jsonc` vars. Document it as local-only in README.
  - Add the `wrangler.jsonc` assets block: `"assets": {"directory": "../web/out", "binding": "ASSETS", "not_found_handling": "404-page", "run_worker_first": ["/api/*"]}`.
- [ ] **Step 4: Run `npm test` and `npm run typecheck` from the repo root.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): dashboard prep — richer /me user, avatar versioning, dev origins, api headers`.

### Task 2: Scaffold `apps/web`

**Files:**
- Create `apps/web/`:
  - Copy from FM: `package.json` (name `@ss/web`), `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `components.json`, `eslint.config.mjs`.
  - Copy FM's `src/components/ui/*`, `src/components/theme/*` and `src/app/globals.css` verbatim.
  - Copy `public/_headers` from FM.
  - Write a new neutral `public/manifest.webmanifest` (brand name, no FM text).
  - Placeholder `src/app/page.tsx`, `src/app/layout.tsx`.
  - Add `vitest.config.ts` and `test/setup.ts`.
- Test: `apps/web/test/brand-guard.test.ts`

**Interfaces:**
- Produces:
  - npm scripts `dev`, `build` (`next build` → `out/`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`).
  - `src/lib/brand.ts`: `BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "SalonStation"`, `ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || ""`.
  - Dev rewrite: `/api/:path*` → `http://localhost:8787/api/:path*`. Works because Task 1 added `DEV_ALLOWED_ORIGINS`.

- [ ] **Step 1: Write the failing guard test `brand-guard.test.ts`.** It scans every file under `apps/web/src` and fails on these patterns: `/\bAED\b/`, `Asia\/Dubai`, `en-AE`, `FM Salon`, `\bFM\b`, `Faizan`, `"971"`, `\+971`, `DAY_START_HOUR`, `fm_`, `fm:`.
  - Allow-list: only `src/lib/phone-countries.ts`, which may contain country data including 971.
  - Assert the scan covers more than 0 files.
- [ ] **Step 2:** Build the scaffold. `npm run build -w @ss/web` produces `apps/web/out/index.html`.
- [ ] **Step 3:** Run `npm test` and `npm run typecheck` from the repo root. Expected: PASS, with the web suite included.
- [ ] **Step 4: Commit** `feat(web): scaffold dashboard app with FM ui kit and brand guard`.

### Task 3: Core libraries — api client, session, formatting

**Files:**
- Create or port from FM `src/lib` and `src/hooks`:
  - `api.ts`
  - `session.tsx` (replaces `auth-context.tsx`)
  - `use-api.ts`
  - `format.ts`
  - `numpad.ts`
  - `phone.ts`
  - `phone-countries.ts`
  - `haptics.ts`, `keyboard.ts`, `utils.ts` (verbatim)
- Test: `apps/web/test/format.test.ts`, `numpad.test.ts`, `phone.test.ts`, `api.test.ts`, `session.test.tsx`

**Interfaces:**
- Produces:
  - `api<T>(path, init?)`
  - `class ApiError {status; message; code?: string}`
  - `onApiEvent(kind: "subscription_inactive"|"feature_disabled"|"signed_out", fn)`
  - `useSession(): {me: MeResponse|null, loading, isAdmin, has(feature: FeatureKey): boolean, refresh(), login(org|undefined, username, password), logout()}`
  - `useApi<T>(path|null)` (as FM; cache cleared on logout and on org change)
  - `fmt` built from settings:
    - `money(minor)`: currency code plus amount, `Intl` with `settings.locale`, `currency_minor` digits
    - `toInput(minor)`, `fromInput(str) → minor`
    - `day/time/dateTime` labels in `settings.timezone`
    - `businessDay(at)` with `day_start_hour`
  - `useFmt()`
  - `phoneLabel(canonical, phone_country)`
  - `splitPhone(canonical, phone_country)`
  - `whatsappDigits(canonical, phone_country)`
  - `applyKey(value, key, minorDigits)`

- [ ] **Step 1: Write the failing tests.**
  - `money(123450)` in AED/2/en-AE gives `AED 1,234.50`.
  - KWD with 3 decimals: `money(1234500)` gives `KWD 1,234.500`, and `fromInput("1.5")` gives `1500`.
  - JPY with 0 decimals: `money(1500)` gives `JPY 1,500`.
  - `businessDay` for Asia/Kolkata with `day_start_hour` 6: 05:30 IST is the previous day and 06:00 is the same day. A DST zone (America/New_York) is correct across spring-forward.
  - `applyKey` with 3 decimals allows 3 fraction digits; with 0 decimals it rejects ".". All the old FM numpad cases still pass for 2 decimals.
  - `splitPhone("+919812345678","91")` gives `{cc:"91", national:"9812345678"}`. UAE local `05…` maps to cc `971` only when `phone_country === "971"`.
  - `ApiError` keeps `code`.
  - A 402 emits `subscription_inactive`. A 403 with `feature_disabled` emits `feature_disabled`.
  - A 401 `wrong_org` clears `ss_session_cache:*` and redirects to `/login/`. A 401 on `/login/` does not redirect.
  - The session calls `/api/me` exactly once on mount, and `has()` reflects `features`.
- [ ] **Steps 2–4:** RED, then implement (port FM logic, parametrised), then GREEN with `npm test`.
- [ ] **Step 5: Commit** `feat(web): api client, session and per-salon formatting`.

### Task 4: Shell, navigation, gating, subscription states, login, account

**Files:**
- Port from FM:
  - `components/admin/*`: `app-shell`, `app-sidebar`, `bottom-bar`, `top-bar`, `nav.ts`, `page-header`, `states`, `stat-card`, `status-badge`, `confirm-dialog`, `relative-time`, `chart-card`
  - `components/logo.tsx`
  - `app/layout.tsx`, `app/login/page.tsx`, `app/account/page.tsx`
- Create:
  - `components/app/feature-gate.tsx`
  - `components/app/upgrade-card.tsx`
  - `components/app/subscription-banner.tsx`
  - `components/app/expired-screen.tsx`
  - `app/plan/page.tsx`
- Test: `apps/web/test/nav.test.ts`, `gating.test.tsx`, `subscription.test.tsx`, `login.test.tsx`

**Interfaces:**
- Produces:
  - `NavItem = {href, label, icon, feature?: FeatureKey, roles: ("owner"|"admin"|"barber")[]}`
  - `navFor(me): NavItem[]`, using the inventory §3.2 table. Ratings is admin-only, which fixes FM.
  - `<FeatureGate feature>`: renders children, or `<UpgradeCard feature>` with the feature label, the plan that includes it, and "Contact us to upgrade" (`mailto:` from `NEXT_PUBLIC_SUPPORT_EMAIL`, or text).
  - `<SubscriptionBanner>`:
    - trial: "N days left in your trial"
    - grace / past_due: red "Your trial ended — upgrade within N days to keep your data"
  - `<ExpiredScreen>`: shown when `org.status === "expired"`. It allows navigating read-only pages and logout. Write buttons are disabled through `useSession().readOnly`.
  - Branding:
    - `document.title = "<page> · <display_name>"`
    - sidebar name and logo from settings, falling back to the brand mark
    - accent defaults to `settings.brand_color`

- [ ] **Step 1: Write the failing tests.**
  - The owner gets the admin nav.
  - The barber gets the barber nav.
  - A free org has no Ledger, Customers, Ratings, Audit or Announcements. A trial org has everything except WhatsApp campaigns.
  - The FeatureGate shows the upgrade card when the feature is missing.
  - A `feature_disabled` event triggers `refresh()`, and the nav item disappears.
  - The banner text is right for trial (3 days left), grace and active (none).
  - An expired org shows the ExpiredScreen. `readOnly` is true, and write buttons on a sample page are disabled.
  - Login shows the salon ID field when `ROOT_DOMAIN` is empty, and posts `{org, username, password}`. It hides the field on `x.salonstation.online` when `ROOT_DOMAIN = "salonstation.online"`.
  - The account page rejects a 5-character password client-side.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(web): app shell, feature-gated nav, subscription states, login`.

### Task 5: Sales flow — sale sheet, bill, sales, bills, history, today, dashboard

**Files:**
- Port from FM:
  - `components/app/`: `sale-sheet`, `service-picker`, `customer-suggest`, `customer-picker`, `phone-field`, `num-pad`, `money-tile`, `bill`, `sale-row`, `barber-grid`, `barber-today`, `admin-dashboard`, `company-expenses` (the dashboard dialog only), `date-input`, `field`, `simple-select`, `user-avatar`, `pull-to-refresh`, `whatsapp-icon`
  - `app/page.tsx`, `app/sales/page.tsx`, `app/bills/page.tsx`, `app/history/page.tsx`
- Test: `apps/web/test/sale-sheet.test.tsx`, `bill.test.tsx`

**Interfaces:**
- Consumes Task 3 `useFmt` and `useSession`.
- Changes:
  - VAT is a percent (M6a).
  - The `whatsapp_mode` wa.me link is removed (M8).
  - The bill dialog's WhatsApp send shows only with `has("whatsapp") && settings.wa_ready`. History shows only with `has("audit_log")`.
  - Bill header uses `display_name`, logo, TRN label only when `phone_country === "971"`, and the currency.
  - The sale day default comes from `me.today`.
  - Stale 409 on edit or delete: toast, reload, keep the dialog open.
  - The barber expense button needs `has("expenses") && me.user.can_add_expense`.

- [ ] **Step 1: Write the failing tests.**
  - Sale-sheet totals with VAT 5% on 100.00 show 5.00 VAT. The same with KWD shows 3 decimals.
  - The default day equals `me.today`, even when the device clock is on a different day.
  - The bill shows no WhatsApp button without the `whatsapp` feature.
  - The bill shows "VAT 5%", not "500%".
  - An edit that gets a 409 stale toasts and refetches.
- [ ] **Steps 2–4:** RED, implement, GREEN. `npm run build -w @ss/web` must also pass.
- [ ] **Step 5: Commit** `feat(web): sales flow on per-salon settings`.

### Task 6: Staff and services

**Files:**
- Port from FM: `app/barbers/page.tsx`, `app/services/page.tsx`, `components/app/avatar-picker.tsx`
- Test: `apps/web/test/staff.test.tsx`, `services.test.tsx`

**Interfaces:**
- The owner row is locked (no role, active or username controls).
- "Add staff" is disabled, with a hint, when the active staff count is at or above `limits.max_staff`. A 409 `staff_limit` shows the same hint.
- The 409 text "Username is taken" passes through.
- An empty service list offers "Add starter price list" (POST `/api/services/starter`).
- Prices are entered in major units and sent as the API expects. Check `services/routes.ts`.

- [ ] **Step 1: Write the failing tests.**
  - The owner row has no deactivate control.
  - A free org with 2 active staff and `max_staff` 2 has the add button disabled.
  - A `staff_limit` 409 shows the hint.
  - The starter button appears only when the list is empty.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(web): staff and services pages`.

### Task 7: Expenses and ledger

**Files:**
- Port from FM:
  - `app/expenses/page.tsx`, `app/ledger/page.tsx`
  - `components/app/`: `expense-dialog`, `company-expenses`, `ledger-shop`, `ledger-barbers`, `ledger-dialogs`, `month-picker`
- Test: `apps/web/test/ledger.test.tsx`

**Interfaces:**
- The expenses page requires `expenses`; ledger, payouts and transfers require `ledger`.
- Every write handles 409 `stale` (reload and keep the dialog open) and 402 (global).
- No "AED" labels; use the currency code.

- [ ] **Step 1: Write the failing tests.**
  - The ledger page without `ledger` renders the UpgradeCard and makes 0 `/api/ledger` calls.
  - A payout save that gets 409 stale reloads the balances.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(web): expenses and ledger pages`.

### Task 8: Reports — daily sheet, monthly, Excel

**Files:**
- Port from FM: `app/sheet/page.tsx`, `app/monthly/page.tsx`, `lib/excel.ts`, `components/admin/chart-card.tsx` (if not already ported)
- Test: `apps/web/test/excel.test.ts`

**Interfaces:**
- The sheet page requires `daily_sheet`; the monthly page requires `reports_advanced`.
- The export buttons (sheet, monthly, ledger) show only with `excel_export`.
- File names are `"<display_name> <month>.xlsx"`.
- Amounts use `currency_minor`, and times use `settings.timezone`.

- [ ] **Step 1: Write the failing tests.**
  - The workbook built for a KWD salon has amounts with 3 decimals, a title containing `display_name`, and the file name `"<display_name> 2026-11.xlsx"`.
  - The export button is hidden without `excel_export`.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(web): daily sheet, monthly report and excel export`.

### Task 9: Customers, ratings, audit

**Files:**
- Port from FM: `app/customers/page.tsx`, `app/customers/view/page.tsx`, `app/ratings/page.tsx`, `app/audit/page.tsx`, `components/app/audit-diff.tsx`
- Test: `apps/web/test/customers.test.tsx`, `audit-diff.test.ts`

**Interfaces:**
- Customers requires `customers_crm` (M13). Never call `/api/customers` from that page without it. The opt-out switch also needs `whatsapp`.
- Ratings requires `ratings`.
- Audit requires `audit_log`. The audit diff:
  - adds entity `whatsapp`, verb `starter`, and labels for the new settings fields (M24)
  - shows `vat_rate` as a percent

- [ ] **Step 1: Write the failing tests.**
  - The customers page without `customers_crm` makes 0 calls and shows the UpgradeCard.
  - The audit diff of `vat_rate` 5 → 7 shows "5% → 7%".
  - The `whatsapp` entity renders with a label.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(web): customers, ratings and audit pages`.

### Task 10: Notifications, push, announcements, WhatsApp campaigns

**Files:**
- Port from FM:
  - `components/app/`: `notification-bell`, `notifications-card`, `push-prompt`, `wa-announcements`
  - `lib/push.ts`
  - `app/announcements/page.tsx`
- Create:
  - `scripts/gen-sw.mjs`: writes `public/firebase-messaging-sw.js` from the `NEXT_PUBLIC_FIREBASE_*` env at build.
- Test: `apps/web/test/push.test.ts`, `announcements.test.tsx`

**Interfaces:**
- **Firebase config:**
  - Comes from `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` and `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. It is one SalonStation project, not per salon.
  - If any value is missing, push is disabled quietly: there is no prompt and the generated service worker is a no-op.
- **Gating:**
  - `startPush` and the bell run only with `has("push")`.
  - The announcements Team tab requires `announcements`.
  - The WhatsApp tab requires `whatsapp_campaigns && whatsapp && settings.wa_ready`. Otherwise it shows the UpgradeCard, or "Connect WhatsApp in Settings" when only `wa_ready` is false.
- **Campaigns** handle these responses:
  - `campaign_running` (409): "Finish the current campaign first"
  - the audience cap of 1000 (400 text passes through)
  - `wa_not_ready`
  - The drain loop runs on batches of 15 (M19).
- **Defaults:** the default push title is `me.settings.display_name`.

- [ ] **Step 1: Write the failing tests.**
  - Without `push`, there are 0 calls to `/api/push/tokens` and `/api/notifications`.
  - With the Firebase env missing, `startPush` resolves without effect.
  - `gen-sw.mjs` output contains the project id from env and no FM values.
  - The WhatsApp tab shows the Connect hint when `wa_ready` is false.
  - A `campaign_running` 409 shows its message.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(web): notifications, push, announcements and campaigns`.

### Task 11: Settings — full contract, branding, WhatsApp connection

**Files:**
- Port from FM: `app/settings/page.tsx`
- Create: `components/app/whatsapp-connect.tsx`, `components/app/logo-upload.tsx`
- Test: `apps/web/test/settings.test.tsx`

**Interfaces:**
- **Save:** PUT `/api/settings` with the complete strict `SettingsInput` (M7). Build it from `me.settings` plus the form edits so that no required key is missing.
- **Sections:**
  - Business: display name, Arabic name, tagline, address, phone, TRN, licence. TRN is 15 digits only when `phone_country === "971"`, otherwise free text up to 40 characters.
  - Billing: VAT %, bill prefix, quick amounts, thank-you text.
  - Region: timezone (IANA select), currency (changing decimals → 400 shown inline), locale, phone country, day start hour 0–12.
  - Branding: logo upload (PUT/DELETE `/api/settings/logo`, png/jpeg/webp ≤200 KB, PNG ≤512 px; the 400 text is shown), brand colour.
  - Push: requires `push`.
  - WhatsApp: requires `whatsapp`. It holds the templates, language, image URLs, reminders and feedback toggles and hours, plus the "Run now" buttons. Under it sits `<WhatsAppConnect>`:
    - GET/PUT/DELETE `/api/whatsapp/config`
    - token is write-only and shows `has_token`
    - test numbers
    - 409 duplicate and 400 no-access errors shown inline
  - Ratings: requires `ratings`. Holds the Google review URL and Instagram.
- After a successful save, call `refresh()`.

- [ ] **Step 1: Write the failing tests.**
  - The PUT body contains every key that `SettingsInput` requires. Assert it against a list exported from `@ss/contract`; add `SETTINGS_INPUT_KEYS` there if it is missing.
  - VAT 5 is sent as 5.
  - The WhatsApp section is hidden without `whatsapp`.
  - The connect form never pre-fills a token.
  - A 409 duplicate number shows inline.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(web): settings with region, branding and whatsapp connection`.

### Task 12: Public pages — receipt, rating, 404

**Files:**
- Port from FM: `app/r/page.tsx`
- Rewrite: `app/rate/page.tsx` (M16)
- Create: `app/not-found.tsx`
- Test: `apps/web/test/public-pages.test.tsx`

**Interfaces:**
- `/r/?t=` uses the receipt's `salon` block: `display_name`, `logo_url`, `currency`, `currency_minor`, `locale`, `timezone`.
- `/rate/?t=` uses GET `/api/public/feedback/:token` to render a star picker and comment, then POST `{stars, comment}`.
  - After 4–5 stars, when the API returns a Google review link, show the "Review us on Google" button.
  - A 404 shows "This link has expired".
  - It never redirects to `/api/public/review` itself, so there is no loop.
- Public pages never call `/api/me`.

- [ ] **Step 1: Write the failing tests.**
  - The receipt for a KWD salon formats with 3 decimals.
  - The rate page posts the stars and shows the thanks state.
  - A 404 shows the expired text.
  - There are 0 `/api/me` calls on either page.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(web): public receipt and rating pages`.

### Task 13: Serve from the Worker, end-to-end smoke, docs

**Files:**
- Modify: root `package.json` (script `build:web`), `apps/api/package.json` (`dev` builds the web first, or documents it), `README.md`, `docs/superpowers/plans/2026-11-02-plan-1-followups.md`
- Create: `apps/web/e2e/smoke.spec.ts`, `apps/web/playwright.config.ts`
- Test: the smoke spec (run with `npm run e2e -w @ss/web`, not part of `npm test`)

**Interfaces:**
- **Smoke run:**
  1. `npm run build -w @ss/web`.
  2. Apply local migrations and the seed: `scripts/seed-local.sql` with `--local`.
  3. Start `wrangler dev --local` on 8787, which serves the export.
- **Smoke flow** (Playwright, Chromium, `http://localhost:8787`):
  - Log in to `org_demo_bravo` (trial) as its owner. See the admin nav, including Ledger.
  - Create a sale. It appears on the Sales page.
  - Log out. Log in to `org_demo_alpha` (free). There is no Ledger in the nav, and `/ledger/` shows the Upgrade card.
  - For the expired case, the spec sets alpha's status to `expired` with `wrangler d1 execute --local`. Then the ExpiredScreen shows, and the sale button is disabled.
  - Seed credentials come from the seed file. Read it; there are no secrets.

- [ ] **Step 1:** Write the smoke spec, then run it. Expected: PASS.
- [ ] **Step 2: Update the README.** Cover:
  - web dev: `next dev` on 3000 against wrangler on 8787, with `DEV_ALLOWED_ORIGINS=http://localhost:3000` in `.dev.vars`
  - the build and serve flow
  - the `NEXT_PUBLIC_*` env list
  - how to run the smoke test
- [ ] **Step 3: Tick the Plan 3 items in the followups doc:** avatar_v, inactive avatar_url, PUT /sales FK.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck` from the repo root. Expected: PASS.
- [ ] **Step 5: Commit** `test(web): end-to-end smoke and serving docs`.

## Done when

- **Tests:** root `npm test`, `npm run typecheck` and the web build all pass, and the e2e smoke passes locally.
- **Brand guard:** finds no FM, AED, Dubai or 971 hardcoding in `apps/web/src`.
- **Pages:** every FM page exists in SalonStation, plus `/plan` and the WhatsApp connection.
- **Gating:** every page is gated by feature and role, and the owner is treated as admin.
- **Subscription states:** trial, grace and expired each render their state.
- **Hosting:** the Worker serves the dashboard same-origin. No deploy was done.
