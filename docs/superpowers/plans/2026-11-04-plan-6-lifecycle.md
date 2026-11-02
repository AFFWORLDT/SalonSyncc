# Plan 6 — Subscription lifecycle (spec P5)

> Executed inline (user preference: fast).

**Goal:** Salons move through trial → grace → expired on their own, with reminder emails, without anything being deleted.

**Spec:** `docs/superpowers/specs/2026-11-02-salonsync-saas-design.md` §6.

## What was built
- `apps/api/src/jobs/lifecycle.ts`, run hourly (minute 0) by the cron before the org loader:
  - **Moves** (one batch, 8 statements, idempotent, each audited as `system` in `platform_audit`):
    trial → grace at `trial_ends_at` (Free trials → active, Free is permanent); grace/past_due → expired at
    `grace_ends_at`; active paid by hand (`subscriptions.provider = manual`) → past_due (7 days) at `current_period_end`.
  - **Emails** (`emails/lifecycle.ts`), each once per salon through `email_log (org_id, kind)`: `trial_ending` (2 days
    before), `grace_reminder_1..7` (one per grace day), `expired`, `deactivated`. At most 5 per tick (1 subrequest + 2
    statements each); the rest go out next hour.
- Already in place from earlier plans: write guard (402), expired screen and banners, expired queue, deactivate,
  soft delete (Plan 5).

## Rulings
- Delete stays a soft delete (status `deleted`, rows kept) instead of export + purge: reversible, and the rows are the
  export. Cost if wrong: a purge job later.
- A reminder already sent is not sent again after a super admin extends the trial (one row per kind). Cost if wrong:
  an owner extended by hand gets no second "trial ending" email.

## Tests
`apps/api/test/lifecycle.test.ts`: the full trial → grace (7 daily emails) → expired path on an injected clock, Free and
manual-paid paths, deactivated email, hour-only runs, statement budget ≤ 45 every tick, email escaping.
