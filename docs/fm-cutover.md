# FM Salon cutover (spec P1b)

FM Salon moves from its own Worker (`fm-salon`, database `fm-salon-db`) to SalonKit as the salon **fm**:
https://fm.salonkit.online. Plan: `docs/superpowers/plans/2026-11-05-plan-8-fm-import.md`.

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
2. Pick a quiet time: after the business day closes (FM's day ends at 4 am Dubai).

## Cutover (about 2 minutes)
```
cd apps/api && scripts/fm-cutover.sh /tmp/fm-cutover      # any folder outside the repo; it holds customer data
```
It redirects FM's old URL (so no new sales go into the old database), exports `fm-salon-db`, imports it into
`salonkit-db`, and compares the totals (counts, sales, commission, VAT, takings per day, every ledger balance).
It ends with `totals match` or stops and prints the rollback. Delete the folder afterwards.

## After
1. The owner signs in at https://fm.salonkit.online → Settings → WhatsApp and connects:
   phone number ID `1349313824939474`, WABA ID `1154099460522173`, and the permanent token.
   Bill messages, rating requests and visit reminders resume with FM's own approved templates.
2. Staff open https://fm.salonkit.online (the old link redirects too), sign in, turn notifications back on,
   and re-add the app to their home screen from the new address.
3. Meta's webhook can stay on the old URL: the redirect Worker passes it through to SalonKit.

## Rollback
```
cd apps/api && XDG_CONFIG_HOME=~/.wrangler-affworld npx wrangler d1 execute salonkit-db --remote --file /tmp/fm-cutover/out/purge.sql
cd ../../../gents-salon/api && XDG_CONFIG_HOME=~/.wrangler-affworld npx wrangler deploy
```
FM's database is never written, so FM comes back exactly as it was. Anything entered on SalonKit after the cutover
would be lost.
