#!/usr/bin/env node
// Fails when a tracked (or staged) file looks like it carries a real credential. Runs in `npm test` and the pre-commit hook.
// Test fixtures use obviously fake values; add a line to ALLOW only for a value that is provably not a secret.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Private key block", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----[A-Za-z0-9+/=\s]{40,}/],
  ["Stripe key", /\b(sk|rk)_(live|test)_[0-9A-Za-z]{16,}/],
  ["GitHub token", /\bgh[pousr]_[0-9A-Za-z]{30,}/],
  ["Slack token", /\bxox[abprs]-[0-9A-Za-z-]{10,}/],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Cloudflare API token", /\b[A-Za-z0-9_-]{40}\b(?=.*(CLOUDFLARE|CF_API))/],
  ["Meta access token", /\bEAA[A-Za-z0-9]{60,}/],
  ["Firebase service account", /"private_key_id"\s*:\s*"[0-9a-f]{20,}"/],
];
const FORBIDDEN_FILES = [/(^|\/)creds\//, /(^|\/)\.dev\.vars$/, /(^|\/)\.env(\.local|\.development\.local|\.production\.local)?$/, /fmcreds\//, /\.pem$/, /service-account.*\.json$/i, /backup.*\.sql$/i];

const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.includes("node_modules/") && !/\.(png|jpe?g|webp|ico|pdf|woff2?)$/i.test(f));
const problems = [];
for (const f of files) {
  if (FORBIDDEN_FILES.some((re) => re.test(f))) problems.push(`${f}: this file must never be committed`);
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const [name, re] of PATTERNS) if (re.test(text)) problems.push(`${f}: looks like a ${name}`);
}
if (problems.length) {
  console.error("Secret scan failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`Secret scan: ${files.length} files clean`);
