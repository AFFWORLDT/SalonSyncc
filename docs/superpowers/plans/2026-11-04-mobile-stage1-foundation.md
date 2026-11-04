# Mobile app Stage 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Flutter app that signs a SalonKit barber or admin into their salon and shows a switch-driven shell, plus the backend it needs (phone sessions, per-role switches, app-version config).

**Architecture:** The app talks to the salon's own host `https://<slug>.salonkit.online/api/...`, so the existing host-based salon resolution, guards and routes are reused unchanged. Phones authenticate with a bearer token stored hashed in a new `mobile_sessions` table; `tenantAuth` accepts it as an alternative to the cookie. The app's menu is built from a registry of feature modules filtered by `/api/me`'s `features` and the user's role.

**Tech Stack:** API: Hono + D1 on Workers, vitest with `@cloudflare/vitest-plugin`. App: Flutter 3.41.7 / Dart 3.11.5, `get`, `dio`, `flutter_secure_storage`, `shared_preferences`, `local_auth`, `firebase_core`, `firebase_messaging`, `flutter_local_notifications`, `firebase_crashlytics`, `connectivity_plus`, `share_plus`, `url_launcher`, `cached_network_image`, `intl`, `animations`.

**Spec:** `docs/superpowers/specs/2026-11-04-mobile-app-design.md`

## Global Constraints

- App name "SalonKit"; Android `applicationId` and iOS bundle ID `online.salonkit.app`.
- English only. Android and iOS phones. Online only.
- No packages beyond the Tech Stack list without a written reason in the ledger.
- Same design as the web: token values from `apps/web/src/components/theme/theme.ts`, fonts Google Sans Flex (text) and Google Sans Code (numbers, IDs, uppercase labels), light + dark following the phone with a manual override.
- Motion 150–350 ms; all motion off when the phone's reduce-motion setting is on (`MediaQuery.disableAnimations`).
- Sign-in lasts 30 days from last use; the sliding update writes at most once an hour.
- Login failure text is exactly `Wrong salon ID, username or password`; lock text exactly `Too many attempts. Try again in a few minutes.`
- Tokens: prefix `skm_`, only the SHA-256 hex is stored, never logged, never sent to Crashlytics.
- Roles in Stage 1: `barber`, and admin = `owner` or `admin` (`isAdmin` in `apps/api/src/core/roles.ts`).
- `core_sales` can never be switched off, for any role.
- Never commit: `google-services.json`, `GoogleService-Info.plist`, keystores, `key.properties`, `.env*`. The repo's pre-commit secret scan must pass.
- FM Salon (`gents-salon`, `fm-salon` Worker) is untouched by this plan.
- Deploys: API via `XDG_CONFIG_HOME=/Users/laxmikant/.wrangler-affworld npx wrangler deploy` from `apps/api` after `npm run build` in `apps/web`, migration applied with `wrangler d1 migrations apply salonkit-db --remote` first.

## Rulings against the spec (made while planning)

- **Salon check uses the existing `GET /api/public/brand` on `https://<slug>.salonkit.online`** instead of a new `GET /api/public/orgs/:slug`. It already returns `{ name, logo_url }` (name `null` = not found / deactivated) with the `pub` rate limit. Cost if wrong: one small endpoint later.
- **`POST /api/push/tokens` gets no `platform` field.** FCM tokens work for both platforms and nothing reads the field; device platform lives in `mobile_sessions`. Cost if wrong: one column later.
- **The silent `features_changed` push and bundles move to Stage 5**, with the portal screens that trigger them. Stage 1 refreshes switches on launch, on resume and on any 403 `feature_disabled`, which the spec also requires.
- **Per-role switches and app config get their platform API routes now** (no portal UI until Stage 5), so they can be set with `curl` and are tested end to end.

## Review Focus

1. A barber whose password is changed or who is deactivated while signed in on a phone → the next request is 401 and the app returns to sign-in with the salon kept. (Task 3 test `revoked by session_version`, Task 10 test `401 clears token keeps salon`.)
2. A phone token used on another salon's host → 401 `wrong_org`, never that salon's data. (Task 3 test `token for org A on host B`.)
3. A role switch that turns off a feature for barbers must block the API route, not only hide the menu. (Task 4 test `role off blocks route`.)
4. Typing a salon ID with capitals or spaces (`Super Salon`) → normalized the same way the server does (`normalizeSlug`), not "not found". (Task 9 test `normalizes like the server`.)
5. Losing the connection mid-request → a "No internet" state and the offline bar, never a raw `DioException` text. (Task 8 test `connection error maps to offline`, Task 13 test.)

---

## Part A — Backend (apps/api)

### Task 1: Migration 0016 — mobile sessions, role switches, app config

**Files:**
- Create: `apps/api/migrations/0016_mobile.sql`
- Test: `apps/api/test/schema.test.ts` (add cases)

**Interfaces:**
- Produces tables:
  - `mobile_sessions(id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id), user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, device_name TEXT NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('ios','android')), app_version TEXT, session_version INTEGER NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY (org_id,user_id) REFERENCES users(org_id,id))`, `UNIQUE(org_id,user_id,device_id)`, index on `(org_id,user_id)`.
  - `org_role_features(org_id TEXT NOT NULL REFERENCES orgs(id), role TEXT NOT NULL CHECK(role IN ('barber','admin')), feature_key TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), updated_at INTEGER NOT NULL, PRIMARY KEY(org_id,role,feature_key))`. Role `admin` covers owner and admin.
  - `app_config(platform TEXT PRIMARY KEY CHECK(platform IN ('ios','android')), min_version TEXT NOT NULL, latest_version TEXT NOT NULL, store_url TEXT NOT NULL, updated_at INTEGER NOT NULL)`, seeded with `('ios','1.0.0','1.0.0','https://apps.apple.com/app/salonkit',0)` and `('android','1.0.0','1.0.0','https://play.google.com/store/apps/details?id=online.salonkit.app',0)`.

- [ ] **Step 1:** Add schema tests `mobile tables exist` (the three tables exist; inserting a `mobile_sessions` row with `platform='web'` fails; inserting `org_role_features` with `role='owner'` fails; `app_config` has 2 rows).
- [ ] **Step 2:** Run `cd apps/api && npx vitest run test/schema.test.ts`. Expected: FAIL (no such table).
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): mobile sessions, role switches, app config tables`.

### Task 2: Shared login check + `POST/DELETE /api/mobile/session`

**Files:**
- Modify: `apps/api/src/platform/auth.ts` (extract the checks)
- Create: `apps/api/src/core/mobile-session.ts`, `apps/api/src/platform/mobile.ts`
- Modify: `apps/api/src/index.ts` (mount `app.route("/api/mobile", mobile)` next to `/api/auth`)
- Modify: `apps/api/src/core/pipeline.ts` `WRITE_ALLOW_PREFIXES` add `"/api/mobile/"`
- Test: `apps/api/test/mobile-session.test.ts`

**Interfaces:**
- Produces `verifyLogin(c: Context<AppEnv>, body: { org?: unknown; username?: unknown; password?: unknown }): Promise<{ org: Org; user: UserRow }>` in `platform/auth.ts`. Contains everything the current `/login` handler does before `issueSession` (host-wins slug, three counters, dummy hash, failure recording, `clearLoginFailures`) and throws the same `HttpError`s. `/api/auth/login` becomes `verifyLogin` + `issueSession`, with identical behaviour (existing `auth.test.ts` and `lockout.test.ts` stay green unchanged).
- Produces in `core/mobile-session.ts`:
  - `MOBILE_TTL_MS = 30 * 86_400_000`, `MOBILE_TOUCH_MS = 3_600_000`
  - `hashToken(token: string): Promise<string>` (SHA-256 hex)
  - `issueMobileSession(db, o: { orgId; userId; sessionVersion; deviceId; deviceName; platform: "ios"|"android"; appVersion: string|null }, now = Date.now()): Promise<{ token: string; expiresAt: number }>`. Token `skm_` + `randomToken(32)`. Upserts on `(org_id,user_id,device_id)`; a different user signing in on the same `device_id` in the same org deletes that device's other rows first (one signed-in person per phone).
  - `readMobileSession(db, token: string, now = Date.now()): Promise<{ id: string; uid: number; orgId: string; v: number } | null>`. Null when unknown or `expires_at < now`. When `now - last_used_at >= MOBILE_TOUCH_MS`, updates `last_used_at = now, expires_at = now + MOBILE_TTL_MS`.
  - `revokeMobileSession(db, id: string): Promise<void>`
- Route `POST /api/mobile/session` body `{ org, username, password, device: { id, name, platform, app_version? } }`. Validation (400, message `Update the app and try again`): `device.id` 8–100 chars `[A-Za-z0-9_-]`, `device.name` 1–80 chars after trim, platform `ios|android`, `app_version` optional ≤ 20 chars. Response 200 `{ token, expires_at }`. Sets no cookie.
- Route `DELETE /api/mobile/session` (bearer required, see Task 3): deletes the row, `{ ok: true }`. Registered on the tenant router in Task 3 so it gets auth.

- [ ] **Step 1: Failing tests** in `mobile-session.test.ts` (use `makeOrg`, `makeUser`, requests to `https://<slug>.salonkit.online/api/mobile/session` with `ROOT_DOMAIN: "salonkit.online"`):
  - `signs in and returns a skm_ token, no cookie`: 200, `token` matches `/^skm_[A-Za-z0-9_-]{40,}$/`, `expires_at ≈ now + 30 days`, no `set-cookie`, DB row holds `hashToken(token)` and not the token.
  - `wrong password: same 401 text as web`: body `{ error: "Wrong salon ID, username or password" }`.
  - `shares the web lockout`: fail web login N times to the lock threshold, then the mobile call answers 429 `Too many attempts. Try again in a few minutes.` even with the right password.
  - `bad device → 400`: platform `web`, missing device, 5-char id.
  - `same device signs in again: one row`; `another user on the same device replaces the first`.
  - `deactivated salon → 401`.
- [ ] **Step 2:** Run `npx vitest run test/mobile-session.test.ts`. Expected: FAIL (404 route).
- [ ] **Step 3:** Extract `verifyLogin`, write `core/mobile-session.ts` and `platform/mobile.ts`, mount the router.
- [ ] **Step 4:** Run `npx vitest run test/mobile-session.test.ts test/auth.test.ts test/lockout.test.ts`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat(api): phone sign-in with bearer tokens`.

### Task 3: `tenantAuth` accepts phone tokens; device list for admins

**Files:**
- Modify: `apps/api/src/core/pipeline.ts` (`tenantAuth`)
- Modify: `apps/api/src/env.ts` (tenant var gains `mobileSessionId: string | null`)
- Modify: `apps/api/src/platform/mobile.ts` (add the DELETE and device routes as `mobileTenant`, mounted on `tenantApi`)
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/mobile-session.test.ts` (add), `apps/api/test/auth.test.ts` OPEN list unchanged

**Interfaces:**
- Consumes `readMobileSession`, `revokeMobileSession` (Task 2).
- `tenantAuth`: if `Authorization: Bearer skm_…` is present → `readMobileSession`; if a `ss_session` cookie is **also** present → 401 `Please sign in` code `mixed_auth`. Everything after (host/org match, active user, `session_version === row.session_version`, features) is the same code path as cookies. Sets `c.var.tenant.mobileSessionId`. A bearer that is not `skm_` is ignored (falls through to the cookie path → 401 if no cookie).
- Routes on `tenantApi`:
  - `DELETE /mobile/session` → revokes `c.var.tenant.mobileSessionId` (400 if the request used a cookie).
  - `GET /staff/:id/devices` (requireAdmin) → `[{ id, device_name, platform, app_version, last_used_at }]` for that user in this org.
  - `DELETE /staff/:id/devices/:sid` (requireAdmin) → revokes it, 404 if not this org's/user's.
- Origin guard: phone requests send no `Origin`, so `originGuard` passes them already; add a test proving a bearer POST without Origin is accepted.

- [ ] **Step 1: Failing tests:**
  - `bearer reaches /api/me`: 200 with the right `user.username`.
  - `token for org A on host B → 401 wrong_org`.
  - `revoked by session_version`: after `PUT /api/me/password` from the web, the phone token gets 401.
  - `deactivated user → 401`.
  - `cookie + bearer → 401 mixed_auth`.
  - `expired → 401` (set `expires_at` in the past).
  - `sliding touch at most hourly`: two calls 10 min apart don't change `last_used_at`; a call 61 min later moves `expires_at` (pass `now` via a fake clock or update the row's `last_used_at` back by 61 min).
  - `DELETE /api/mobile/session then /api/me → 401`.
  - `admin lists and signs out a barber's phone; a barber gets 403 on the device routes; another org's session id → 404`.
  - `bearer POST without Origin passes originGuard` (POST `/api/_probe/write` in test env → 200).
- [ ] **Step 2:** Run `npx vitest run test/mobile-session.test.ts`. Expected: the new cases FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` in `apps/api`. Expected: full suite PASS.
- [ ] **Step 5:** Commit `feat(api): phone tokens on every tenant route; admin device sign-out`.

### Task 4: Per-role feature switches

**Files:**
- Modify: `packages/features/src/index.ts` (add `roleFeatures`)
- Modify: `apps/api/src/core/features-cache.ts` (cache the org's role rows with the rest)
- Modify: `apps/api/src/core/pipeline.ts` (tenantAuth applies the user's role)
- Modify: `apps/api/src/platform/admin.ts` (routes below)
- Test: `packages/features/test/*` (whichever file holds `effectiveFeatures` tests), `apps/api/test/role-features.test.ts`

**Interfaces:**
- `roleFeatures(features: readonly FeatureKey[], role: "barber" | "admin", rows: { role: string; feature_key: string; enabled: 0 | 1 }[]): FeatureKey[]` — removes keys with a matching `enabled = 0` row; `enabled = 1` rows never add a key the salon doesn't have; `core_sales` always kept; order preserved.
- `OrgFeatures` gains `roleRows: { role: string; feature_key: string; enabled: 0|1 }[]`; `featuresFor` loads them in the same `Promise.all`. `invalidateFeatures(orgId)` already clears it.
- `tenantAuth` sets `features = roleFeatures(orgFeatures.features, isAdmin(user) ? "admin" : "barber", roleRows)`. `/api/me.features` therefore becomes role-aware with no change to `me.ts`.
- Platform routes (super admin session, platform audit entry like the existing `PUT /orgs/:id/features/:key`):
  - `GET /api/platform/orgs/:id/role-features` → `{ barber: Record<FeatureKey, boolean>, admin: Record<FeatureKey, boolean> }` (true unless a 0-row exists).
  - `PUT /api/platform/orgs/:id/role-features/:role/:key` body `{ enabled: boolean }`; 400 for unknown role/key or `core_sales`. `enabled: true` deletes the row. Calls `invalidateFeatures`.

- [ ] **Step 1: Failing tests:**
  - features package: `roleFeatures drops only for that role`, `never adds`, `keeps core_sales`.
  - API: `role off hides from barber /me but not owner /me`; `role off blocks route` (switch `expenses` off for barber → barber `GET /api/expenses` → 403 `feature_disabled`, owner still 200); `core_sales rejected 400`; `non-platform caller → 401`.
- [ ] **Step 2:** Run `npx vitest run test/role-features.test.ts` and the package tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` in `apps/api` and in `packages/features`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: per-role feature switches enforced on the server`.

### Task 5: App version config

**Files:**
- Create: `apps/api/src/platform/app-config.ts`
- Modify: `apps/api/src/index.ts` (`publicApi.route("/app-config", appConfigPublic)`; platform route added to `platformApi`)
- Modify: `apps/api/test/auth.test.ts` OPEN list add `"GET /api/public/app-config"`
- Test: `apps/api/test/app-config.test.ts`

**Interfaces:**
- `GET /api/public/app-config?platform=ios|android` (rate limit `pub`, `cache-control: public, max-age=300`) → `{ min_version, latest_version, store_url }`; 400 for another platform. Works on any API host, including `admin.<domain>` (the app reads it from there before a salon is chosen).
- `PUT /api/platform/app-config/:platform` body `{ min_version, latest_version, store_url }`: versions match `/^\d{1,3}\.\d{1,3}\.\d{1,3}$/`, `min ≤ latest` (numeric compare per part), `store_url` https; platform audit entry `app_config`.
- `GET /api/platform/app-config` → both rows plus `devices: { ios: Record<version, count>, android: Record<version, count> }` from unexpired `mobile_sessions`.

- [ ] **Step 1: Failing tests:** `public read returns seeded android row` (requested on `https://admin.salonkit.online` with `ROOT_DOMAIN` set); `bad platform 400`; `super admin updates; min > latest rejected (1.10.0 vs 1.9.0 compares numerically)`; `device counts by version`.
- [ ] **Step 2:** Run `npx vitest run test/app-config.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): app version config for the phone app`.

---

## Part B — The app (apps/mobile)

All app commands run in `apps/mobile`. Test command for every app task: `flutter test` (plus `flutter analyze` with zero issues).

### Task 6: Project scaffold, theme and fonts

**Files:**
- Create: `apps/mobile/` via `flutter create --org online.salonkit --project-name salonkit --platforms ios,android apps/mobile`, then set Android `applicationId` / `namespace` and iOS `PRODUCT_BUNDLE_IDENTIFIER` to `online.salonkit.app`, display name `SalonKit`.
- Create: `apps/mobile/.gitignore` additions (`google-services.json`, `GoogleService-Info.plist`, `*.jks`, `*.keystore`, `key.properties`).
- Create: `lib/core/theme/tokens.dart`, `lib/core/theme/app_theme.dart`, `lib/core/theme/theme_controller.dart`
- Create: `assets/fonts/` with Google Sans Flex + Google Sans Code TTFs (OFL, from Google Fonts), declared in `pubspec.yaml`.
- Modify: root `package.json` workspaces stay JS-only (do **not** add `apps/mobile`).
- Test: `test/core/theme_test.dart`

**Interfaces:**
- `class SkTokens` with `static const light` and `static const dark` instances of `SkPalette { Color background, foreground, card, primary, primaryForeground, muted, mutedForeground, border, destructive, success, warning; }`. Values copied from `apps/web/src/components/theme/theme.ts` (oklch converted to sRGB hex; note the conversion in a comment per token).
- `ThemeData buildTheme(SkPalette p, Brightness b)`; text theme uses family `GoogleSansFlex`, `SkText.mono` uses `GoogleSansCode`.
- `class ThemeController extends GetxController { Rx<ThemeMode> mode; Future<void> setMode(ThemeMode m); }` persisted in `shared_preferences` key `sk.theme`.
- `class SkGlass extends StatelessWidget` (blurred translucent card, radius 24, 1 px border at 25% white light / 12% dark) in `lib/core/ui/glass.dart`.

- [ ] **Step 1: Failing tests:** `light and dark palettes differ and primary matches web hex values` (assert exact hex for `primary` light and dark); `theme uses Google Sans Flex`; `ThemeController persists dark`.
- [ ] **Step 2:** `flutter test test/core/theme_test.dart`. Expected: FAIL.
- [ ] **Step 3:** Implement; add dependencies from the Tech Stack to `pubspec.yaml` (dev: `flutter_lints`, `flutter_test`, `integration_test`).
- [ ] **Step 4:** `flutter test && flutter analyze`. Expected: PASS, "No issues found!".
- [ ] **Step 5:** Commit `feat(mobile): scaffold SalonKit app with web theme`.

### Task 7: Config and salon address

**Files:**
- Create: `lib/core/config.dart`
- Test: `test/core/config_test.dart`

**Interfaces:**
- `String normalizeSlug(String s)` — trim, lowercase, collapse `[\s_]+` to `-` (same as `apps/api/src/core/tenant.ts`).
- `bool isValidSlug(String s)` — `^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$`.
- `Uri salonBase(String slug)` — `https://$slug.$kRootDomain` where `kRootDomain = String.fromEnvironment('SK_ROOT_DOMAIN', defaultValue: 'salonkit.online')`. Dev builds set `SK_DEV_HOST` (e.g. `http://10.0.2.2:8787`): every salon uses that host, and the client adds the slug as `?org=` on public calls and `org` in the sign-in body, which the API accepts when `ROOT_DOMAIN` is empty (`resolvePublicOrg`, `verifyLogin`).
- `Uri configBase()` — `https://admin.$kRootDomain` (the bare `salonkit.online` is the marketing site's Worker, not the API), or `SK_DEV_HOST`.
- `Uri absolute(String slug, String pathOrUrl)` — joins relative API paths such as `logo_url`.

- [ ] **Step 1: Failing tests:** `normalizes like the server` (`" Super Salon "` → `super-salon`, `"super_salon"` → `super-salon`); `rejects 1-char and 31-char slugs`; `salonBase builds https host`; `absolute keeps query`.
- [ ] **Step 2:** `flutter test test/core/config_test.dart`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Expected: PASS.
- [ ] **Step 5:** Commit `feat(mobile): salon address helpers`.

### Task 8: API client and error mapping

**Files:**
- Create: `lib/core/api/api_client.dart`, `lib/core/api/api_error.dart`
- Test: `test/core/api_client_test.dart` (fake `HttpClientAdapter`, no extra package)

**Interfaces:**
- `sealed class ApiError implements Exception` with `Offline`, `Unauthorized`, `FeatureDisabled`, `Throttled(String message)`, `Paused` (code `subscription_inactive` / 402), `ServerError(String message)`, `Validation(String message)` (400/404/409 with the server's `error` text).
- `ApiError mapError(Object e)` — `DioExceptionType.connectionError|connectionTimeout|receiveTimeout|sendTimeout` → `Offline`; 401 → `Unauthorized`; 403 code `feature_disabled` → `FeatureDisabled`; 429 → `Throttled(error)`; 402 → `Paused`; 5xx → `ServerError("Something went wrong. Try again.")`; others → `Validation(error ?? "Something went wrong. Try again.")`.
- `class ApiClient { ApiClient(Uri base, {String? Function()? token, void Function()? onUnauthorized, HttpClientAdapter? adapter}); Future<T> get<T>(String path, T Function(Object? json) parse); post/put/delete likewise; }` — 15 s timeouts, header `Authorization: Bearer <token>` when present, `User-Agent: SalonKit/<version> (<platform>)`, calls `onUnauthorized` once on any 401 then throws `Unauthorized`. Never logs headers.

- [ ] **Step 1: Failing tests:** `connection error maps to offline`; `401 calls onUnauthorized and throws Unauthorized`; `403 feature_disabled maps`; `429 keeps server text`; `500 hides server text`; `sends bearer header`.
- [ ] **Step 2–4:** run `flutter test test/core/api_client_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): API client with plain-word errors`.

### Task 9: Models and fixtures

**Files:**
- Create: `lib/models/me.dart` (`Me`, `MeUser`, `MeOrg`, `Subscription`), `lib/models/brand.dart` (`Brand { String? name; String? logoUrl; bool get found => name != null; }`), `lib/models/app_config.dart` (`AppConfig { String minVersion, latestVersion, storeUrl; }`), `lib/models/role.dart` (`enum Role { barber, admin }`, `Role roleOf(String apiRole)` — `owner|admin` → admin)
- Create: `test/fixtures/me_owner.json`, `me_barber.json`, `brand.json`, `brand_missing.json`, `app_config.json` — copied from real responses of the API test suite (run the Task 3 `/api/me` test with a `console.log` once, paste, remove the log).
- Test: `test/models_test.dart`

**Interfaces:** each model has `factory X.fromJson(Map<String, dynamic>)`. `Me` exposes `Set<String> features`, `Role role`, `String today`, `bool canAddExpense`, `String salonName` (settings display name or org name). Unknown JSON keys are ignored; a missing required key throws `FormatException`.

- [ ] **Step 1: Failing tests:** each fixture parses; `owner → Role.admin`; `brand_missing.found == false`; `missing user throws FormatException`.
- [ ] **Step 2–4:** `flutter test test/models_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): API models with fixtures from the API tests`.

### Task 10: Session and salon storage, AuthController

**Files:**
- Create: `lib/core/auth/secure_store.dart` (`abstract class SecureStore { read/write/delete }` + `FlutterSecureStore` + `MemorySecureStore` for tests)
- Create: `lib/core/auth/session_store.dart`, `lib/core/auth/auth_controller.dart`, `lib/core/auth/device_info.dart`
- Test: `test/core/auth_controller_test.dart`

**Interfaces:**
- `SessionStore(SecureStore s)`: `Future<String?> token()`, `saveToken(String)`, `clearToken()`; salon kept in `shared_preferences` `sk.salon` as `{slug, name, logoUrl}`: `Future<SavedSalon?> salon()`, `saveSalon(SavedSalon)`, `clearSalon()`. Device id: random 32-char id created once, stored in secure storage `sk.device`.
- `enum AuthState { unknown, needSalon, needLogin, locked, signedIn }`
- `class AuthController extends GetxController`: `Rx<AuthState> state`, `Rxn<Me> me`, `Rxn<SavedSalon> salon`; `Future<void> boot()`; `Future<Brand> checkSalon(String typed)` (normalizes, `GET /api/public/brand`); `Future<void> chooseSalon(SavedSalon s)`; `Future<void> signIn(String username, String password)` (`POST /api/mobile/session` with device `{id, name, platform, app_version}`, then `GET /api/me`); `Future<void> refreshMe()`; `Future<void> signOut()` (best-effort `DELETE /api/push/tokens` and `DELETE /api/mobile/session`, then clear token, keep salon); `void switchSalon()` (signOut + clearSalon → `needSalon`); `void onUnauthorized()` (clear token, keep salon → `needLogin`).

- [ ] **Step 1: Failing tests** (fake adapter + `MemorySecureStore`): `boot with nothing → needSalon`; `boot with salon only → needLogin`; `signIn saves token and me → signedIn`; `wrong password surfaces server text, no token saved`; `401 clears token keeps salon`; `switchSalon clears both`; `signOut calls both deletes even if offline`.
- [ ] **Step 2–4:** `flutter test test/core/auth_controller_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): remembered sign-in`.

### Task 11: Feature registry and shell

**Files:**
- Create: `lib/core/features/feature_module.dart`, `lib/core/features/registry.dart`, `lib/core/features/feature_gate.dart`
- Create: `lib/shell/shell.dart` (bottom tabs + "More" sheet), `lib/modules/home/home_module.dart` (Stage 1 placeholder "Today" showing salon name, user name, `today`), `lib/modules/account/account_module.dart` (theme mode, biometric toggle slot, sign out, switch salon)
- Test: `test/core/registry_test.dart`, `test/shell_test.dart`

**Interfaces:**
- `class FeatureModule { final String id; final String? featureKey; final Set<Role> roles; final String title; final IconData icon; final bool tab; final int order; final bool Function(Me me)? visibleWhen; final WidgetBuilder builder; }`
- `class FeatureRegistry { FeatureRegistry(List<FeatureModule> modules); List<FeatureModule> visibleFor(Me me); List<FeatureModule> tabsFor(Me me); FeatureModule? byId(String id); }` — visible = (`featureKey == null || me.features.contains(featureKey)`) && `roles.contains(me.role)` && (`visibleWhen?.call(me) ?? true`), sorted by `order`. At most 4 tabs; extra tab modules and all non-tab modules go under "More" (the 5th tab).
- `lib/modules/modules.dart` exports `final appModules = <FeatureModule>[...]` — the single list later stages append to.
- `FeatureGate(id: ..., child: ...)` shows "This feature isn't on for your salon" + "Back to home" when not visible.
- Live switches: `AuthController.refreshMe()` is called on `AppLifecycleState.resumed` and when any call throws `FeatureDisabled`; if the current module is no longer visible, the shell goes to home and shows a snackbar `That feature was switched off for your salon`.

- [ ] **Step 1: Failing tests:** `hides module whose key is off`; `hides admin-only module from barber`; `visibleWhen applies`; `more than 4 tabs overflow to More`; widget test `switch turned off while open returns to home with message`.
- [ ] **Step 2–4:** `flutter test test/core/registry_test.dart test/shell_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): switch-driven shell`.

### Task 12: Salon ID and sign-in screens

**Files:**
- Create: `lib/auth_ui/splash_screen.dart`, `lib/auth_ui/salon_screen.dart`, `lib/auth_ui/login_screen.dart`, `lib/app.dart` (GetMaterialApp; routes by `AuthState`; shared-axis transitions from `animations`)
- Modify: `lib/main.dart`
- Test: `test/auth_ui_test.dart`

**Interfaces / copy (exact):**
- Salon screen: title `Enter your salon ID`, hint `e.g. supersalon`, helper `Your salon owner can tell you this.`; checks 400 ms after typing stops; found → logo (or initials tile) and name fade/scale in over 250 ms, button `Continue`; not found → `We couldn't find that salon. Check the ID with your salon owner.`; offline → `You're offline`.
- Login screen: the salon's logo + `Sign in to <name>`, fields `Username`, `Password` (show/hide), button `Sign in`, link `Not your salon?` → `switchSalon()`. Errors shown under the button in the server's words.
- Splash: remembered salon's logo, else the SalonKit mark; holds until `boot()` and the version check (Task 15) finish, minimum 400 ms, no maximum spinner beyond 10 s (then shows the offline state with `Try again`).

- [ ] **Step 1: Failing widget tests:** `typing an ID shows the salon after debounce`; `unknown ID shows not-found text`; `Continue opens sign-in branded with the salon`; `wrong password shows server text`; `Not your salon? goes back to the ID screen`; `reduce motion: no animation durations > 0` (pump with `MediaQueryData(disableAnimations: true)`).
- [ ] **Step 2–4:** `flutter test test/auth_ui_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): salon ID and branded sign-in`.

### Task 13: Offline bar

**Files:**
- Create: `lib/core/connectivity/connectivity_controller.dart`, `lib/core/connectivity/offline_bar.dart`
- Test: `test/core/offline_bar_test.dart`

**Interfaces:**
- `ConnectivityController extends GetxController { RxBool online; }` — offline when `connectivity_plus` reports none **or** a request throws `Offline`; back online when connectivity returns and `GET /api/health` on the salon host succeeds (retry every 5 s while offline).
- `OfflineBar` wraps the whole app (in `app.dart` builder): offline → dark bar `No internet connection` slides up from the bottom (250 ms); on return → green bar `Back online` for 2 s, then slides away. Never shown on first launch while still online.

- [ ] **Step 1: Failing widget tests:** `goes offline shows the dark bar`; `coming back shows Back online then hides after 2 s`; `Offline error from a request flips the bar`.
- [ ] **Step 2–4:** `flutter test test/core/offline_bar_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): YouTube-style offline bar`.

### Task 14: Fingerprint / Face ID lock

**Files:**
- Create: `lib/core/auth/biometric_service.dart` (`abstract class Biometrics { Future<bool> available(); Future<bool> authenticate(String reason); }` + `LocalAuthBiometrics`)
- Create: `lib/core/auth/lock_controller.dart`, `lib/auth_ui/lock_screen.dart`
- Modify: `lib/modules/account/account_module.dart` (toggle `Unlock with Face ID / fingerprint`, shown only when `available()`)
- Modify: iOS `Info.plist` `NSFaceIDUsageDescription` = `SalonKit uses Face ID to keep your salon's data private.`; Android `MainActivity` extends `FlutterFragmentActivity`, `USE_BIOMETRIC` permission.
- Test: `test/core/lock_test.dart`

**Interfaces:**
- `LockController`: pref `sk.biometric` (bool, default false). `Future<bool> enable()` succeeds only after a successful `authenticate`. Locked on cold start when enabled, and on resume after ≥ 5 minutes in background. Lock screen: salon logo, `Unlock` button, `Sign out` link. Phone passcode fallback allowed (`biometricOnly: false`).
- After first successful sign-in (Task 10), if `available()` and not yet asked, show a one-time sheet `Unlock faster next time?` with `Turn on` / `Not now` (pref `sk.biometric.asked`).

- [ ] **Step 1: Failing tests:** `enable needs a successful scan`; `cold start locked when on`; `resume after 4 min not locked, after 5 min locked`; `failed scan stays locked`; `toggle hidden when unavailable`.
- [ ] **Step 2–4:** `flutter test test/core/lock_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): optional biometric lock`.

### Task 15: App version check

**Files:**
- Create: `lib/core/version/version_check.dart`, `lib/core/version/update_screen.dart`
- Test: `test/core/version_test.dart`

**Interfaces:**
- `int compareVersions(String a, String b)` numeric per part (`1.10.0 > 1.9.0`).
- `enum UpdateNeed { none, optional, required }` and `UpdateNeed needFor(String current, AppConfig c)`.
- On splash: `GET /api/public/app-config?platform=<ios|android>` on `configBase()` (works before a salon is chosen). `required` → full-screen `Update SalonKit` / `This version is no longer supported. Update to keep using SalonKit.` with button `Update` (opens `storeUrl`), no way past. `optional` → dismissible banner `A new version of SalonKit is available` once per `latest_version` (pref `sk.update.dismissed`). A failed check never blocks the app.

- [ ] **Step 1: Failing tests:** `compareVersions numeric`; `needFor required/optional/none`; `required shows the blocking screen`; `failed check continues to the app`.
- [ ] **Step 2–4:** `flutter test test/core/version_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): forced and optional update prompts`.

### Task 16: Push notifications and crash reports

**Files:**
- Create: `lib/core/push/push_service.dart`, `lib/core/push/deep_link.dart`
- Modify: `lib/main.dart` (guarded `Firebase.initializeApp()` and Crashlytics wiring as in deHertz `lib/main.dart`; a missing config file disables both and never stops launch)
- Modify: `android/app/build.gradle.kts` (apply `com.google.gms.google-services` and Crashlytics plugins **only if** `google-services.json` exists), iOS capabilities (Push, Background modes → remote notifications)
- Create: `apps/mobile/README.md` (how to get the Firebase files from the existing SalonKit Firebase project, run against `wrangler dev`, build release)
- Test: `test/core/push_test.dart`

**Interfaces:**
- `PushService { Future<void> onSignedIn(Me me); Future<void> onSignedOut(); }` — when `me.features.contains('push')`: ask permission once (after the biometric sheet), get the FCM token, `POST /api/push/tokens {token}`; re-post on token refresh. Sign-out deletes it (Task 10 already calls the API; the service also deletes the local FCM token).
- `String? routeForPush(Map<String, dynamic> data, FeatureRegistry r, Me me)` — the server's `link`/`path` (e.g. `/announcements`) → module id; unknown or switched-off → home.
- Foreground pushes show a local notification via `flutter_local_notifications`; tap opens the route.
- Crashlytics: never attach tokens or request headers; user identifier = `<org slug>:<user id>`.

- [ ] **Step 1: Failing tests:** `no push feature → no permission ask, no token post`; `push on → token posted once`; `routeForPush maps /announcements and falls back to home when off`.
- [ ] **Step 2–4:** `flutter test test/core/push_test.dart`; FAIL then PASS.
- [ ] **Step 5:** Commit `feat(mobile): push notifications and crash reports`.

### Task 17: End-to-end check against a local API, then deploy the backend

**Files:**
- Create: `apps/mobile/integration_test/sign_in_test.dart`
- Create: `apps/mobile/tool/seed_dev_salon.sh` (creates salon `e2esalon`, owner `owner`/`pass1234`, barber `barber`/`pass1234` on the local D1 via `wrangler d1 execute salonkit-db --local`)

**Steps:**
- [ ] **Step 1:** Write `sign_in_test.dart`: enter `e2esalon` → salon shows → sign in as `barber` → home shows the barber's name and no admin-only modules → sign out → ID screen keeps `e2esalon` on the sign-in screen.
- [ ] **Step 2:** Run `cd apps/api && npx wrangler dev --local` (ROOT_DOMAIN empty), seed, then `cd apps/mobile && flutter test integration_test --dart-define=SK_DEV_HOST=http://127.0.0.1:8787` on the iOS simulator and on an Android emulator (`http://10.0.2.2:8787`). Expected: PASS on both.
- [ ] **Step 3:** Full suites: `npm test` in `apps/api` and `packages/features`; `flutter test && flutter analyze` in `apps/mobile`. Expected: all PASS, no analyzer issues.
- [ ] **Step 4:** Deploy the backend: `wrangler d1 migrations apply salonkit-db --remote`, then build web and deploy API (Global Constraints). Smoke: `curl https://admin.salonkit.online/api/public/app-config?platform=android` → seeded JSON; a mobile sign-in to the `mcptest` salon from the simulator with `SK_ROOT_DOMAIN` default works and `/api/me` returns 200.
- [ ] **Step 5:** Commit `test(mobile): end-to-end sign-in`; merge to main and push.

## Not in Stage 1

Barber screens (Stage 2), admin screens (3–4), Atlantic Portal UI, bundles, silent `features_changed` push (5), store listing and signing (end of Stage 2).
