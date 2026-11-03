# Plan 8 — FM Salon import (P1b) Implementation Plan

> Executed inline (user preference: fast, no subagent per task). The cutover (Task 4) is outward-facing and waits for the user's go.

**Goal:** Move FM Salon's production data from `fm-salon-db` into SalonKit as org `fm` (https://fmsalon.salonkit.online), with totals matching exactly, then point FM's old URL at the new one.

**Architecture:** A pure builder (`scripts/fm-import/build.ts`) turns FM rows into SalonKit SQL statements; a node CLI reads an FM export loaded into a local SQLite file and writes `import.sql`, `purge.sql`, and the totals queries. Every FM row id is shifted by a fixed `ID_OFFSET = 1_000_000` so FM rows cannot collide with other salons' rows and every reference (FKs, `ledger_entries.source_id`, `audit_log.entity_id`) maps with one rule. A tiny redirect Worker replaces `fm-salon` at cutover: 302 every path to `fmsalon.salonkit.online` and proxy the Meta webhook.

**Tech Stack:** TypeScript, node:sqlite (Node 24), wrangler d1, vitest (workers pool, real D1).

**Spec:** `docs/superpowers/specs/2026-11-02-salonsync-saas-design.md` §12 P1b, D16

## Global Constraints
- FM data never enters git or the chat: the export, the local SQLite copy and the generated SQL live only in the session scratchpad; scripts print counts and totals only.
- `fm-salon-db` is never written; rollback = redeploy FM's own Worker.
- Every statement < 90 000 bytes (D1 limit 100 KB); blobs (avatars ≤200 KB, logo) are written in chunks.
- Bill numbers, receipt tokens and the `FM` bill prefix are kept; counters are carried over.
- FM is on plan `pro_max`, `provider = manual`, status `active`, no period end.

## Review Focus
1. A reversal ledger line or a sale whose FK target is missing in FM → import must fail loudly, never silently drop rows.
2. VAT: FM stores a fraction (0.05), SalonKit a percent (5) — float noise (5.000000000000001) must not appear.
3. Ledger balances (shop cash/bank, each barber) after import equal FM's exactly.
4. A blob split across statements must round-trip byte for byte.
5. Purge removes every `org_fm` row, so a failed import can be retried.

## Tasks
1. **Builder + tests** — `buildFmImport(src, opts) → string[]`, `purgeSql(orgId)`, `totalsSql(side, orgId)`. Mapping: settings → `org_settings` (salon_name→display_name, phone→contact_phone, vat_rate×100 rounded to 2 dp, `bill_prefix 'FM'`, FM's `fm_*` template names kept, `wa_bill_pdf_template 'fm_bill_pdf'`), lowest-id active admin → `owner` + `orgs.owner_user_id`, `uid = 'fm-<id>'` where SalonKit needs one, counters `seq→value`, `sales.vat_rate×100`, avatars and logo chunked. Skipped: `push_tokens` (Firebase project changes), `login_failures`, `rate_hits`. Tests run the SQL on the test D1 and assert totals, FKs, VAT, owner, blob round-trip, purge.
2. **CLI** — `scripts/fm-import.ts <fm.sqlite> <outdir> [--logo file]` writes `import.sql`, `purge.sql`, `totals-fm.json` (from the source) and `totals.sql` (run on the target); `scripts/fm-compare.ts` diffs the two totals.
3. **Dry run** — export `fm-salon-db` (read-only) to the scratchpad, load into SQLite, build, apply to a local D1 with all SalonKit migrations, compare totals → must be identical; then smoke the local app as org `fm`.
4. **Redirect Worker + runbook (waits for go)** — `deploy/fm-redirect/` (302 to `https://fmsalon.salonkit.online` + same path; `/api/wa/webhook` proxied; no cron). Runbook: deploy redirect → export → import remote → compare → owner pastes WhatsApp token in Settings → WhatsApp; set `WA_APP_SECRET`/`WA_VERIFY_TOKEN` on salonkit-app; staff sign in again and re-enable notifications.
