# FM Salon cutover (spec P1b)

> **Rolled back and disabled (2026-11-03).** FM Salon stays on its own app, https://fm-salon.affworld0.workers.dev,
> with its own database. The cutover ran at 09:17 Dubai on an unclear go-ahead, during opening hours, and replaced
> FM's live app with a redirect. It was rolled back at 19:57 Dubai, the 11 bills entered on SalonKit were copied into
> fm-salon-db, and fmsalon.salonkit.online now redirects to FM's app (MOVED_HOSTS in apps/api/src/index.ts).
> The redirect Worker (`deploy/fm-redirect`, Worker name `fm-salon`) was deleted so it can't be deployed over FM again,
> and `scripts/fm-cutover.sh` exits at once. Everything below is kept for the record only.

FM Salon moves from its own Worker (`fm-salon`, database `fm-salon-db`) to SalonKit as the salon **fmsalon**:
https://fmsalon.salonkit.online. Plan: `docs/superpowers/plans/2026-11-05-plan-8-fm-import.md`.

**Done 2026-11-03 09:17 Dubai:** 63/63 totals matched. The planned address `fm` was too short (salon IDs need
3+ characters), so the salon was renamed to `fmsalon` within minutes and the redirect re-pointed.

## What carries over
Staff (same usernames and passwords, photos), customers, services, every sale with its bill number and receipt link,
sale items, expenses, payouts, transfers, the full ledger, audit history, notifications, announcements, ratings,
WhatsApp message history, counters (today's bill numbers continue), all settings and FM's logo.
FM's lowest-numbered active admin becomes the **owner**. Plan: Pro Max, marked paid by hand, no end date.

**Not carried over:** sign-ins (everyone signs in again once), push notifications (new Firebase project: each person
taps "Turn on notifications" again), and the WhatsApp token (a Cloudflare secret that cannot be read back).

## Before (once)
1. Set the WhatsApp secrets on SalonKit, the same values as FM's Meta app:
   `cd apps/api && XDG_CONFIG_HOME=~/.wrangler-affworld npx wrangler secret put WA_APP_SECRET`
   (and `WA_VERIFY_TOKEN`, any long random string, used only if Meta's webhook is set up again).
   SalonKit checks every salon's webhook with this one secret, so FM's Meta app becomes SalonKit's Meta app;
   other salons connect their numbers to the same app.
2. Pick a quiet time: after the business day closes (FM's day ends at 4 am Dubai), and not 23:00–01:00
   (the end-of-day summary would go out twice). The import blocks salonkit-db for a few seconds.

## Cutover (about 2 minutes)
```
cd apps/api && FM_OWNER_EMAIL=owner@example.com scripts/fm-cutover.sh /tmp/fm-cutover   # folder outside the repo: it holds customer data
```
It redirects FM's old URL (so no new sales go into the old database), exports `fm-salon-db`, imports it into
`salonkit-db`, and compares the totals (counts, sales, commission, VAT, takings per day, every ledger balance).
`FM_OWNER_EMAIL` is where account emails go (optional; without it the owner gets none).
It first checks that `fmsalon` is free and that no ids already sit at the import offset (it refuses a second run).
It ends with `totals match` or stops and prints the rollback. Delete the folder afterwards.
Rehearsed end to end on a throwaway remote D1 (2026-11-05): preflight ok, 45 statements, 63/63 totals, purge clean;
the redirect Worker answered 302 for links and passed the webhook through.

## After
1. Straight away (until then WhatsApp replies such as STOP and delivery receipts are dropped), the owner signs in
   at https://fmsalon.salonkit.online → Settings → WhatsApp and connects:
   phone number ID `1349313824939474`, WABA ID `1154099460522173`, and the permanent token.
   Bill messages, rating requests and visit reminders resume with FM's own approved templates.
2. Staff open https://fmsalon.salonkit.online (the old link redirects too), sign in, turn notifications back on,
   and re-add the app to their home screen from the new address.
3. Meta's webhook can stay on the old URL: the redirect Worker passes it through to SalonKit.
4. **Keep the redirect Worker forever.** FM's approved rating templates have the old address built into their
   button, so every rating link SalonKit sends for FM goes through it.

## Rollback
```
cd apps/api && XDG_CONFIG_HOME=~/.wrangler-affworld npx wrangler d1 execute salonkit-db --remote --file /tmp/fm-cutover/out/purge.sql
cd ../../../gents-salon/web && npm run build && cd ../api && XDG_CONFIG_HOME=~/.wrangler-affworld npx wrangler deploy
```
FM's database is never written, so FM comes back exactly as it was. Anything entered on SalonKit after the cutover
would be lost.
