# Stage 5 (Atlantic Portal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (user's choice: inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** The super-admin panel becomes "Atlantic Portal" and gets the switches the spec lists: each salon's features with
their source (plan / salon override / bundle) and a By-role grid, feature bundles (create, edit, delete, preview-then-apply on a
salon), and an App page for the phone app's versions.

**Architecture:** apps/web `/platform` pages (Next.js, `papi` client) over `/api/platform/*` (Hono). Per-role switches and
app-config APIs exist (Stage 1). New: a `feature_bundles` table and its routes. Applying a bundle writes ordinary salon overrides
with the reason "Bundle: {name}", so feature resolution, caching and the apps stay unchanged; the source column reads it back.

**Tech Stack:** existing web (Next.js, shadcn ui, vitest) and API (Hono, D1, vitest-pool-workers).

**Spec:** docs/superpowers/specs/2026-11-04-mobile-app-design.md (§2 Stage 5, §3.3 Atlantic Portal changes, D1, D2)

## Global Constraints

- D2: only the visible name changes to "Atlantic Portal"; the address stays `admin.salonkit.online`.
- Every change writes the existing platform audit log. Writes are platform-owner only (existing `ownerOnly` middleware); reads
  (incl. bundle preview) work for support staff too.
- `core_sales` can't be switched off anywhere (bundles included); `mcp_api` stays override-only (allowed in bundles).
- Deploy: migration remote first, then web build, then API deploy (Affworld0, `XDG_CONFIG_HOME=~/.wrangler-affworld`).

## Review Focus

1. Applying a bundle to a salon changes exactly the keys the preview listed — no more, no less; keys already matching are not rewritten.
2. A bundle that switches `core_sales` → 400 "Sales are always on"; an unknown key → 400.
3. Deleting a bundle never changes salons it was applied to (their overrides stay, still labelled with the bundle name).
4. The By-role grid can't hide a feature the salon doesn't have — or if it can, it's harmless (role rows only remove).
5. The App page refuses min > latest and non-https store links (server text shown).

---

### Task 1: Bundles API
**Files:** `apps/api/migrations/0018_feature_bundles.sql` (`feature_bundles(id, name UNIQUE, description, features JSON, created_at, updated_at)`); routes in `src/platform/admin.ts`; repo in `src/data/admin.ts`; test `test/bundles.test.ts`.
- `GET /api/platform/bundles` → `[{id, name, description, features:{key:bool}, updated_at}]`
- `POST /api/platform/bundles` `{name, description?, features}` → 201; `PUT /bundles/:id`; `DELETE /bundles/:id`.
  Errors: "Give the bundle a name", 409 "A bundle with that name exists", "Unknown feature", "Sales are always on", "Pick at least one feature".
- `GET /api/platform/orgs/:id/bundles/:bid/preview` → `{changes:[{key, from, to}]}` (from = the salon's effective value now).
- `POST /api/platform/orgs/:id/bundles/:bid/apply` → `{ok, changed}`: one override per changed key, reason "Bundle: {name}", audit "bundle_apply".
- [ ] Tests: CRUD + validation; preview lists only differing keys; apply changes /api/me features; apply twice → second changes nothing; support can preview, can't apply (403); delete keeps overrides.

### Task 2: Atlantic Portal name
Login heading "Atlantic Portal", subtitle "For the SalonKit team only.", tab title "Atlantic Portal", sidebar brand. Web test for the shell title.

### Task 3: Salon features — source + By role
In `app/platform/salons/view/page.tsx`: each feature shows its source ("Plan", "Override", "Bundle: X"); a "By role" card with Barber / Admin switches per feature (`GET/PUT /orgs/:id/role-features…`), off ones explained ("Hidden from barbers"). Web tests for the source label helper and the grid.

### Task 4: Bundles page
`app/platform/bundles/page.tsx` + nav item: list, create / edit (name, description, a three-way per feature: leave / on / off), delete (confirm). On the salon page: "Apply bundle" → pick → preview "{n} changes" list → "Apply". Web tests for the preview → apply flow.

### Task 5: App page
`app/platform/app/page.tsx` + nav item "App": per platform min / latest / store link with save; devices by version from `GET /app-config`. Web test.

### Task 6: Finish
Full suites (API, web, features, mobile unaffected), deploy (migration 0018 remote → web build → API deploy), smoke (`GET /api/platform/bundles` 401 without session; portal page loads), final review, fix pass, merge, push.
