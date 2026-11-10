#!/usr/bin/env bash
# App Store screenshots: runs integration_test/store_screenshots_test.dart on a simulator and saves a full-screen
# capture (clean 9:41 status bar) each time the test prints SHOT:<name>.
# tool/store_screenshots.sh "<simulator name>" <out dir> <demo password>
set -euo pipefail
SIM="$1"; OUT="$2"; PW="$3"
cd "$(dirname "$0")/.."
UDID=$(xcrun simctl list devices available | grep -F "    $SIM (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$UDID" ] || { echo "no simulator named $SIM"; exit 1; }
mkdir -p "$OUT"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl ui "$UDID" appearance light
xcrun simctl status_bar "$UDID" override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
xcrun simctl uninstall "$UDID" online.salonkit.app 2>/dev/null || true
flutter test integration_test/store_screenshots_test.dart -d "$UDID" --dart-define=SHOT_PW="$PW" 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" =~ SHOT:([A-Za-z0-9_]+) ]]; then
    xcrun simctl io "$UDID" screenshot "$OUT/${BASH_REMATCH[1]}.png" >/dev/null 2>&1 && echo "  -> $OUT/${BASH_REMATCH[1]}.png"
  fi
done
