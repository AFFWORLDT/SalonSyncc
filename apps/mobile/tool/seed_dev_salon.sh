#!/usr/bin/env bash
# Seeds salon "e2esalon" (owner/pass1234, barber/pass1234, three services) into the LOCAL D1 used by `wrangler dev --local`.
# Never touches the remote database. Run from anywhere; re-running replaces the salon.
set -euo pipefail
cd "$(dirname "$0")/../../api"
HASH=$(node -e '
const c=require("crypto");const salt=c.randomBytes(16);
const h=c.pbkdf2Sync("pass1234",salt,10000,32,"sha256");
const b=(x)=>x.toString("base64url");console.log(`pbkdf2$10000$${b(salt)}$${b(h)}`);')
NOW=$(($(date +%s) * 1000))
SQL="
DELETE FROM sale_items WHERE org_id='org_e2e';
DELETE FROM sales WHERE org_id='org_e2e';
DELETE FROM customers WHERE org_id='org_e2e';
DELETE FROM counters WHERE org_id='org_e2e';
DELETE FROM expenses WHERE org_id='org_e2e';
DELETE FROM company_expenses WHERE org_id='org_e2e';
DELETE FROM ledger_entries WHERE org_id='org_e2e';
DELETE FROM audit_log WHERE org_id='org_e2e';
DELETE FROM notifications WHERE org_id='org_e2e';
DELETE FROM announcements WHERE org_id='org_e2e';
DELETE FROM push_tokens WHERE org_id='org_e2e';
DELETE FROM services WHERE org_id='org_e2e';
DELETE FROM login_failures WHERE org_id='org_e2e';
DELETE FROM mobile_sessions WHERE org_id='org_e2e';
DELETE FROM users WHERE org_id='org_e2e';
DELETE FROM org_settings WHERE org_id='org_e2e';
DELETE FROM orgs WHERE id='org_e2e';
INSERT INTO orgs(id,slug,name,status,plan_id,created_at) VALUES('org_e2e','e2esalon','E2E Salon','active','pro',$NOW);
INSERT INTO org_settings(org_id,display_name,currency,currency_minor,locale,timezone,phone_country,bill_prefix) VALUES('org_e2e','E2E Salon','AED',100,'en-AE','Asia/Dubai','971','E2E');
INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES('org_e2e','owner','Owner','owner','$HASH',$NOW);
INSERT INTO users(org_id,username,name,role,password_hash,created_at) VALUES('org_e2e','barber','Barber Ali','barber','$HASH',$NOW);
INSERT INTO users(org_id,username,name,role,password_hash,created_at,sort_order,commission_pct) VALUES('org_e2e','sam','Barber Sam','barber','$HASH',$NOW,2,40);
INSERT INTO services(org_id,uid,category,name,price,sort_order,created_at,updated_at) VALUES('org_e2e','s1','Hair','Haircut',4000,1,$NOW,$NOW);
INSERT INTO services(org_id,uid,category,name,price,sort_order,created_at,updated_at) VALUES('org_e2e','s2','Hair','Beard trim',2500,2,$NOW,$NOW);
INSERT INTO services(org_id,uid,category,name,price,sort_order,created_at,updated_at) VALUES('org_e2e','s3','Care','Face mask',3550,3,$NOW,$NOW);
"
npx wrangler d1 execute salonkit-db --local --command "$SQL" > /dev/null
echo "Seeded e2esalon (owner / barber, password pass1234) in the local D1."
