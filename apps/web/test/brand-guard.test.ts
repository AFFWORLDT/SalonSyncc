import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Nothing salon- or brand-specific is hardcoded in the dashboard: currency, time zone, locale, phone country, names and
 * storage prefixes all come from /api/me settings or the build-time brand. Like the API's sql-guard, PENDING lists the
 * FM files not yet ported; it may only shrink, and a pending file that is already clean fails (remove it from the list).
 */
const FORBIDDEN: [string, RegExp][] = [
  ["AED", /\bAED\b/],
  ["Asia/Dubai", /Asia\/Dubai/],
  ["en-AE", /en-AE/],
  ["FM Salon", /FM Salon/],
  ["FM", /\bFM\b/],
  ["Faizan", /Faizan/],
  ["971", /"971"|\+971/],
  ["DAY_START_HOUR", /DAY_START_HOUR/],
  ["fm_ key", /\bfm_/],
  ["fm: event", /["'`]fm:/],
  ["fm-salon", /fm-salon/i],
];
/** Country data may name 971 (it is one of many calling codes). */
const ALLOW = new Set(["src/lib/phone-countries.ts"]);
const PENDING = new Set<string>([
  "src/app/globals.css",
  "src/app/history/page.tsx",
  "src/app/layout.tsx",
  "src/app/monthly/page.tsx",
  "src/app/rate/page.tsx",
  "src/app/services/page.tsx",
  "src/app/settings/page.tsx",
  "src/app/sheet/page.tsx",
  "src/components/app/company-expenses.tsx",
  "src/components/app/customer-picker.tsx",
  "src/components/app/expense-dialog.tsx",
  "src/components/app/ledger-barbers.tsx",
  "src/components/app/ledger-dialogs.tsx",
  "src/components/app/ledger-shop.tsx",
  "src/components/app/money-tile.tsx",
  "src/components/app/notifications-card.tsx",
  "src/components/app/phone-field.tsx",
  "src/components/app/push-prompt.tsx",
  "src/components/app/sale-sheet.tsx",
  "src/components/app/service-picker.tsx",
  "src/components/theme/theme-provider.tsx",
  "src/components/theme/theme.ts",
  "src/lib/excel.ts",
  "src/lib/format.ts",
  "src/lib/push.ts",
]);

const root = join(__dirname, "..");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

describe("brand guard", () => {
  const files = walk(join(root, "src")).map((p) => relative(root, p));
  it("scans the dashboard source", () => expect(files.length).toBeGreaterThan(50));
  for (const f of files) {
    if (ALLOW.has(f)) continue;
    const text = readFileSync(join(root, f), "utf8");
    const hits = FORBIDDEN.filter(([, re]) => re.test(text)).map(([n]) => n);
    if (PENDING.has(f)) it(`${f} is still pending (remove it from PENDING once clean)`, () => expect(hits.length).toBeGreaterThan(0));
    else it(`${f} has no hardcoded salon or brand values`, () => expect(hits).toEqual([]));
  }
});
