# SalonKit mobile app

The salon's own app for barbers and admins (Flutter, iOS + Android). Spec: `docs/superpowers/specs/2026-11-04-mobile-app-design.md`.

Each salon is served on `https://<salon id>.salonkit.online`; the app calls the same API as the web app, with a phone
token (`Authorization: Bearer skm_…`) instead of the cookie.

## Run

```sh
flutter pub get
flutter run                                   # against the live API
```

Against a local API (`cd apps/api && npx wrangler dev --local`, which runs without ROOT_DOMAIN):

```sh
flutter run --dart-define=SK_DEV_HOST=http://127.0.0.1:8787     # iOS simulator
flutter run --dart-define=SK_DEV_HOST=http://10.0.2.2:8787      # Android emulator
```

## Tests

```sh
flutter test && flutter analyze
```

## Firebase (push + crash reports)

The config files are **never committed** (git-ignored). Download them from the SalonKit Firebase project (the one
whose service account is the API's `FCM_SERVICE_ACCOUNT` secret), apps `online.salonkit.app`:

- Android: `android/app/google-services.json`
- iOS: `ios/Runner/GoogleService-Info.plist` (the Thin Binary build step copies it into the app when present)

Without them the app builds and runs with push and crash reports off.

## Adding a feature

Create a `FeatureModule` (its server switch key, roles, title, icon, screen) under `lib/modules/<name>/` and add it to
`appModules` in `lib/modules/modules.dart`. The menu, switches and notification links pick it up.
