#!/usr/bin/env bash
# FM Salon cutover (docs/fm-cutover.md). Usage: scripts/fm-cutover.sh <workdir outside the repo>
# 1. FM's old URL starts redirecting (FM stops taking new sales)  2. export fm-salon-db  3. import into salonkit-db
# 4. compare totals (--command, not --file: a remote --file import returns no rows). Stops at the first failure and prints the rollback.
set -euo pipefail
WORK=${1:?usage: fm-cutover.sh <workdir>}
API=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$API/../.." && pwd)
export XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.wrangler-affworld}
LOGO=${FM_LOGO:-$ROOT/../gents-salon/web/public/logo.png}
mkdir -p "$WORK"
rollback() {
  echo "ROLLBACK: (cd $API && npx wrangler d1 execute salonkit-db --remote --file $WORK/out/purge.sql)"
  echo "          (cd $ROOT/../gents-salon/api && npx wrangler deploy)   # FM back on its own Worker, with its cron"
}
trap 'echo "FAILED at line $LINENO"; rollback' ERR

echo "1/4 redirecting FM's old URL"
(cd "$ROOT/deploy/fm-redirect" && npx wrangler deploy >/dev/null)
echo "2/4 exporting fm-salon-db"
(cd "$ROOT/../gents-salon/api" && npx wrangler d1 export fm-salon-db --remote --output "$WORK/fm.sql" >/dev/null)
rm -f "$WORK/fm.sqlite" && sqlite3 "$WORK/fm.sqlite" < "$WORK/fm.sql"
(cd "$API" && node --experimental-strip-types --no-warnings scripts/fm-import.ts "$WORK/fm.sqlite" "$WORK/out" --logo "$LOGO")
echo "3/4 importing into salonkit-db"
(cd "$API" && npx wrangler d1 execute salonkit-db --remote --file "$WORK/out/import.sql" >"$WORK/import.log")
echo "4/4 comparing totals"
(cd "$API" && npx wrangler d1 execute salonkit-db --remote --json --command "$(cat "$WORK/out/totals-ss.sql")" >"$WORK/totals-ss.json")
(cd "$API" && node --experimental-strip-types --no-warnings scripts/fm-import.ts --compare "$WORK/out/totals-fm.json" "$WORK/totals-ss.json")
echo "Done: FM Salon is live at https://fm.salonkit.online"
