# SalonStation Plan 2b: WhatsApp, Push, Notifications, Announcements, Ratings, Audit Viewer, Cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port FM Salon's engagement features to multi-tenant SalonStation, each salon with its own data, credentials and timezone, and all of it running on the **Workers free plan**. The features are WhatsApp (bills, PDF bill, visit reminders, rating requests, campaigns, webhook), push notifications with an in-app notification feed, staff announcements, customer ratings with the Google-review redirect, the audit viewer, and the hourly cron.

**Architecture:**
- **Same layout as Plan 2a:** SQL lives in `src/data/tenant/*`, routes in `src/tenant/<module>/routes.ts` behind per-route `requireFeature`, and public pages on `publicApi`.
- **Network clients are injected so tests never hit the network:**
  - WhatsApp goes through `WaClient` (Graph API), which Plan 2b adds.
  - Push goes through `PushClient` (FCM HTTP v1).
  - Both are reachable through a single seam `services(env)` that tests replace with fakes.
- **Cron:** one `scheduled()` loops over orgs in each org's own local hour. A **global per-invocation subrequest budget** keeps it inside the free plan's limit.

**Tech Stack:** As Plan 2a. Adds `pdf-lib` (as FM does) for the PDF bill. Web Crypto handles AES-GCM token encryption and the RS256 FCM JWT.

**Spec:** `docs/superpowers/specs/2026-11-02-salonsync-saas-design.md`. Read §9, D19 (free plan) and §7.1 (feature keys).

**References (read before every task):**
- `docs/superpowers/research/2026-11-02-fm-port-inventory.md`: §1 tables, §2.2 / §2.6 / §2.1 routes, §3 (push.ts, pdf.ts, whatsapp.ts, wa-jobs.ts, wa-sql.ts), §5 cron, §8 hazards 2, 5–8, 11–13, 15.
- `docs/superpowers/plans/2026-11-02-plan-2a-rulings.md`
- `docs/superpowers/plans/2026-11-02-plan-1-followups.md`, the "Carried into Plan 2b" section.
- FM source (read-only): `/Users/laxmikant/Desktop/ERP/gents-salon/api/src/`

## Global Constraints

- **Everything from Plans 1 and 2a still applies:**
  - Affworld0 only; no deploy.
  - `org_id` on every tenant row; composite FKs; no `MAX(id)` (use `uid` plus a subselect).
  - SQL only in `src/data/tenant/*`; the SQL guard covers it.
  - Every id-taking tenant route gets a cross-org case.
  - The optimistic-concurrency pattern applies to any edit that reverses the ledger. None are expected in 2b.
  - Org clock and money helpers from `src/lib`.
- **Free plan (D19):**
  - Keep per-request CPU low.
  - **No Queues.**
  - **At most 40 outbound subrequests per cron invocation, across all orgs.** Constant `CRON_BUDGET = 40`, checked before every send.
  - Interactive admin batches (campaign "next", manual job runs) stay at FM's **40 per call**.
  - The FCM OAuth token is cached per isolate, as in FM.
- **Feature keys:**

  | Key | Covers |
  |---|---|
  | `whatsapp` | Bills, PDF bill, reminders, rating requests, opt-out, webhook processing, manual job runs |
  | `whatsapp_campaigns` | Templates, media, audience, test send, campaigns |
  | `push` | Push tokens, notification feed, FCM sends, end-of-day summary, barber reminder |
  | `announcements` | Staff announcements |
  | `ratings` | Rating page, Google-review redirect, ratings report |
  | `audit_log` | Audit viewer and sale history |

  Jobs and hooks silently skip an org that lacks the feature.
- **WhatsApp credentials are per org,** in table `org_whatsapp`:
  - `phone_number_id` is globally UNIQUE, because the webhook resolves the org from it.
  - `token_enc` is AES-GCM encrypted with secret `SECRETS_KEY` (base64, 32 bytes). The plaintext token is never logged or returned.
  - A salon is "WA-ready" when it has a row **and** the `whatsapp` feature.
- **Single Meta app:**
  - `WA_APP_SECRET`: webhook signature check. It is **required**; without it the webhook POST answers 503.
  - `WA_VERIFY_TOKEN`: webhook GET handshake. It must match, otherwise 403.
- **Template names are per-org settings,** defaulting to SalonStation names:

  | Setting | Default |
  |---|---|
  | bill | `ss_bill` |
  | bill PDF | `ss_bill_pdf` |
  | rating | `ss_rating` |
  | rating reminder | `ss_rating_reminder` |
  | visit reminder | `ss_fresh_cut` |
  | language | `en` |

  The FM org (Plan 2c) stores its `fm_*` names. FM's legacy `fm_feedback*` string compare is dropped.
- **Links in messages:** `orgAppUrl(env, org)` returns `https://<slug>.<ROOT_DOMAIN>` when `ROOT_DOMAIN` is set, otherwise `env.APP_ORIGIN` (a new var).
  - Receipt link: `${orgAppUrl}/r/?t=<token>`
  - Rating link: `${orgAppUrl}/rate/?t=<token>`
  - FM's `PROD_URL` staging hack is **not** ported.
- **Pictures:** template header images come from per-org settings `wa_rating_image_url`, `wa_rating_reminder_image_url` and `wa_fresh_cut_image_url`. They default to `${APP_ORIGIN}/wa/{rating,rating-reminder,fresh-cut}.jpg`, which Plan 3 ships as generic SalonStation images.
- **Push:**
  - One FCM project for all salons, secret `FCM_SERVICE_ACCOUNT`.
  - Every recipient list is org-scoped, so `adminIds(orgId)` returns that org's active owner and admins only.
  - Push sends happen only when the org has `push`. Notification rows are recorded only then too.
- **Org hour:** comes from `localHour(at, clockOf(settings))`. FM's `UTC + 4` is gone.
- **Webhook and cron run with no session.** Every statement they issue is still org-scoped. Their org comes from `phone_number_id` (webhook) or from the cron org loop.

## Review Focus

1. **Webhook from salon A's number** cannot change salon B's messages or opt-outs (FM hazard 8). That holds even when both salons have a customer with the same phone, or a `wa_id` collision.
2. **Cron fairness and budget:**
   - With 30 WA-ready orgs, one invocation never makes more than 40 subrequests.
   - Each hour starts at a different org (a rotating offset), so no org is starved for more than ⌈orgs/…⌉ hours.
   - An org's jobs run at **its** local hour.
3. **Opt-out respected everywhere:** bills, reminders, rating requests and campaigns never message an opted-out customer of that org. Opting out in salon A does not opt the same phone out in salon B.
4. **Credentials never leak:**
   - `GET /api/settings` and `GET /api/me` expose `wa_ready: boolean`, never the token.
   - Errors from the Graph API are stored without the token.
   - The token at rest is ciphertext.
5. **Push and announcement recipients** are always in the sender's org. A barber can't send an announcement. A low-star rating alerts only that org's admins.

Each has tests in its owning task, marked **(RF1)–(RF5)**.

---

## File Structure (new or changed)

```
apps/api/migrations/0009_engagement.sql   org_settings wa_*/image cols; org_whatsapp, org_assets, push_tokens,
                                          notifications, announcements, ratings, wa_campaigns, wa_messages
apps/api/src/lib/secrets.ts               encryptSecret / decryptSecret (AES-GCM, SECRETS_KEY)
apps/api/src/lib/whatsapp.ts              FM pure helpers (templateVars, templateSlots, waRecipient(phone, cc), firstName,
                                          bodyParams, templateComponents, previewText, webhookEvents, validSignature, visitTime(at, clock))
apps/api/src/lib/pdf.ts                   billPdf(receipt, branding) (port of FM pdf.ts; org logo/currency/tz)
apps/api/src/core/services.ts             services(env): { wa: WaClient, push: PushClient } — replaceable in tests
apps/api/src/core/links.ts                orgAppUrl(env, org)
apps/api/src/integrations/wa-client.ts    Graph API client (sendTemplate, uploadMedia, listTemplates, createTemplate)
apps/api/src/integrations/push-client.ts  FCM v1 client (JWT RS256, token cache)
apps/api/src/data/tenant/{whatsapp,notifications,announcements,ratings,audit-view,assets}.ts
apps/api/src/tenant/{audit,notifications,announcements,ratings,whatsapp,campaigns}/routes.ts
apps/api/src/jobs/{hourly,wa-jobs,push-jobs,prune}.ts
apps/api/src/index.ts                     export default { fetch, scheduled }
apps/api/wrangler.jsonc                   triggers.crons ["0 * * * *"]; vars APP_ORIGIN; secret names documented
apps/api/test/fakes.ts                    FakeWa / FakePush recording calls
```

---

### Task 1: Groundwork: schema 0009, secrets, services seam, links, org logo, sale hooks

**Files:**
- Create: `migrations/0009_engagement.sql`, `src/lib/secrets.ts`, `src/core/services.ts`, `src/core/links.ts`, `src/data/tenant/assets.ts`, `test/fakes.ts`
- Modify:
  - `src/env.ts`: add `SECRETS_KEY`, `FCM_SERVICE_ACCOUNT?`, `WA_APP_SECRET?`, `WA_VERIFY_TOKEN?`, `APP_ORIGIN`.
  - `src/tenant/sales/hooks.ts`: add `afterSaleEdit(c, before, after)` and `afterSaleDelete(c, sale)`, both no-op by default. Call them from Plan 2a's PUT/DELETE, wrapped like `afterSale`, and only when the write took effect.
  - `src/tenant/settings/routes.ts`: new WA settings fields, the logo routes, and `wa_ready`.
  - `wrangler.jsonc`, vitest config (test bindings for the new secrets).

**Interfaces:**
- **Migration 0009:**
  - `org_settings` ADD:
    - `wa_bill_auto INTEGER NOT NULL DEFAULT 0`
    - `wa_bill_template TEXT NOT NULL DEFAULT 'ss_bill'`
    - `wa_bill_pdf_template TEXT NOT NULL DEFAULT 'ss_bill_pdf'`
    - `wa_reminder_enabled INTEGER NOT NULL DEFAULT 0`
    - `wa_reminder_days INTEGER NOT NULL DEFAULT 15`
    - `wa_reminder_hour INTEGER NOT NULL DEFAULT 11`
    - `wa_reminder_template TEXT NOT NULL DEFAULT 'ss_fresh_cut'`
    - `wa_language TEXT NOT NULL DEFAULT 'en'`
    - `wa_feedback_enabled INTEGER NOT NULL DEFAULT 0`
    - `wa_feedback_delay_min INTEGER NOT NULL DEFAULT 0`
    - `wa_feedback_template TEXT NOT NULL DEFAULT 'ss_rating'`
    - `wa_feedback_reminder_min INTEGER NOT NULL DEFAULT 120`
    - `wa_feedback_reminder_template TEXT NOT NULL DEFAULT 'ss_rating_reminder'`
    - `wa_rating_image_url TEXT`, `wa_rating_reminder_image_url TEXT`, `wa_fresh_cut_image_url TEXT`
  - Tables:
    - `org_whatsapp(org_id TEXT PRIMARY KEY REFERENCES orgs(id), phone_number_id TEXT NOT NULL UNIQUE, waba_id TEXT NOT NULL, token_enc TEXT NOT NULL, test_numbers TEXT, updated_at INTEGER NOT NULL)`
    - `org_assets(org_id, kind TEXT CHECK(kind IN ('logo')), bytes BLOB NOT NULL, type TEXT NOT NULL, v INTEGER NOT NULL, PRIMARY KEY(org_id, kind))`
    - `push_tokens`, `notifications`, `announcements`, `ratings`, `wa_campaigns`, `wa_messages`: INV §1 final DDL plus `org_id`, with composite FKs to users, customers, sales and campaigns. Use FM's final `wa_messages` shape directly; don't replay the 0016 rebuild.
      - `wa_campaigns.uid` with `UNIQUE(org_id, uid)`.
      - Indexes lead with `org_id`.
      - `wa_messages`: index `(org_id, wa_id)`.
      - `push_tokens.token` stays the PRIMARY KEY (device-global, follows sign-in), with an `org_id` column.
      - `ratings`: `UNIQUE(org_id, sale_id)`.
- **Secrets** (`lib/secrets.ts`):
  - `encryptSecret(plain, keyB64): Promise<string>` returns `v1.<b64 iv>.<b64 ct>`.
  - `decryptSecret(enc, keyB64): Promise<string>`.
  - An unknown version or bad key throws.
- **Services seam** (`core/services.ts`):
  - `interface WaClient { sendTemplate(cfg, phone, template, lang, params): Promise<SendResult>; uploadMedia(cfg, file); listTemplates(cfg); createTemplate(cfg, input) }`
  - `cfg = { phoneNumberId, wabaId, token }`
  - `interface PushClient { send(env, tokens: string[], push: Push): Promise<{ dead: string[] }> }`
  - `services(env)` returns the real clients. `setServicesForTest(fn)` swaps them in tests.
- **Links:** `orgAppUrl(env, org): string`.
- **Org logo:**
  - `PUT/DELETE /api/settings/logo` (admin; png/jpeg/webp up to 200 KB; `v` always increments and never resets, per the Plan 3 follow-up lesson).
  - `GET /api/public/logo/:v` uses `resolvePublicOrg` and `publicRateLimit("avatar")`, returns 404 if `v` doesn't match, and is immutable.
  - `settings.logo_url` becomes derived: `/api/public/logo/<v>?org=<slug>`, or null.
- **Settings:** `GET /api/settings` gains the WA fields and `wa_ready: boolean`. `PUT /api/settings` validates the new fields:
  - templates match `^[a-z0-9_]{1,64}$`
  - language matches `^[a-z]{2}(_[A-Z]{2})?$`
  - days 1–90, hours 0–23, minutes 0–1440
  - image URLs are https and at most 500 characters

- [ ] **Step 1: Write the failing tests.**
  - The secrets round-trip; tampered ciphertext throws.
  - Schema: unique `phone_number_id`; `ratings` is unique per sale per org.
  - `orgAppUrl` in both modes.
  - Logo:
    - upload, then serve
    - after a clear and a re-upload, `v` is greater than before
    - another org's host gets 404
  - Settings round-trip of the new fields; `wa_ready` is false without an `org_whatsapp` row.
  - `afterSaleEdit` and `afterSaleDelete` are called once on a successful PUT or DELETE, and not on a stale 409.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): engagement schema, secrets, services seam, org logo, sale hooks`.

---

### Task 2: Audit viewer

**Files:**
- Create: `src/data/tenant/audit-view.ts`, `src/tenant/audit/routes.ts`
- Test: `test/audit-view.test.ts`, plus cross-org cases

**Interfaces:**
- **Routes** (admin, feature `audit_log`), from FM routes.ts:1612-1671:
  - `GET /api/audit?entity&actor_id&from&to&q&page&page_size` returns `Paged<AuditEntry>`.
    - `from`/`to` are business days converted with `businessDayStart` from the org clock.
    - `q` is LIKE-escaped.
    - `page` uses `clampPage`.
    - Each entry carries `changed` from `changedFields`.
  - `GET /api/sales/:id/history` returns `AuditEntry[]` for that sale in this org, or 404 if the sale isn't in the org.

- [ ] **Step 1: Write the failing tests.**
  - Filters, paging and the clamp.
  - The `changed` fields are correct for a sale edit.
  - Org B sees none of A's entries.
  - A barber gets 403; a pro org (no `audit_log`) gets 403 `feature_disabled`.
  - Cross-org case for `GET /api/sales/:id/history`.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): audit viewer`.

---

### Task 3: Push client, push tokens, notification feed, sale notifications

**Files:**
- Create: `src/integrations/push-client.ts` (port of FM push.ts FCM v1 logic), `src/data/tenant/notifications.ts`, `src/tenant/notifications/routes.ts`
- Modify: `src/tenant/sales/hooks.ts` (fill `afterSale`, `afterSaleEdit`, `afterSaleDelete`)
- Test: `test/notifications.test.ts`

**Interfaces:**
- **Data layer:**
  - `notificationsRepo(db, orgId).adminIds(except?)` returns active owner and admin ids **of this org** (RF5).
  - `.record(userIds, push)`
  - `.tokensFor(userIds)`
  - `.deleteTokens(dead)`
- **Routes** (feature `push`):
  - `POST /api/push/tokens {token}` upserts, setting `org_id` and `user_id` to the session's (a device switching salons moves).
  - `DELETE /api/push/tokens {token}` deletes only that session user's token.
  - `GET /api/notifications` returns `NotificationFeed` with FM's limit and unread count.
  - `POST /api/notifications/read {ids?: number[]}` marks the given ids read, or all, for the session user only.
- **`notifyUsers(c|env, orgId, userIds, push)`:** records notification rows and sends via `services(env).push` when `FCM_SERVICE_ACCOUNT` is set. It removes dead tokens and never throws.
- **Hooks** (each wrapped; each skips when the org lacks `push`):
  - `afterSale`: when `notify_sales` is on and the amount ≥ `notify_sale_min`, notify the org's admins except the creator. Body text per FM routes.ts:798-809, with money formatted in the org's currency and locale.
  - `afterSaleEdit` / `afterSaleDelete`: when `notify_barber_changes` is on and an admin changed or deleted a barber's sale, notify that barber with FM's text.

- [ ] **Step 1: Write the failing tests** (use `FakePush`).
  - A sale by a barber notifies only org-A admins **(RF5)**.
  - Under the `notify_sale_min` threshold, nothing is sent.
  - An admin editing a barber's sale notifies that barber.
  - Dead tokens are deleted.
  - The feed and mark-read are scoped to the user and the org.
  - A free org (no `push`) gets 403 on the routes and no notification rows from sales.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): push, notifications, sale notifications`.

---

### Task 4: Announcements

**Files:**
- Create: `src/data/tenant/announcements.ts`, `src/tenant/announcements/routes.ts`
- Test: `test/announcements.test.ts`

**Interfaces:**
- **Routes** (admin, feature `announcements`), from FM routes.ts:483-530:
  - `GET /api/announcements` returns `Announcement[]`.
  - `POST /api/announcements {audience:"all"|"barber", target_id?, title, body}`.
    - `target_id` must be an active user of the same org, otherwise 400.
    - Records notification rows for the recipients and push-sends via `notifyUsers` only if the org also has `push`. Without `push`, it stores the announcement and notification rows anyway, so the feed shows them once push is enabled.
    - Returns 201 `Announcement` with `recipients`.

- [ ] **Step 1: Write the failing tests.**
  - "all" reaches only this org's active staff.
  - "barber" with a target in another org gets 400 **(RF5)**.
  - A barber gets 403.
  - A pro org without `announcements` gets 403 `feature_disabled`.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): announcements`.

---

### Task 5: Ratings: public feedback page, Google-review redirect, ratings report

**Files:**
- Create: `src/data/tenant/ratings.ts`, `src/tenant/ratings/routes.ts`
- Modify: `src/core/public.ts`
- Test: `test/ratings.test.ts`

**Interfaces:**
- **Public routes** (the org comes from the sale token's row, as with receipts; `publicRateLimit("pub")`; 404 unless the org has `ratings` and the sale is live):
  - `GET /api/public/feedback/:token` returns `FeedbackPage` (FM routes.ts:224-266): salon name, `firstName`, the existing rating, and `google_review_url`.
  - `POST /api/public/feedback/:token {stars 1–5, comment ≤ 500}` upserts on `(org_id, sale_id)`. When `stars ≤ 3` and the org has `push`, it notifies that org's admins (RF5).
  - `GET /api/public/review/:token` sets `review_clicked_at` (first click only) and 302-redirects to the org's `google_review_url`. If none is set, it redirects to `${orgAppUrl}/rate/?t=<token>`. FM's hardcoded fallback is removed.
- **`GET /api/ratings?from&to`** (admin, `ratings`) returns `RatingsReport`, per FM routes.ts:1556-1596, scoped by org.

- [ ] **Step 1: Write the failing tests.**
  - Submit a rating, then update it.
  - A low star alerts only org-A admins.
  - The review redirect records the click once and uses the org's URL.
  - An org without `ratings` gets 404 on the public pages and 403 on the report.
  - The report numbers are scoped by org.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): ratings and review redirect`.

---

### Task 6: WhatsApp core: pure helpers, Graph client, per-org credentials

**Files:**
- Create: `src/lib/whatsapp.ts`, `src/integrations/wa-client.ts`, `src/data/tenant/whatsapp.ts`, `src/tenant/whatsapp/routes.ts` (config routes only in this task)
- Test: port FM `whatsapp.test.ts` to `test/lib/whatsapp.test.ts`, plus `test/wa-config.test.ts`

**Interfaces:**
- **Pure helpers** (`lib/whatsapp.ts`): FM's helpers ported (INV §3), with these changes:
  - `waRecipient(phone, callingCode)` uses `lib/phone` `whatsappDigits`.
  - `visitTime(at, clock, locale)`.
  - `firstName` keeps "there" for `Customer N` labels.
  - `rateLinkSuffix` is removed.
- **Graph client** (`wa-client.ts`):
  - `GRAPH = "https://graph.facebook.com/v21.0"`.
  - `sendTemplate` never throws. It returns `{ok, waId?, error?}`, and any token text is stripped from `error`.
- **Data layer:** `waConfigRepo(db, orgId)`:
  - `get(): Promise<{phoneNumberId, wabaId, token, testNumbers}|null>` decrypts.
  - `set(input)` encrypts.
  - `clear()`.
  - `orgByPhoneNumberId(id)` is a platform-level lookup used only by the webhook.
- **Config routes** (owner or admin; feature `whatsapp`):
  - `PUT /api/whatsapp/config {phone_number_id, waba_id, token, test_numbers?}` validates the format and saves. It returns `{wa_ready:true}`, **never echoes the token**, and writes an audit row with the token redacted.
  - `DELETE /api/whatsapp/config`.
  - `GET /api/whatsapp/config` returns `{phone_number_id, waba_id, test_numbers, has_token:true}`.
  - Plan 5 adds a super admin view of the same data.
- **`waReady(c|env, org)`** is true when the org has the `whatsapp` feature and a config row.
- **`allowedRecipient(testNumbers, phone)`** keeps FM's test-number allow-list, now per org.

- [ ] **Step 1: Write the failing tests.**
  - FM's whatsapp.test cases ported. The 971 cases keep calling code `971`; add one Indian `91` case.
  - Config:
    - set, then get without the token
    - `token_enc` in the database is not the plaintext token **(RF4)**
    - another org's `phone_number_id` gets 409
    - a barber gets 403
    - a pro org (no `whatsapp`) gets 403
  - The token is redacted from the audit row and from a fake Graph error.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): whatsapp core and per-org credentials`.

---

### Task 7: WhatsApp bills, PDF bill, opt-out

**Files:**
- Create: `src/lib/pdf.ts` (port of FM pdf.ts plus its test)
- Modify: `src/tenant/whatsapp/routes.ts`, `src/core/public.ts`, `src/tenant/sales/hooks.ts`, `src/data/tenant/whatsapp.ts`
- Test: `test/wa-bill.test.ts`, `test/lib/pdf.test.ts`

**Interfaces:**
- **PDF:** `billPdf({receipt, branding:{logo?:Uint8Array, logoType?, instagram?, whatsapp?}, link})`.
  - Currency label from the org's `currency`.
  - Time zone and locale from the org.
  - The "TAX INVOICE"/TRN labels appear only when `vat_enabled`.
  - FM's embedded logo is replaced by the org logo from `org_assets`, or a text header when there is none.
  - Keep `pdfSafe` (WinAnsi).
- **`GET /api/public/bill/:token`** returns the PDF.
  - The org comes from the token row.
  - `publicRateLimit("pdf")`.
  - 404 when the org lacks `whatsapp` or the sale isn't live.
- **`sendBill(env, orgId, saleId, actorId)`**, the port of FM wa-jobs.ts:98-133:
  - Uses the per-org template (PDF template when `wa_bill_pdf_template` is set and a PDF link is used, FM rule).
  - Writes the `wa_messages` row.
  - Skips when the customer opted out (status `skipped`) **(RF3)**.
  - Skips when the test allow-list is set and the phone isn't on it.
- **Routes** (feature `whatsapp`):
  - `GET /api/sales/:id/whatsapp` returns the latest `WaMessage` or null.
  - `POST /api/sales/:id/whatsapp` sends the bill now. A barber may send only for their own sale; returns 409 when not WA-ready.
  - `PUT /api/customers/:id/whatsapp {opt_out:boolean}` (admin) writes an audit row and returns `Customer`.
- **`afterSale` hook:** when the org is WA-ready and `wa_bill_auto` is on, `sendBill`. When `wa_feedback_enabled` and `wa_feedback_delay_min === 0`, send the rating request inline (FM behaviour), via Task 9's `runFeedback(env, orgId, at, 1, saleId)`. Until Task 9 lands, leave a TODO.

- [ ] **Step 1: Write the failing tests** (use `FakeWa`).
  - Auto-bill sends exactly one template with the right params: name, bill number, amount in the org currency, receipt link from `orgAppUrl`.
  - An opted-out customer gets status `skipped` and no Graph call **(RF3)**.
  - Opting out a phone in org A leaves the same phone in org B opted in **(RF3)**.
  - The PDF renders `%PDF-` for an INR org with no VAT and contains no "TRN".
  - A barber posting for another barber's sale gets 403.
  - Cross-org cases for `GET`/`POST /api/sales/:id/whatsapp` and `PUT /api/customers/:id/whatsapp`.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): whatsapp bills, pdf bill, opt-out`.

---

### Task 8: WhatsApp webhook

**Files:**
- Modify: `src/core/public.ts` (or a dedicated `src/integrations/wa-webhook.ts` mounted at `/api/wa/webhook` outside `tenantGuard`), `src/data/tenant/whatsapp.ts`
- Test: `test/wa-webhook.test.ts`

**Interfaces:**
- **`GET /api/wa/webhook`** answers `hub.challenge` only when `hub.mode=subscribe` and `hub.verify_token === env.WA_VERIFY_TOKEN`. Otherwise 403. Fixes FM's "echo any challenge".
- **`POST /api/wa/webhook`:**
  - Requires `WA_APP_SECRET` (otherwise 503) and a valid `x-hub-signature-256` over the raw body (otherwise 401).
  - For each `entry[].changes[].value`, find the org via `value.metadata.phone_number_id` with `orgByPhoneNumberId`. **Ignore changes from unknown numbers or orgs without `whatsapp`.**
  - Status events update `wa_messages WHERE org_id = ? AND wa_id = ?` to `delivered_at`, `read_at`, or `failed` + error.
  - Inbound text "STOP"/"stop"/"unsubscribe" (FM's `webhookEvents` rules) sets `customers.wa_opt_out = 1 WHERE org_id = ? AND phone = canonicalPhone(from, phone_country)`.
  - Always answer 200 `"ok"` once the signature is valid.
- **Mounting:** the webhook route must not be a tenant route (no session). Add it to the enumeration test's explicit exclusion list by registration.

- [ ] **Step 1: Write the failing tests.**
  - A bad verify token gets 403; the right one echoes the challenge.
  - No secret gets 503; a bad signature gets 401.
  - **(RF1)** Orgs A and B each have customer `0501234567` and a `wa_messages` row with the same `wa_id`. A STOP plus a status event from A's `phone_number_id` changes only A's rows.
  - An unknown `phone_number_id` is a no-op 200.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): whatsapp webhook with per-org routing`.

---

### Task 9: WhatsApp jobs: visit reminders, rating requests, rating reminders

**Files:**
- Create: `src/jobs/wa-jobs.ts` (port of FM wa-jobs.ts `runReminders`, `runFeedback`, `runFeedbackReminders`, `logSend`, `servicesLine`), `src/data/tenant/wa-sql.ts` (port of FM wa-sql.ts with org params)
- Modify: `src/tenant/whatsapp/routes.ts`, the TODO in `src/tenant/sales/hooks.ts`
- Test: `test/wa-jobs.test.ts`, `test/wa-sql.test.ts` (against the real D1 schema, not an inline schema; INV §8.15)

**Interfaces:**
- **Job signatures:**
  - `runReminders(env, orgId, at, limit, budget)`
  - `runFeedback(env, orgId, at, limit, budget, saleId?)`
  - `runFeedbackReminders(env, orgId, at, limit, budget)`
  - Each returns `WaReminderRun {sent, failed, skipped}` and decrements a shared `budget: {left:number}` before every Graph call. When `left` reaches 0 it stops.
- **FM rules kept:**
  - Reminders fire exactly `wa_reminder_days` business days after `last_visit_at`, using the org clock's `businessDayStart`.
  - No reminder if one was already sent since the last visit.
  - Rating requests go out at most once per customer per 20 hours.
  - The rating reminder only applies if the request was sent and there is no rating and no review click.
  - `FEEDBACK_HOURS` is 9–22 in the **org's local hour**.
  - Opt-out and test allow-list are respected **(RF3)**.
- **SQL:** `wa-sql.ts` keeps FM's numbered-placeholder lesson. Every query binds `org_id`.
- **Manual routes** (admin, `whatsapp`): `POST /api/wa/reminders/run` and `POST /api/wa/feedback/run`, each with a budget of 40.

- [ ] **Step 1: Write the failing tests.**
  - The reminder-day window under the Kolkata clock.
  - An opted-out customer is not messaged.
  - One rating request per customer per 20 hours.
  - The rating reminder is suppressed after a rating or a review click.
  - The budget stops at exactly N sends.
  - Org B's due customers are never picked by org A's run.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): whatsapp reminder and rating jobs`.

---

### Task 10: WhatsApp campaigns

**Files:**
- Create: `src/tenant/campaigns/routes.ts`
- Modify: `src/data/tenant/whatsapp.ts`
- Test: `test/campaigns.test.ts`, plus cross-org cases

**Interfaces:**
- **Routes** (admin, feature `whatsapp_campaigns`, org must be WA-ready, otherwise 409), from FM routes.ts:1434-1554:
  - `GET`/`POST /api/wa/templates`
  - `POST /api/wa/test`
  - `GET /api/wa/audience` (customers of this org with a phone and not opted out)
  - `GET`/`POST /api/wa/campaigns`
  - `POST /api/wa/campaigns/:id/next` (drains 40)
  - `POST /api/wa/media` (jpg/png ≤ 5 MB, mp4 ≤ 16 MB)
- **Campaign create** uses `uid` and `(SELECT id FROM wa_campaigns WHERE org_id=? AND uid=?)` to insert the queued `wa_messages` rows. **No `MAX(id)`** (INV §8.2).
- **Drain claim** keeps FM's `sent_at` claim marker, org-scoped. A campaign is finished when no queued rows remain.

- [ ] **Step 1: Write the failing tests.**
  - Create a campaign: the queued count equals the audience size, and opted-out customers are excluded **(RF3)**.
  - `/next` sends 40, then the remainder; then `finished_at` is set.
  - Two concurrent `/next` calls never send the same message twice.
  - Parallel campaign creates across orgs get the right ids.
  - Cross-org cases for `POST /api/wa/campaigns/:id/next`.
  - A pro org without campaigns gets 403.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): whatsapp campaigns`.

---

### Task 11: Hourly cron: per-org schedule, budget, summaries, pruning

**Files:**
- Create: `src/jobs/hourly.ts`, `src/jobs/push-jobs.ts`, `src/jobs/prune.ts`
- Modify: `src/index.ts` (`export default { fetch: app.fetch, scheduled }`), `wrangler.jsonc` (crons)
- Test: `test/hourly.test.ts`

**Interfaces:**
- **`hourly(env, at)`:**
  1. **Prune:** delete `rate_hits` rows older than 5 minutes, and `login_failures` rows older than 24 hours.
  2. **Load orgs:** status in `trial`, `active`, `grace` or `past_due`, ordered by id, starting at offset `(hourIndex(at) * 7) % n` and wrapping round.
  3. **For each org:** compute its local hour, then, while the global `budget.left > 0`:
     1. finish one unfinished campaign (`whatsapp_campaigns`; drain up to `min(12, left)`);
     2. reminders when `wa_reminder_enabled` and `hour >= wa_reminder_hour`;
     3. rating requests and rating reminders when `wa_feedback_enabled` and the hour is in `FEEDBACK_HOURS`;
     4. push summary when `push` and `notify_summary` and `hour === summary_hour` (FM text via `overview`, money in the org currency);
     5. barber reminder when `push` and `notify_reminder` and `hour === reminder_hour`.
  4. Every step is wrapped in try/catch with `console.error`. One org failing never stops the others.
  5. Returns `{orgs, sent, budgetLeft}` for tests.
- **Constants:** `CRON_BUDGET = 40`. One FCM send to N tokens counts as 1 subrequest, plus 1 for the OAuth token on a cold isolate.
- **Wrangler:** `"triggers": {"crons": ["0 * * * *"]}`.

- [ ] **Step 1: Write the failing tests** (use the fakes and `vi.setSystemTime`).
  - A Dubai org gets its summary at 23:00 Dubai, and a Kolkata org at 23:00 IST, in different UTC invocations **(RF2)**.
  - With 30 WA-ready orgs each having due reminders, one invocation makes at most 40 fake sends **(RF2)**.
  - Over consecutive hours the starting org rotates and every org gets sends within ⌈30·k/40⌉ hours **(RF2)**.
  - An org without `whatsapp` makes no WA sends.
  - Expired or deactivated orgs are skipped.
  - Pruning removes old rows only.
  - One org throwing doesn't stop the next.
- [ ] **Steps 2–5:** RED, implement, GREEN, commit `feat(api): hourly cron with per-org schedule and free-plan budget`.

---

### Task 12: Sweep, seed, docs

**Files:**
- Modify: `test/cross-org-cases.ts` (any missing), `test/auth.test.ts` (webhook and public routes listed explicitly), `scripts/seed-local.sql` (bravo gets WA settings off, a few ratings and notifications; no `org_whatsapp` row), `README.md` (feature map, secrets list, the webhook URL to give Meta, a free-plan budget note), `docs/superpowers/plans/2026-11-02-plan-1-followups.md` (tick the Plan 2b items)
- Test: the existing ones

- [ ] **Step 1:** The registry-coverage test passes: every new `/:id` route has a case, and `MAX(id)` doesn't appear in `src/`.
- [ ] **Step 2:** Run the seed twice locally with `XDG_CONFIG_HOME=/Users/laxmikant/.wrangler-affworld`. No errors.
- [ ] **Step 3:** Run root `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 4:** Commit `test: plan 2b sweep, seed and docs`.

## Done when
- All tests and the typecheck pass.
- Every new id-taking route has a cross-org case.
- The webhook routes by `phone_number_id` with the signature required.
- Cron respects org hours and the 40-subrequest budget.
- No credential ever appears in a response, log or audit row.
- Plan 2c (FM import) can store FM's WhatsApp credentials and `fm_*` template names in `org_whatsapp` and `org_settings` without schema changes.
