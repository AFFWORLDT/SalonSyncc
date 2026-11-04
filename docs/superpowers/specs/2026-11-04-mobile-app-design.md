# SalonKit mobile app + Atlantic Portal switches — design

Date: 2026-11-04 · Status: draft for review · Code: `apps/mobile` (Flutter), backend changes in `apps/api`, portal changes in `apps/web`

## 1. What we are building

One Flutter app, **SalonKit**, on the App Store and Google Play, used by every SalonKit salon. A salon's barbers and admins
install it, enter their salon's ID, then sign in with the username and password the owner gave them. The app shows that
salon's logo and name, so it feels like the salon's own portal.

The super admin runs every salon from **Atlantic Portal** (today's super-admin panel at `admin.salonkit.online`, renamed).
From there features are switched on or off per salon, per role, or in bundles, and the app follows those switches live,
without an app update. Salon-specific custom features are built into the same app and only switched on for that salon.

### Decisions already made (from the Q&A of 2026-11-04)

| Topic | Decision |
|---|---|
| Atlantic Portal | The name of the super-admin panel. The app itself is "SalonKit". |
| Store publishing | One app under our existing developer accounts (the ones deHertz uses), every salon uses it |
| First client | Super Salon, on SalonKit. FM Salon is a separate system and is **not** part of this. |
| Salon ID | The existing SalonKit salon ID (the slug, e.g. `supersalon`) |
| Sign-in | Remembered; "Switch salon" available. Optional fingerprint / Face ID lock, turned on in the app's settings |
| Salons per person | One. A user belongs to exactly one salon. |
| Roles | Barber and admin (owner counts as admin) only. Custom roles later, not now. |
| Barber screens | Add a bill, my bills today, my commission, announcements (plus my history and my account, as on the web) |
| Admin screens | Everything the web admin panel has |
| Switches | The same switches as the web, applied live |
| Custom features | Built into the one app, on only for the salon that needs them |
| Design | Same as the web: glass, cream + green light, rose-gold dark, Google Sans Flex / Code |
| Push notifications | Yes, in v1 |
| Offline | Online only. A YouTube-style bar: "No internet connection", then "Back online" when it returns |
| Language | English only |
| Printing | None. Share a bill on WhatsApp or as a link, as the web does |
| Platforms | Android and iOS phones (tablets work, but no tablet-specific layouts) |
| Deadline | None; quality over speed |
| Code location | `apps/mobile` in the SalonKit repo |
| Tooling | Flutter, Xcode and Android Studio are installed on the dev Mac |
| Approach | A: fully native Flutter screens, built in stages, driven by a feature registry |

### Defaults I chose where no answer was given (change any of them in review)

- **D1. Atlantic Portal switches:** all four kinds: per salon (exists), bundles, per role, minimum app version.
- **D2. Branding:** only the panel's visible title becomes "Atlantic Portal"; the address stays `admin.salonkit.online`.
- **D3. Store identity:** app name "SalonKit", bundle / application ID `online.salonkit.app`.
- **D4. Sign-in lasts 30 days from the last use** (each use extends it), then the password is asked again.

## 2. Stages

Each stage ends with something that works and is tested. Store release after Stage 2.

1. **Foundation:** backend mobile sign-in, the salon-ID check, the app shell, design system, feature registry,
   connectivity bar, remembered sign-in + biometric lock, push registration, app-version check.
2. **Barber app:** today (add bill), my bills, my commission, my history, announcements, my account, share a bill.
   → first TestFlight / Play internal test with Super Salon, then store release.
3. **Admin core:** dashboard, sales, bills, expenses, daily sheet, staff.
4. **Admin, everything else:** monthly, ledger, ratings, audit log, services, customers, announcements (send),
   settings, plan, my account. (AI connect stays web-only: it creates API keys for desktop AI apps.)
5. **Atlantic Portal:** bundles, per-role switches, app-version control, renamed title.
   (Stage 5's backend parts that the app reads, per-role switches and the version check, are built in Stage 1 so the
   app is ready for them; Stage 5 is the portal UI.)

Each stage gets its own implementation plan written from this spec.

## 3. Architecture

```
Flutter app (apps/mobile)                Worker salonkit-app (apps/api)          Atlantic Portal (apps/web /platform)
 ├─ salon ID screen ── GET /api/public/orgs/:slug ─►  org name + logo
 ├─ login ─────────── POST /api/mobile/session ────►  bearer token (mobile_sessions)
 ├─ every call ─────── Authorization: Bearer … ────►  same tenant routes as the web
 ├─ shell/menu ◄────── GET /api/me (features, role) ◄ effective features ◄──────── per-salon / role / bundle switches
 ├─ version check ──── GET /api/public/app-config ─►  min / latest version  ◄──── set in the portal
 └─ push ◄──────────── FCM (existing notify.ts) ────  push_tokens (+ platform)
```

The app talks to the **same API the web uses**. No second backend, no duplicate business logic: VAT, commission,
day boundaries and permissions stay on the server. The app only renders.

### 3.1 Backend changes (apps/api)

**Mobile sign-in (bearer tokens).** The web uses an httpOnly cookie bound to the salon's subdomain. An app has no
subdomain and cookie jars are fragile, so mobile gets its own session kind:

- `POST /api/mobile/session` with `{ org, username, password, device: { id, name, platform: "ios"|"android" } }`.
  It reuses login's checks exactly: the same three throttling counters, constant-time "no such salon/user", the same
  generic failure text "Wrong salon ID, username or password", deactivated/deleted salons refused.
  Returns `{ token, expires_at, me }`.
- New table `mobile_sessions(id, org_id, user_id, token_hash, device_id, device_name, platform, session_version,
  created_at, last_used_at, expires_at)`. Only the SHA-256 of the token is stored. One row per device per user; signing
  in again on the same device replaces it.
- The tenant guard accepts `Authorization: Bearer skm_…` as an alternative to the cookie. The token's salon must
  match; the user's `session_version` must match (a password change or the owner removing the barber ends it, as on
  the web). `last_used_at` / `expires_at` slide forward at most once an hour, to keep D1 writes low.
- `DELETE /api/mobile/session` signs this device out. Staff management gains "Signed-in phones" with a sign-out
  button per device (admin only).
- Origin/CSRF: bearer requests carry no cookie, so they cannot be forged by a browser; the origin guard already lets
  requests without an `Origin` header through. A request with **both** a cookie and a bearer token is rejected.
- Support mode (super admin signed in as owner) is web-only; mobile tokens are never support sessions.

**Salon-ID check.** `GET /api/public/orgs/:slug` returns `{ slug, name, logo_url }` for a live salon and 404 otherwise
(deactivated, deleted, unknown all look the same). Rate-limited with the existing `pub` limiter. Salon IDs are
already public (they are subdomains), so this reveals nothing new.

**Per-role switches.** New table `org_role_features(org_id, role, feature_key, enabled)`. A user's features are
`effectiveFeatures(plan, salon overrides)` minus anything switched off for their role. This is enforced on the
server, so it applies to the web too, not just the app. `core_sales` cannot be switched off for any role.
`/api/me.features` already returns the list; it simply becomes role-aware.

**Bundles.** New table `feature_bundles(id, name, features_json, created_at)`. Applying a bundle to a salon writes
that salon's overrides in one go (the same override rows the per-salon switches use) and writes one audit entry.
A bundle is a preset, not a live link: editing a bundle later does not change salons that already used it.

**App version control.** Platform settings `app_min_version` and `app_latest_version`, one pair per platform.
`GET /api/public/app-config?platform=ios|android` → `{ min_version, latest_version, store_url }`.
Below the minimum, the app shows a full-screen "Update SalonKit" with a store button. Below the latest, a one-time
dismissible banner.

**Push.** `POST /api/push/tokens` gains an optional `platform`. `notify.ts` already sends through FCM; the app turns a
push's `path` into an in-app screen (same paths as the web, e.g. `/announcements`). A new silent push
`features_changed` is sent when the portal changes a salon's switches, so open apps refresh at once (otherwise they
refresh on every open and every return to the foreground).

**Custom features.** A salon-specific feature is a new key in `@ss/features`, added to `OVERRIDE_ONLY` (so no plan
grants it by accident, only the portal), plus its API routes gated on that key, plus its app module. Naming:
`x_<salon>_<feature>`, e.g. `x_supersalon_loyalty`.

### 3.2 The app (apps/mobile)

**Stack**, kept small and matching deHertz's proven, store-approved setup:

| Need | Package |
|---|---|
| State, routing, DI | `get` (as deHertz) |
| HTTP | `dio` with an auth + error interceptor |
| Token storage | `flutter_secure_storage` (Keychain / Keystore) |
| Small prefs (salon ID, theme, biometric on/off) | `shared_preferences` |
| Biometric lock | `local_auth` |
| Push | `firebase_core`, `firebase_messaging`, `flutter_local_notifications` |
| Crash reports | `firebase_crashlytics` |
| Connectivity bar | `connectivity_plus` plus a real reachability ping |
| Sharing | `share_plus`, `url_launcher` (WhatsApp deep link) |
| Images (logos, avatars) | `cached_network_image` |
| Dates / money | `intl` |
| Animation | `animations` (shared-axis / fade-through page transitions) plus Flutter's built-in implicit animations |

No other packages without a reason written in the plan. Target size: under 20 MB per Android ABI download, under
40 MB iOS install.

**Structure**

```
lib/
  main.dart
  core/
    api/          dio client, interceptors, ApiError, typed endpoints
    auth/         session store, biometric lock, salon store
    features/     FeatureRegistry, FeatureModule, gate widget
    theme/        tokens copied from apps/web app-theme.css, light + dark, Google Sans Flex/Code
    ui/           glass card, buttons, inputs, money text, empty/error/loading states, skeletons
    connectivity/ the online/offline bar
    push/         FCM setup, deep-link router
    version/      app-config check, update screen
  models/         Dart models of @ss/contract responses (hand-written, fixture-tested)
  modules/        one folder per feature module (sales, bills, expenses, sheet, ledger, …, x_supersalon_loyalty)
  shell/          tab bar + "More" menu built from the registry
```

**Feature registry (the scalable part).** Every module declares:

```dart
FeatureModule(
  key: 'expenses',              // FeatureKey from @ss/features; null = always on (e.g. account)
  roles: {Role.admin, Role.barber},
  title: 'Expenses', icon: …,
  tab: false,                    // shown in the bottom bar or under "More"
  routes: [...],
  barberWhen: (me) => me.user.canAddExpense,   // optional extra rule
)
```

The shell builds the bottom tabs and the "More" menu from `registry.visibleFor(me)`: the modules whose key is in
`me.features` and whose roles include the user's role. Adding a feature, including a custom one, means adding one
module and registering it; nothing else in the app changes. A deep link or push to a switched-off module shows
"This feature isn't on for your salon" instead of a broken screen. The server still enforces every switch; the app's
gating is only for a clean UI.

**Live switches.** `/api/me` is fetched on launch, on return to the foreground, on `features_changed` push, and after
any 403 `feature_disabled`. If a switch turns off the screen the user is on, they are taken back to home with a short
message.

**Screens: barber**

- **Today:** add a bill (services, staff = self, payment method, amount VAT-inclusive as on the web), today's total and
  commission.
- **My bills:** today's bills, tap for detail, share (WhatsApp / link, using the web's receipt link `/r/`).
- **My history:** day-by-day totals and commission.
- **Announcements:** feed, unread badge.
- **My account:** profile, change password, biometric lock on/off, theme, sign out, switch salon.

**Screens: admin.** Mirrors the web nav: Dashboard, Sales, Bills, Expenses, Daily sheet, Monthly, Ledger, Ratings,
Audit log, Staff, Services, Customers, Announcements, Settings, Plan, My account. Each one uses the same API calls and
the same switch as its web page. Excel downloads open the share sheet with the `.xlsx` file.

**First launch flow**

1. Splash (salon logo if one is remembered, else SalonKit) → version check.
2. No salon remembered → **Salon ID** screen. The ID is checked as typed (debounced); found → the salon's logo and
   name animate in, "Continue".
3. **Sign in** screen, branded with that salon: username + password. Errors in plain words. "Not your salon?" goes back.
4. Success → token saved → push permission asked once → offer the fingerprint / Face ID lock (skippable) → home.
5. Later launches: biometric prompt if on → straight to home. Token expired or revoked → sign-in screen, salon kept.

**Connectivity bar.** A thin bar slides up at the bottom: dark "No internet connection" while offline; when the
connection returns, green "Back online" for 2 seconds, then it slides away. Offline taps on save buttons show "You're
offline" and nothing is queued (online only). Pull-to-refresh everywhere.

**Design and motion.** Theme tokens are copied from the web's CSS variables so both look the same; light and dark
follow the phone setting with a manual override. Motion: shared-axis page transitions, a fade-through between tabs,
skeleton loaders instead of spinners, a small spring on primary buttons, number count-ups on totals, the salon-logo
reveal on the ID screen. All motion is short (150–350 ms) and turns off when the phone's reduce-motion setting is on.

**Security**

- The token lives only in secure storage; never logged, never in crash reports.
- Biometric lock: required on launch and after 5 minutes in the background, when turned on. Falls back to the phone's
  passcode. Turning it on needs a successful biometric check.
- Signing out deletes the token on the server and the device, and removes the push token.
- The app blurs its content in the phone's app switcher. Screenshots stay allowed, so bills can be shared.
- Certificate pinning is not used (Cloudflare rotates certificates); HTTPS only, cleartext blocked.

### 3.3 Atlantic Portal changes (apps/web `/platform`)

- Title and logo text "Atlantic Portal" (address unchanged).
- Salon detail → **Features** tab: every switch with its source shown (plan / salon override / bundle), plus a
  **By role** grid (barber / admin columns).
- **Bundles** page: create, edit, delete bundles; "Apply bundle" on a salon (shows what will change before applying).
- **App** page: minimum and latest version per platform, store links, and how many devices are on each version
  (from `mobile_sessions`).
- Every change writes the existing platform audit log.

## 4. Errors

- The API's error JSON (`{ error, code }`) is shown as its message; codes `feature_disabled`, `mcp_limit` etc. map to
  friendly screens.
- 401 → sign-in screen (salon remembered). 403 `feature_disabled` → refresh `/api/me`, leave the screen.
  429 → "Too many attempts, try again in a few minutes". 5xx / timeout → "Something went wrong" with Retry.
- A deactivated salon → a "This salon's account is paused. Contact the salon owner." screen.

## 5. Testing

- **API:** vitest like today: mobile session (success, wrong password, throttling shared with web login, revoked on
  password change, cookie + bearer rejected, wrong salon), the org lookup, per-role switches (enforced on routes, not
  just hidden), bundle apply, app-config.
- **App:** unit tests for the registry, session store, API error mapping, money / VAT display; widget tests for every
  screen's loading / empty / error / data states; model tests parse JSON fixtures copied from the API's own test
  responses, so a contract change breaks a test; one integration test per stage on an emulator against
  `wrangler dev` with a seeded test salon.
- **Manual before each release:** a real iPhone and a real Android phone, light and dark, slow network, airplane-mode
  toggle, biometric on/off, push in foreground / background / killed.

## 6. Release

- Android: Play internal testing → closed test with Super Salon's staff → production. iOS: TestFlight → App Store.
- Store listing: SalonKit name, screenshots from a demo salon (never a real salon's data), privacy policy page on
  salonkit.online (data collected: name, username, device push token, crash reports; no tracking, no ads).
- Signing keys stay out of git (keystore and `key.properties` git-ignored, like deHertz); Firebase config files are
  not committed (`google-services.json` / `GoogleService-Info.plist` provided at build time).
- Versioning: `version: x.y.z+build`; the backend's minimum version is raised only when an old app would break.

## 7. Out of scope (for now)

Custom roles, Arabic, offline mode, printing, more than one salon per person, tablet layouts, branded per-salon store
copies, AI connect in the app, FM Salon.
