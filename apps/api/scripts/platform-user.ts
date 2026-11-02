// Creates a super admin account. Prints the SQL to run with wrangler (the password is shown once; never committed):
//   node --experimental-strip-types scripts/platform-user.ts you@example.com owner > /tmp/pu.sql
//   wrangler d1 execute salonkit-db --remote --file /tmp/pu.sql
import { hashPassword, randomToken } from "../src/core/crypto.ts";

const [email, role = "owner"] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !["owner", "support"].includes(role)) {
  console.error("usage: platform-user.ts <email> [owner|support]");
  process.exit(1);
}
const password = process.env.PLATFORM_PASSWORD || randomToken(12);
const hash = await hashPassword(password);
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
console.log(`INSERT INTO platform_users(email,password_hash,role,created_at) VALUES(${q(email.toLowerCase())},${q(hash)},${q(role)},${Date.now()}) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, session_version = session_version + 1;`);
console.error(`password for ${email}: ${password}`);
