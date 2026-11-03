#!/usr/bin/env bash
# FM Salon cutover (docs/fm-cutover.md). Usage: scripts/fm-cutover.sh <workdir outside the repo>
# 1. FM's old URL starts redirecting (FM stops taking new sales)  2. export fm-salon-db  3. import into salonkit-db
# 4. compare totals (--command, not --file: a remote --file import returns no rows). Stops at the first failure and prints the rollback.
set -euo pipefail
# DISABLED 2026-11-03: the 09:17 run replaced FM's live app with a redirect during business hours and was rolled back.
# FM stays on its own Worker (fm-salon). Never run this again without the owner's explicit yes naming the cutover and a time.
echo "fm-cutover is disabled: FM Salon stays on its own app (fm-salon.affworld0.workers.dev). See docs/fm-cutover.md."; exit 1
WORK=$(mkdir -p "${1:?usage: fm-cutover.sh <workdir>}" && cd "$1" && pwd) # absolute: the steps below cd elsewhere
API=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$API/../.." && pwd)
export XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.wrangler-affworld}
LOGO=${FM_LOGO:-$ROOT/../gents-salon/web/public/logo.png}
case "$WORK" in "$ROOT"*|"$(cd "$ROOT/.." && pwd)/gents-salon"*) echo "workdir must be outside the repos (it holds customer data)"; exit 1;; esac
rollback() {
  echo "ROLLBACK: (cd $API && XDG_CONFIG_HOME=$XDG_CONFIG_HOME npx wrangler d1 execute salonkit-db --remote --file $WORK/out/purge.sql)"
  echo "          (cd $ROOT/../gents-salon/web && npm run build && cd ../api && XDG_CONFIG_HOME=$XDG_CONFIG_HOME npx wrangler deploy)   # FM back on its own Worker, with its cron"
}
trap 'echo "FAILED at line $LINENO"; rollback' ERR

echo "0/4 preflight: slug free, ids below the offset"
(cd "$API" && node --experimental-strip-types --no-warnings -e "import('./scripts/fm-import/build.ts').then(m => process.stdout.write(m.preflightSql('org_fm', 'fmsalon')))" >"$WORK/preflight.sql")
(cd "$API" && npx wrangler d1 execute salonkit-db --remote --json --command "$(cat "$WORK/preflight.sql")" >"$WORK/pre.json")
(cd "$API" && node --experimental-strip-types --no-warnings scripts/fm-import.ts --preflight "$WORK/pre.json")
echo "1/4 redirecting FM's old URL"
(cd "$ROOT/deploy/fm-redirect" && npx wrangler deploy >/dev/null)
echo "2/4 exporting fm-salon-db"
(cd "$ROOT/../gents-salon/api" && npx wrangler d1 export fm-salon-db --remote --output "$WORK/fm.sql" >/dev/null)
rm -f "$WORK/fm.sqlite" && sqlite3 "$WORK/fm.sqlite" < "$WORK/fm.sql"
(cd "$API" && node --experimental-strip-types --no-warnings scripts/fm-import.ts "$WORK/fm.sqlite" "$WORK/out" --logo "$LOGO" ${FM_OWNER_EMAIL:+--owner-email "$FM_OWNER_EMAIL"})
echo "3/4 importing into salonkit-db"
(cd "$API" && npx wrangler d1 execute salonkit-db --remote --file "$WORK/out/import.sql" >"$WORK/import.log")
echo "4/4 comparing totals"
(cd "$API" && npx wrangler d1 execute salonkit-db --remote --json --command "$(cat "$WORK/out/totals-ss.sql")" >"$WORK/totals-ss.json")
(cd "$API" && node --experimental-strip-types --no-warnings scripts/fm-import.ts --compare "$WORK/out/totals-fm.json" "$WORK/totals-ss.json")
echo "Done: FM Salon is live at https://fmsalon.salonkit.online"
