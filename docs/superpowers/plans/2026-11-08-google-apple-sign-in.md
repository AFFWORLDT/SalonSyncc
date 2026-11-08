# Sign in with Google and Apple (phone app) + first-run setup

Asked by Rahul (PM), 2026-11-08. Builds on "one email = one salon" (migration 0023) and app sign-up.

## Goal

On the app's first screen: **Continue with Google** (Android + iOS) and **Continue with Apple** (iOS; Apple's
guideline 4.8 requires it once Google is offered). The verified email decides what happens:

| Email from Google/Apple | Result |
|---|---|
| Belongs to an active person in a live salon | Signed in to that salon (same as the email code) |
| Belongs to an inactive person | Refused: "Your account at <salon> is turned off. Ask the owner." |
| Unknown | "Start your salon": a short sign-up (salon name, ID, country; no password) → 7-day trial → first-run setup |
| Not verified by the provider | Refused: "Use the email code instead." |

## R&D decisions

1. **Firebase Auth does the Google/Apple dance on the phone** (project `salonkit1`, already used for push).
   `FirebaseAuth.signInWithProvider(GoogleAuthProvider / AppleAuthProvider)`: one package (`firebase_auth`), Apple's
   nonce and Google's client IDs handled by Firebase. The app then signs out of Firebase at once: SalonKit keeps its own
   session (`skm_` token), Firebase is only the identity check.
2. **The server verifies the Firebase ID token itself** (no Admin SDK in a Worker): RS256 against Google's public keys
   (`securetoken@system.gserviceaccount.com` JWKS, cached per isolate by `Cache-Control`), `iss =
   https://securetoken.google.com/salonkit1`, `aud = salonkit1`, `exp`/`iat`/`auth_time` sane, `email_verified = true`,
   `firebase.sign_in_provider ∈ {google.com, apple.com}`. 1 subrequest at most (keys cached), well inside free-plan CPU.
3. **No new identity table**: the verified email is the key (one email = one salon). An Apple "Hide my email" relay
   address is just another email; if it isn't on a team, the person is told to use their own email's code.
4. **Social-only owners have no usable password** (random hash). They sign in with Google/Apple or the email code, and
   can set a password later in Profile.

## Server (apps/api)

- `src/lib/firebase-token.ts`: `verifyFirebaseIdToken(token, projectId, now, fetchKeys)` → `{email, name, provider, uid}`
  or throws `HttpError(401)`. Keys fetcher injectable for tests (tests sign tokens with a generated RSA key).
- `POST /api/auth/social` `{id_token, device}` (bare domain or any host): verified email → `orgOfEmail` → user →
  phone session `{token, slug}`; unknown → `200 {new: true, email, name}`; inactive → 403; unverified → 401.
- `POST /api/public/signup` accepts `id_token` instead of `email` + `password` (email/name come from the token; random
  password hash). Same rate limits and checks.
- Env: `FIREBASE_PROJECT_ID = "salonkit1"` (wrangler var).

## App (apps/mobile)

- `firebase_auth`; `SocialAuth` service (Google, Apple; Apple only on iOS) returning a Firebase ID token.
- First screen: two buttons above the email field. Unknown email → `SocialSignupScreen` (salon name, salon ID, country,
  mobile optional) → signed in.
- **First-run setup** (owner, once per salon, also after a normal sign-up): 1) salon logo, 2) invite your team (name +
  email rows → staff created with a random password + invite email), 3) done. Every step skippable; reopenable from
  Settings ("Finish setting up").
- iOS: `Sign in with Apple` capability + entitlement; Google URL scheme (`REVERSED_CLIENT_ID`) in Info.plist.
- Android: Firebase Android app needs the upload key's and Play app-signing key's **SHA-1** (Google sign-in).

## Test cases

Server (`test/social-sign-in.test.ts`):
- valid Google token, known email → token + slug; email case-insensitive
- valid Apple token (relay email) known → signs in; unknown → `{new: true}`
- unknown email → `{new: true}`; then signup with the same id_token → 201 + token; signup again → 409
- `email_verified: false` → 401; wrong `aud` / `iss` → 401; expired → 401; `iat` in the future → 401
- signature by another key → 401; `kid` not in the key set → 401; `alg: none` → 401; malformed token → 401
- provider not google.com / apple.com (e.g. password) → 401
- inactive staff → 403 with the salon's name; deactivated salon → `{new: true}` then signup refused (email taken)
- rate limit shared with the code sign-in (per IP)
- signup with id_token ignores a typed email/password; owner has no usable password (password login fails)

App:
- Google button → social token → known → signed in; unknown → sign-up screen prefilled with name
- Apple button hidden on Android; shown on iOS
- user cancels the Google/Apple sheet → nothing happens, no error shown
- provider error / offline → message on the first screen
- first-run setup: shows once after sign-up; skip all → never again; invites create staff + send invites; a taken
  email on one row is reported on that row and the others still go through

## Needs from the owner (console clicks)

1. Firebase → salonkit1 → Authentication → Get started → Sign-in method → **Google** (enable, support email) and
   **Apple** (enable; for iOS-only nothing else is needed).
2. Firebase → Project settings → Android app → **Add fingerprint**: upload key SHA-1 (given in chat) and, after the
   first Play upload, Play Console → App integrity → app-signing key SHA-1.
3. Firebase → Project settings → iOS app → download the new `GoogleService-Info.plist` (now has `CLIENT_ID`) into
   `salonsync/creds/`.
4. Apple Developer → Identifiers → online.salonkit.app → tick **Sign in with Apple** (the API key may do it during the
   build; if not, this click).

## Order

1. Server: token verifier + `/auth/social` + signup by token, with all server tests. Deploy.
2. App: social buttons + social sign-up, tests.
3. App: first-run setup wizard, tests.
4. Builds: Android APK on the phone, iOS TestFlight build 3. Owner tests on device.
