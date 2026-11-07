# SalonKit app: UI / UX polish plan (stage 6)

**Goal:** make the phone app feel designed and consistent — every screen built from the same few parts, clear
hierarchy, fast feedback (haptics, skeletons, optimistic updates), and nothing that breaks on a small phone, large
text or long names. The new-sale sheet (2026-11-07) is the reference for the feel: bottom-attached, big targets,
one tap per decision, the next action always under the thumb.

**Not in scope:** new features, API changes, the web app. Web parity stays the rule for data and wording.

**How it runs:** inline, one stage at a time, each ending with tests green, a debug build on the user's phone, and
their review before the next stage.

---

## What is wrong today (from the device review)

1. **Two titles.** Staff, Bills and other "More" screens show the AppBar title *and* a big heading under it ("Staff" twice).
2. **No shared building blocks.** Each screen hand-rolls its heading, cards, empty state and form sheet, so spacing,
   radii and type sizes drift (16 screens set their own `headlineSmall` heading).
3. **Long form sheets with the button at the end.** Edit staff, expenses, services: Save scrolls off with the keyboard up.
4. **Wording for engineers.** "Column order", "Position in the sheet", "Empty = default 0%".
5. **Mixed avatar shapes.** Rounded squares in lists, circles in the sale sheet; initials tiles all one colour.
6. **Spinners where a skeleton would do**, and lists that jump when data arrives.
7. **Times in the phone's time zone** on Customers, Announcements, Audit and Plan (the bill is fixed; these aren't).
8. **Little feedback.** No haptics outside the sale flow, saves give a plain snackbar, deletes have no undo.
9. **Settings is one long page** of unrelated switches.

---

## Stage A — Foundations (design system in code)

Files: `lib/core/theme/` and `lib/core/ui/`.

- [ ] **Scale tokens:** `SkSpace` (4, 8, 12, 16, 20, 24, 32), `SkRadius` (sm 10, md 14, lg 18, xl 24), and named text
  roles (`display`, `title`, `section`, `body`, `meta`, `mono`). Replace raw numbers as screens are touched.
- [ ] **`SkPage`:** one page scaffold — large title that collapses into the AppBar on scroll (removes the double
  title), optional action, pull-to-refresh, and the standard 16 px gutter.
- [ ] **`SkSection`:** small uppercase label plus an optional trailing action ("Owner", "Barbers", "Add").
- [ ] **`SkCard`** (glass) and **`SkTile`** (leading / title / subtitle / trailing, 56–72 px, ripple, haptic).
- [ ] **`SkAvatar`:** always a circle; photo or initials, with the initials colour hashed from the name. Used everywhere
  a person appears.
- [ ] **`SkFormSheet`:** bottom sheet with handle, title, scrolling fields and a **sticky** primary button that rides
  above the keyboard. Every add/edit form moves to it.
- [ ] **`SkEmpty`, `SkError`, `SkSkeletonList`:** one look for empty, failed and loading lists.
- [ ] **`SkToast`:** success / error / undo snackbars (floating, icon, haptic built in).
- [ ] **`Fmt` everywhere:** `fmt.time` / `fmt.dateTime` in the salon's zone replace `DateTime.fromMillisecondsSinceEpoch`
  formatting in customers, announcements, audit, plan and send screens.
- [ ] Use palette `success` / `warning` tokens instead of hard-coded colours (e.g. the sale "done" banner).
- [ ] Widget tests for each part, plus golden images at 360×800 in light and dark.

## Stage B — Shell and navigation

- [ ] Bottom bar: 4 tabs plus a centred **New sale** button (the most common action, one thumb tap away on every tab).
- [ ] "More" becomes a grouped list (Business · Team · Salon · Account) with icons and short descriptions.
- [ ] Consistent back behaviour and page transitions (shared-axis, 220 ms); no screen without a way back.
- [ ] Badge counts (notifications, pending) styled the same everywhere.

## Stage C — Screen-by-screen pass (each moves onto Stage A parts)

| Screen | Changes |
|---|---|
| **Login / salon** | Brand header (logo mark), one field per step, big buttons, clear errors, "Forgot password?" text. |
| **Today (barber)** | Hero total with count-up, sale rows as `SkTile`, sticky New sale, empty state that invites the first sale. |
| **Dashboard (admin)** | KPI tiles in a 2×2 grid, the chart in a card, per-barber list with avatars, every section tappable. |
| **Bills / sales** | Search and filter chips that stay pinned, day group headers, swipe a row to share, bill opens as a sheet. |
| **Daily sheet / monthly** | Readable on a phone: frozen first column, horizontal scroll hint, totals row pinned. |
| **Customers** | Avatar, last visit in the salon's zone, call / WhatsApp actions on the row. |
| **Expenses / ledger** | Form in `SkFormSheet` with the number pad from the sale flow for amounts; undo on delete. |
| **Staff** | Photo avatars, role badges, a row tap opens edit; plain wording ("Order on the daily sheet", "Commission — leave empty for the shop default"). |
| **Services** | Grouped by category with drag-to-reorder, price in mono, the edit form in `SkFormSheet`. |
| **Settings** | Split into sub-pages (Billing & VAT · WhatsApp · Receipts · Notifications · Region · Salon details); each saves on its own. |
| **Account** | Own photo (same picker as staff), theme, biometric lock, sign out at the bottom. |

## Stage D — Feedback and speed

- [ ] Haptics through `Haptic` on every primary action, picker, toggle and result (success / error / warning).
- [ ] Skeletons instead of spinners for first loads; keep the old data on screen while refreshing.
- [ ] Optimistic updates for toggles and deletes, with **Undo** in the toast.
- [ ] Cache the last answer per screen (as the sale sheet now does for services and staff) so screens open filled.
- [ ] Respect reduced motion and the phone's haptics setting (already true for motion).

## Stage E — Robustness and accessibility

- [ ] Worst-case data on every list and form: 40-character names, an Arabic salon name, 6-figure totals, empty lists.
- [ ] Text scale 1.3 without overflow on 360 dp wide phones; tap targets of at least 48 px.
- [ ] Contrast checked in both themes; semantics labels on icon buttons and the number pad.
- [ ] An overflow check in widget tests at 360×800 and 1.3× text for each screen.

## Stage F — Review and release

- [ ] Golden screenshots for every screen (light / dark) committed under `test/goldens/`.
- [ ] Debug build on the user's phone after each stage; their sign-off before the next.
- [ ] Then a release build for the Play internal track / TestFlight (the user uploads).

---

**Order and size (rough):** A (1 day) → B (½ day) → C (2–3 days, a few screens per pass) → D and E alongside C →
F at the end. Every stage ships on its own branch, merged to main after the user's review.
