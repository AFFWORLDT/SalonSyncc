#!/usr/bin/env bash
# Seeds salon "e2esalon" (owner/pass1234, barber/pass1234) into the LOCAL D1 used by `wrangler dev --local`.
# Never touches the remote database. Run from anywhere; re-running replaces the salon.
set -euo pipefail
cd "$(dirname "$0")/../../api"
HASH=$(node -e '
const c=require("crypto");const salt=c.randomBytes(16);
const h=c.pbkdf2Sync("pass1234",salt,10000,32,"sha256");
const b=(x)=>x.toString("base64url");console.log(`pbkdf2$10000$${b(salt)}$${b(h)}`);')
NOW=$(($(date +%s) * 1000))
SQL="
DELETE FROM mobile_sessions WHERE org_id='org_e2e';
DELETE FROM users WHERE org_id='org_e2e';
DELETE FROM org_settings WHERE org_id='org_e2e';
DELETE FROM orgs WHERE id='org_e2e';
INSERT INTO orgs(id,slug,name,status,plan_id,created_at) VALUES('org_e2e','e2esalon','E2E Salon','active','pro',$NOW);
INSERT INTO org_settings(org_id,display_name,currency,currency_minor,locale,timezone,phone_country,bill_prefix) VALUES('org_e2e','E2E Salon','AED',100,'en-AE','Asia/Dubai','971','E2E');
INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES('org_e2e','owner','Owner','owner','$HASH',$NOW);
INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES('org_e2e','barber','Barber Ali','barber','$HASH',$NOW);
"
npx wrangler d1 execute salonkit-db --local --command "$SQL" > /dev/null
echo "Seeded e2esalon (owner / barber, password pass1234) in the local D1."
