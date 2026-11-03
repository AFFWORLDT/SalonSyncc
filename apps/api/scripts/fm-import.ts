// FM Salon import (spec P1b). Reads an `fm-salon-db` export loaded into a local SQLite file and writes, into <outdir>:
//   import.sql       the org's rows for salonkit-db       (wrangler d1 execute salonkit-db --remote --file import.sql)
//   purge.sql        removes them again, for a retry
//   totals-fm.json   FM's totals, from the source
//   totals-ss.sql    the same totals on salonkit-db        (… --json --command "$(cat totals-ss.sql)" > totals-ss.json)
//   preflight.sql    run on salonkit-db first               (… --json --command "$(cat preflight.sql)" > pre.json; --preflight pre.json)
// then: node --experimental-strip-types scripts/fm-import.ts --compare <outdir>/totals-fm.json totals-ss.json
// Prints counts only: the files hold customer data and password hashes, so keep <outdir> outside the repo.
//   wrangler d1 export fm-salon-db --remote --output /scratch/fm.sql && sqlite3 /scratch/fm.sqlite < /scratch/fm.sql
//   node --experimental-strip-types scripts/fm-import.ts /scratch/fm.sqlite /scratch/out --logo ../web/public/fm-logo.png
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildFmImport, purgeSql, totalsSql, compareTotals, preflightSql, preflightProblems, type FmSource, type Row } from "./fm-import/build.ts";

const ORG_ID = "org_fm";
const SLUG = "fm";
const TABLES = [
  "settings", "users", "customers", "services", "sales", "sale_items", "expenses", "company_expenses", "barber_payouts",
  "money_transfers", "ledger_entries", "audit_log", "notifications", "announcements", "ratings", "wa_campaigns", "wa_messages", "counters",
];

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};

if (args[0] === "--preflight") {
  const row = (JSON.parse(readFileSync(args[1]!, "utf8")) as { results: Record<string, number | null>[] }[])[0]!.results[0]!;
  const problems = preflightProblems(row, ORG_ID, SLUG);
  if (problems.length) {
    console.error(`NOT SAFE TO IMPORT:\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log("preflight ok");
  process.exit(0);
}

if (args[0] === "--compare") {
  const fm = JSON.parse(readFileSync(args[1]!, "utf8")) as { k: string; v: number }[];
  // wrangler --json: one { results: [...] } per statement
  const ss = (JSON.parse(readFileSync(args[2]!, "utf8")) as { results: { k: string; v: number }[] }[]).flatMap((r) => r.results);
  const diffs = compareTotals(fm, ss);
  if (diffs.length) {
    console.error(`MISMATCH (${diffs.length}):\n${diffs.join("\n")}`);
    process.exit(1);
  }
  console.log(`totals match: ${fm.length} keys`);
  process.exit(0);
}

const logoPath = flag("--logo");
const ownerEmail = flag("--owner-email") ?? null;
const [dbPath, outDir] = args;
if (!dbPath || !outDir) {
  console.error("usage: fm-import.ts <fm.sqlite> <outdir> [--logo file.png] [--owner-email you@example.com]\n       fm-import.ts --compare totals-fm.json totals-ss.json");
  process.exit(1);
}

const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
const src: FmSource = {};
for (const t of TABLES) src[t] = db.prepare(`SELECT * FROM ${t} ORDER BY ${t === "counters" ? "name" : "id"}`).all() as Row[];
const fmTotals = totalsSql("fm", ORG_ID).flatMap((q) => db.prepare(q).all() as { k: string; v: number }[]);

const logo = logoPath ? { bytes: new Uint8Array(readFileSync(logoPath)), type: logoPath.endsWith(".png") ? "image/png" : "image/jpeg" } : null;
const stmts = buildFmImport(src, { orgId: ORG_ID, slug: SLUG, now: Date.now(), ownerEmail, logo });

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "import.sql"), `${stmts.join("\n")}\n`);
writeFileSync(join(outDir, "purge.sql"), `${purgeSql(ORG_ID).join("\n")}\n`);
writeFileSync(join(outDir, "totals-fm.json"), JSON.stringify(fmTotals));
writeFileSync(join(outDir, "preflight.sql"), `${preflightSql(ORG_ID, SLUG)}\n`);
writeFileSync(join(outDir, "totals-ss.sql"), `${totalsSql("ss", ORG_ID).join("\n")}\n`);
console.log(TABLES.map((t) => `${t}: ${src[t]!.length}`).join("\n"));
console.log(`statements: ${stmts.length}, totals keys: ${fmTotals.length}, out: ${outDir}`);
