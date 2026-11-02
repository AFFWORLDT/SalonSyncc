# Plan 4: Signup Site and Self-Serve Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A salon owner opens `salonkit.online`, reads the pitch and pricing, and signs up. Within a minute they land signed in on `<slug>.salonkit.online` with a 7-day Pro Max trial and a setup checklist.

**Architecture:**
- **New marketing site:** `apps/site` is a Next static export served by its own assets-only Worker, `salonkit-site`, on `salonkit.online/*` and `www.salonkit.online/*`.
- **One API Worker:** the more specific route `salonkit.online/api/*` goes to the existing `salonkit-app` Worker, so the signup form posts same-origin.
- **Atomic signup:** signup is one D1 batch (all or nothing).
- **Login handoff:** the site redirects to the new subdomain with a single-use 120-second handoff token, which the dashboard exchanges for a session.

**Tech Stack:**
- Next 16 static export, Tailwind 4, `@paper-design/shaders-react` for the hero mesh.
- The deHertz Type footer (`doodle-crew-footer.tsx`, self-contained).
- Hono and D1 on the API side, Cloudflare Turnstile (optional, see Global Constraints).
- vitest for tests.

**Spec:** `docs/superpowers/specs/2026-11-02-salonsync-saas-design.md`: §10 (signup flow), §8 (per-salon defaults), §6 (trial), §12 P3.

**Design memory:** cream `#F6F2E9` with deep green `#1F7A6A` and gold glows. Glassmorphism. The hero is the type.dehertz.com moving mesh, with colours `["#0f2e29","#1d4a42","#1f7a6a","#2a9d88","#b8935a"]`, the SalonKit icon in a pulsing ring, and a big headline. The footer is the deHertz Type doodle footer with the wordmark `SALONKIT`. Reference code: `/Users/laxmikant/Desktop/ERP/dehertz/dehertz-type/web/src/components/{hero.tsx,home-footer.tsx,ui/shader-backdrop.tsx,ui/doodle-crew-footer.tsx}`.

## Global Constraints

- **Brand:** SalonKit, from `BRAND_NAME` and `NEXT_PUBLIC_BRAND_NAME`. Root domain `salonkit.online` via `ROOT_DOMAIN` and `NEXT_PUBLIC_ROOT_DOMAIN`. Never hardcode either in site logic.
- **Secrets:** never commit them. `npm test` runs `scripts/secret-scan.mjs`.
  - The Turnstile secret is a Worker secret, `TURNSTILE_SECRET`.
  - The site key is build env, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. It is public, but it still lives in env, not source.
- **Turnstile:**
  - When `TURNSTILE_SECRET` is unset, signup skips the check. The IP rate limit still applies.
  - When it is set, a missing or invalid token gets 400 "Please complete the check".
- **Slug:**
  - Lowercase `a-z0-9-`, 3–30 chars, no leading or trailing `-`. Use `normalizeSlug`/`isValidSlug` in `core/tenant.ts`.
  - Must not be in `reserved_slugs` and must not be taken. A slug freed by a delete stays reserved for 30 days; that comes with deletes in Plan 6.
- **Signup is one `DB.batch`:**
  - It inserts `orgs` (status `trial`, plan `pro_max`, `trial_ends_at` = now + 7 d, `grace_ends_at` = now + 14 d), `org_settings` (country defaults), the owner `users` row, `orgs.owner_user_id`, and the handoff token.
  - Any failure leaves no rows.
- **Rate limit:** at most 5 signups per IP per hour (`rate_hits`) and 30 slug checks per IP per minute. Use the existing `publicRateLimit` with new limit keys.
- **Free-plan budget:** signup at most 12 D1 statements and 1 subrequest (Turnstile).
- **Passwords:** at least 8 characters for the owner at signup. Login stays as it is.
- **Email:** collected and stored on `orgs.owner_email`. The welcome email is not sent in this plan (Plan 6, `email_log`). The success screen shows the salon link and Salon ID instead.
- **Accounts and deploys:** wrangler uses only `XDG_CONFIG_HOME=/Users/laxmikant/.wrangler-affworld`. Deploys need the user's OK. DNS records are added by the user, because the CLI token can't write DNS.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Two people sign up for the same slug at the same moment.** Exactly one succeeds. The other gets 409 "That salon ID is taken" and no partial rows. Covered in Task 1.
2. **A handoff link opened twice, after 120 s, or on another salon's host.** It is refused (401) and never makes a session. Covered in Task 1.
3. **A signup from India, Saudi Arabia, the UK or an unknown country.** It gets a sensible currency, time zone and phone code: unknown falls back to AE defaults, and the owner can change them in Settings. Covered in Task 1.
4. **The site on a phone at 390 px.** The hero, pricing, signup form and footer are readable and nothing scrolls sideways. The footer wordmark scales down. Covered in Task 4 via a Playwright screenshot.
5. **Turnstile unset vs set.** With it unset, signup works locally and the rate limit protects it. With it set, a bad token is refused. Covered in Task 1.

---

### Task 1: Signup API

**Files:**
- `apps/api/migrations/0011_signup.sql`
- `src/platform/signup.ts`
- `src/lib/countries.ts`
- `src/data/platform.ts` (signup batch, slug check, handoff)
- `src/core/services.ts` (`turnstile.verify` seam)
- `src/env.ts` (`TURNSTILE_SECRET?`)
- `src/index.ts` (mount)
- Test: `apps/api/test/signup.test.ts`

**Interfaces:**
- **Migration:**
  - `ALTER TABLE orgs ADD COLUMN owner_email TEXT`
  - `ALTER TABLE orgs ADD COLUMN owner_phone TEXT`
  - `CREATE TABLE login_handoffs(token_hash TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id), user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)`
- **`GET /api/public/slug?s=`** returns `{ slug, available: boolean, reason?: "invalid" | "reserved" | "taken" }`.
- **`POST /api/public/signup`** takes `{ salon_name, slug, owner_name, email, phone, password, country, turnstile? }` and returns 201 `{ slug, handoff_url }`.
  - `handoff_url` = `https://<slug>.<ROOT_DOMAIN>/login/?handoff=<token>`. When `ROOT_DOMAIN` is empty it is `/login/?org=<slug>&handoff=<token>`.
  - originGuard applies (same-origin from the site).
- **`POST /api/auth/handoff`** takes `{ token }` on the tenant host and returns `{ ok, slug }`.
  - It sets `ss_session`.
  - Single use: an `UPDATE … SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING`.
  - The token's org must equal the host org (or the body `org` on workers.dev).
- **`countryDefaults(cc)`** returns `{ currency, timezone, locale, phone_country }` for AE, SA, QA, KW, OM, BH, IN, PK, BD, GB, US and EG, with AE for anything else.
  - `bill_prefix` = the first 3 alphanumerics of the slug, upper-cased.

- [ ] **Step 1: Write the failing tests.**
  - The slug check returns available, taken, reserved (`admin`) and invalid (`a`, `-ab`, `Ab_c`).
  - **Signup:** 201 with `handoff_url`. The org is trial / pro_max with trial and grace ends 7 and 14 days out. The owner role is `owner` and the settings come from the country (IN gives INR, Asia/Kolkata, 91).
  - **Duplicate slug:** two concurrent signups give one 201 and one 409. Row counts show nothing partial.
  - **All or nothing:** a batch failure (proxy throws on batch) leaves 0 rows in orgs, users and org_settings.
  - **Validation:** a bad email, an 7-character password, or a missing salon name gives 400.
  - **Rate limit:** the 6th signup from one IP within an hour gets 429.
  - **Turnstile:** with `TURNSTILE_SECRET` set and FakeTurnstile false, 400. When unset it passes.
  - **Handoff:** works once, then 401. Expired gives 401. Another org's host gives 401 `wrong_org`. After a handoff, `/api/me` works.
  - Statement count for a signup is at most 12.
  - The route-enumeration test lists the new public routes.
- [ ] **Steps 2–4:** RED, implement, GREEN. Run `npm test` from the root.
- [ ] **Step 5:** Commit `feat(api): self-serve signup, slug check and login handoff`.

### Task 2: Dashboard: handoff login and setup checklist

**Files:**
- `apps/web/src/app/login/page.tsx` (handoff)
- `apps/web/src/components/app/setup-checklist.tsx`
- `admin-dashboard.tsx`
- `apps/api/src/tenant/settings/routes.ts` (`GET /api/setup`)
- Tests: `apps/web/test/handoff.test.tsx`, `apps/api/test/setup.test.ts`

**Interfaces:**
- **`GET /api/setup`** (owner/admin) returns `{ logo: boolean, services: boolean, staff: boolean, vat: boolean, google_review: boolean }`, in at most 2 statements.
- **Handoff on the login page:** with `?handoff=`, the page POSTs `/api/auth/handoff`, calls `refresh()` and goes to `/`. On failure it shows "This sign-in link has expired. Sign in with your password." and the form.
- **The checklist:**
  - Shown on the dashboard for owner and admin until every item is done or it is dismissed (`ss_setup_dismissed:<slug>`).
  - Each item links to the page that does it (Settings, Services, Staff, Settings → VAT, Settings → Reviews).

- [ ] **Step 1: Write the failing tests.**
  - A handoff success calls refresh and leaves the form hidden. A failure shows the message.
  - The checklist hides done items and disappears when everything is done.
  - `/api/setup` gives the right booleans and is cross-org safe (registry case).
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5:** Commit `feat(web): signup handoff and setup checklist`.

### Task 3: Scaffold `apps/site`

**Files:**
- `apps/site/`: `package.json` (`@ss/site`), `next.config.ts` (export, trailing slash, dev rewrite `/api` → 8787), `tsconfig.json`, `postcss.config.mjs`, `vitest.config.ts`
- `src/app/{layout.tsx,globals.css}`, `src/lib/brand.ts`
- `src/components/ui/{button,input,label,card}.tsx` (copied from apps/web)
- `public/` (favicon, icons, brand logo, copied from apps/web)
- `wrangler.jsonc` (Worker `salonkit-site`, assets `./out`, `not_found_handling: "404-page"`, routes `salonkit.online/*` and `www.salonkit.online/*`)
- Test: `apps/site/test/brand-guard.test.ts` (same rules as web)

**Interfaces:**
- `apps/api/wrangler.jsonc` adds the route `{ "pattern": "salonkit.online/api/*", "zone_name": "salonkit.online" }`.
- The site theme tokens use the cream palette (canvas `#F6F2E9`, tile `#FFFDF8`, ink `#1C1B18`, accent `#1F7A6A`), with glass utilities as in apps/web.

- [ ] **Step 1:** `npm run build -w @ss/site` produces `apps/site/out/index.html`, and the brand guard passes.
- [ ] **Step 2:** Root `npm test` and `npm run typecheck` pass.
- [ ] **Step 3:** Commit `feat(site): scaffold the SalonKit marketing site`.

### Task 4: Landing page: hero, features, pricing, footer, sign-in

**Files:**
- `apps/site/src/app/page.tsx`, `src/app/pricing/page.tsx`, `src/app/login/page.tsx`
- `src/components/{hero.tsx,features.tsx,pricing.tsx,site-footer.tsx,ui/shader-backdrop.tsx,ui/doodle-crew-footer.tsx}`
- Test: `apps/site/test/pages.test.tsx`

**Interfaces:**
- **Hero:**
  - The ShaderBackdrop mesh, using the colours from the design memory.
  - The SalonKit icon in a PulsingRing.
  - Headline "Run your salon. We'll keep the books."
  - A subline about sales, bills, staff commission, WhatsApp and reports.
  - Buttons: "Start free trial" (`/signup/`) and "Sign in" (`/login/`).
  - The note "7 days free · No card needed".
- **Features:** six glass cards: sales and bills, staff commission and payouts, daily sheet and Excel, WhatsApp bills and reminders, ratings and Google reviews, works for any country and currency.
- **Pricing:**
  - Built from `PLAN_DEFAULTS` (`@ss/features`): Free, Pro AED 200, Pro Max AED 499, with feature lists from `FEATURE_LABELS`. Move that from web into `@ss/features` so both apps share it.
  - The line "Other plans: talk to us".
- **Footer:** the doodle crew footer.
  - Wordmark `SALONKIT`, cream palette.
  - Columns: Product (Start free trial, Sign in, Pricing), Help (Support `mailto:` `NEXT_PUBLIC_SUPPORT_EMAIL`, Privacy), Company (AFFWORLD FZ-LLC).
  - Salon-themed crew lines.
  - Copyright "© <year> AFFWORLD FZ-LLC".
- **Sign-in page:** a Salon ID field that redirects to `https://<slug>.<ROOT_DOMAIN>/login/`.

- [ ] **Step 1: Write the failing tests.**
  - Pricing renders the three plans with prices from `PLAN_DEFAULTS`.
  - Sign-in builds the right subdomain URL and rejects an invalid ID.
  - The footer has the Start free trial link.
- [ ] **Steps 2–4:** RED, implement, GREEN. Also take a Playwright screenshot at 1280 and 390 px and review it.
- [ ] **Step 5:** Commit `feat(site): landing page, pricing and footer`.

### Task 5: Signup page

**Files:**
- `apps/site/src/app/signup/page.tsx`
- `src/components/signup-form.tsx`
- `src/lib/turnstile.ts`
- Test: `apps/site/test/signup.test.tsx`

**Interfaces:**
- **Fields:** salon name, Salon ID, owner name, email, mobile, country (select, AE default), password (8+, with a show/hide toggle).
  - The Salon ID is suggested from the salon name and live-checked against `GET /api/public/slug`, debounced 400 ms. It shows "✓ <slug>.salonkit.online is yours" or the reason.
- **Turnstile:** the widget renders only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set.
- **Submit:** POST `/api/public/signup`, then `window.location.assign(handoff_url)`. Errors show inline (409 taken, 429, 400).
- **Look:** a glass card over the mesh background, plus the plan summary "7-day Pro Max trial, then pick a plan".

- [ ] **Step 1: Write the failing tests.**
  - "Beard & Co. Salon" suggests the ID `beard-co-salon`.
  - The availability message updates after the debounce.
  - The submit body is exactly the API shape.
  - A 409 shows "That salon ID is taken".
  - With no site key there is no Turnstile script.
- [ ] **Steps 2–4:** RED, implement, GREEN.
- [ ] **Step 5:** Commit `feat(site): signup form with live Salon ID check`.

### Task 6: Serving, end-to-end, docs

**Files:**
- `apps/web/e2e/signup.spec.ts`
- Root `package.json` (`build:site`)
- `README.md`
- `docs/superpowers/plans/2026-11-02-plan-1-followups.md`

**Interfaces:**
- **Local end-to-end run:**
  1. The API's `wrangler dev` serves the dashboard.
  2. The test POSTs `/api/public/signup` (same-origin) with a new slug.
  3. It opens `handoff_url` on `localhost:8787/login/?org=<slug>&handoff=…`.
  4. It is signed in, sees the trial banner and the setup checklist.
  5. Opening the same handoff again fails.
- **README:**
  - The site Worker and routes.
  - The DNS records the user adds: apex `salonkit.online` AAAA `100::` and `www` AAAA `100::`, both proxied.
  - The Turnstile setup: create a widget for `salonkit.online`, then `wrangler secret put TURNSTILE_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in `apps/site/.env.production.local` (gitignored).
  - The deploy commands.

- [ ] **Step 1:** Write the e2e test and run it. Expected: PASS.
- [ ] **Step 2:** Root `npm test`, `npm run typecheck` and both builds pass.
- [ ] **Step 3:** Commit `test: signup end-to-end and site docs`.

## Done when

- Tests, typecheck and both builds pass, and the signup e2e passes locally.
- A new salon is signed in on its subdomain within a minute of submitting.
- A failed signup leaves nothing behind.
- The site matches the design memory: cream and green, the hero mesh and the doodle footer.
- Deploying `salonkit-site` and the new API route waits for the user's OK and their apex and www DNS records.
