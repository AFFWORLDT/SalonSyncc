-- Local demo data: orgs alpha (free/active) and bravo (pro_max/trial). Users owner, barber1, barber2: password pass1234. Re-runnable.
-- Seeded sales and expenses are inserted directly, with the same ledger lines the API would post for them (end of file),
-- so demo ledger balances agree with demo reports. Seeded sales use days today-1 and today-2 so they never collide with
-- today's bill counter.
UPDATE orgs SET owner_user_id = NULL WHERE id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM sale_items WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM sales WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM customers WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM ledger_entries WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM expenses WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM company_expenses WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM barber_payouts WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM money_transfers WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM services WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM audit_log WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM counters WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM login_failures WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM users WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM org_settings WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM subscriptions WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM org_feature_overrides WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM email_log WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM support_sessions WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM platform_audit WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM orgs WHERE id IN ('org_demo_alpha','org_demo_bravo');

INSERT INTO orgs(id,slug,name,status,plan_id,trial_ends_at,grace_ends_at,country,created_at) VALUES
  ('org_demo_alpha','alpha','Alpha Salon','active','free',NULL,NULL,'AE',CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('org_demo_bravo','bravo','Bravo Salon','trial','pro_max',
    (CAST(strftime('%s','now') AS INTEGER) * 1000) + 7*86400000,
    (CAST(strftime('%s','now') AS INTEGER) * 1000) + 14*86400000,
    'AE',CAST(strftime('%s','now') AS INTEGER) * 1000);

INSERT INTO org_settings(org_id,display_name,bill_prefix) VALUES
  ('org_demo_alpha','Alpha Salon','ALP'),
  ('org_demo_bravo','Bravo Salon','BRA');

INSERT INTO subscriptions(org_id,provider,status) VALUES
  ('org_demo_alpha','none',NULL),
  ('org_demo_bravo','none',NULL);

INSERT INTO users(org_id,username,name,role,password_hash,active,session_version,created_at) VALUES
  ('org_demo_alpha','owner','Alpha Owner','owner','pbkdf2$10000$McJfPbn-hydHJCVr3sfmCQ$0XZpdPjBRBq_UoMrrin8YljCPaYtHAVmDvROSH4Wtx4',1,1,CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('org_demo_bravo','owner','Bravo Owner','owner','pbkdf2$10000$McJfPbn-hydHJCVr3sfmCQ$0XZpdPjBRBq_UoMrrin8YljCPaYtHAVmDvROSH4Wtx4',1,1,CAST(strftime('%s','now') AS INTEGER) * 1000);

UPDATE orgs SET owner_user_id = (SELECT id FROM users WHERE users.org_id = orgs.id AND username = 'owner')
  WHERE id IN ('org_demo_alpha','org_demo_bravo');

-- alpha
INSERT INTO users(org_id,username,name,role,password_hash,active,session_version,created_at) VALUES
  ('org_demo_alpha','barber1','Alpha Barber One','barber','pbkdf2$10000$McJfPbn-hydHJCVr3sfmCQ$0XZpdPjBRBq_UoMrrin8YljCPaYtHAVmDvROSH4Wtx4',1,1,CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('org_demo_alpha','barber2','Alpha Barber Two','barber','pbkdf2$10000$McJfPbn-hydHJCVr3sfmCQ$0XZpdPjBRBq_UoMrrin8YljCPaYtHAVmDvROSH4Wtx4',1,1,CAST(strftime('%s','now') AS INTEGER) * 1000);

INSERT INTO services(org_id,uid,category,name,price,sort_order,created_at,updated_at) VALUES
  ('org_demo_alpha','alpha-svc-cut','Haircuts','Haircut',3000,1,CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('org_demo_alpha','alpha-svc-beard','Beard','Beard trim',2000,2,CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('org_demo_alpha','alpha-svc-color','Color','Hair color',8000,3,CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000);

INSERT INTO sales(org_id,bill_no,token,day,barber_id,customer_label,amount,payment_mode,commission_pct,commission,vat_rate,vat_amount,created_by,created_at,updated_at)
SELECT 'org_demo_alpha', 'ALP-' || strftime('%Y%m%d', date('now', d.off)) || '-' || d.seq, 'alpha-tok-' || strftime('%Y%m%d', date('now', d.off)) || '-' || d.seq, date('now', d.off),
       u.id, 'Customer ' || d.seq, d.amount, d.mode, 0, 0, 0, 0, u.id, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM (SELECT '-1 day' AS off, '001' AS seq, 5000 AS amount, 'cash' AS mode, 'barber1' AS who
      UNION ALL SELECT '-1 day','002',3000,'card','barber2'
      UNION ALL SELECT '-2 day','001',8000,'cash','barber1'
      UNION ALL SELECT '-2 day','002',2000,'card','barber2') d
JOIN users u ON u.org_id = 'org_demo_alpha' AND u.username = d.who;

INSERT INTO sale_items(org_id,sale_id,service_id,name,price,qty)
SELECT 'org_demo_alpha', sa.id, sv.id, sv.name, sv.price, 1
FROM sales sa JOIN services sv ON sv.org_id = sa.org_id
WHERE sa.org_id = 'org_demo_alpha' AND (
  (sa.amount = 5000 AND sv.uid IN ('alpha-svc-cut','alpha-svc-beard')) OR
  (sa.amount = 3000 AND sv.uid = 'alpha-svc-cut') OR
  (sa.amount = 8000 AND sv.uid = 'alpha-svc-color') OR
  (sa.amount = 2000 AND sv.uid = 'alpha-svc-beard'));

INSERT INTO expenses(org_id,barber_id,day,amount,note,created_at,updated_at)
SELECT 'org_demo_alpha', id, date('now','-1 day'), 500, 'Supplies', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM users WHERE org_id = 'org_demo_alpha' AND username = 'barber1';

INSERT INTO company_expenses(org_id,uid,day,amount,note,paid_from,created_by,created_at,updated_at)
SELECT 'org_demo_alpha','alpha-ce-rent',date('now','-2 day'),20000,'Rent','bank',id,CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000
FROM users WHERE org_id = 'org_demo_alpha' AND username = 'owner';

-- bravo
INSERT INTO users(org_id,username,name,role,password_hash,active,session_version,created_at) VALUES
  ('org_demo_bravo','barber1','Bravo Barber One','barber','pbkdf2$10000$McJfPbn-hydHJCVr3sfmCQ$0XZpdPjBRBq_UoMrrin8YljCPaYtHAVmDvROSH4Wtx4',1,1,CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('org_demo_bravo','barber2','Bravo Barber Two','barber','pbkdf2$10000$McJfPbn-hydHJCVr3sfmCQ$0XZpdPjBRBq_UoMrrin8YljCPaYtHAVmDvROSH4Wtx4',1,1,CAST(strftime('%s','now') AS INTEGER) * 1000);

INSERT INTO services(org_id,uid,category,name,price,sort_order,created_at,updated_at) VALUES
  ('org_demo_bravo','bravo-svc-cut','Haircuts','Haircut',3000,1,CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('org_demo_bravo','bravo-svc-beard','Beard','Beard trim',2000,2,CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('org_demo_bravo','bravo-svc-color','Color','Hair color',8000,3,CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000);

INSERT INTO sales(org_id,bill_no,token,day,barber_id,customer_label,amount,payment_mode,commission_pct,commission,vat_rate,vat_amount,created_by,created_at,updated_at)
SELECT 'org_demo_bravo', 'BRA-' || strftime('%Y%m%d', date('now', d.off)) || '-' || d.seq, 'bravo-tok-' || strftime('%Y%m%d', date('now', d.off)) || '-' || d.seq, date('now', d.off),
       u.id, 'Customer ' || d.seq, d.amount, d.mode, 0, 0, 0, 0, u.id, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM (SELECT '-1 day' AS off, '001' AS seq, 5000 AS amount, 'cash' AS mode, 'barber1' AS who
      UNION ALL SELECT '-1 day','002',3000,'card','barber2'
      UNION ALL SELECT '-2 day','001',8000,'cash','barber1'
      UNION ALL SELECT '-2 day','002',2000,'card','barber2') d
JOIN users u ON u.org_id = 'org_demo_bravo' AND u.username = d.who;

INSERT INTO sale_items(org_id,sale_id,service_id,name,price,qty)
SELECT 'org_demo_bravo', sa.id, sv.id, sv.name, sv.price, 1
FROM sales sa JOIN services sv ON sv.org_id = sa.org_id
WHERE sa.org_id = 'org_demo_bravo' AND (
  (sa.amount = 5000 AND sv.uid IN ('bravo-svc-cut','bravo-svc-beard')) OR
  (sa.amount = 3000 AND sv.uid = 'bravo-svc-cut') OR
  (sa.amount = 8000 AND sv.uid = 'bravo-svc-color') OR
  (sa.amount = 2000 AND sv.uid = 'bravo-svc-beard'));

INSERT INTO expenses(org_id,barber_id,day,amount,note,created_at,updated_at)
SELECT 'org_demo_bravo', id, date('now','-1 day'), 500, 'Supplies', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM users WHERE org_id = 'org_demo_bravo' AND username = 'barber1';

INSERT INTO company_expenses(org_id,uid,day,amount,note,paid_from,created_by,created_at,updated_at)
SELECT 'org_demo_bravo','bravo-ce-rent',date('now','-2 day'),20000,'Rent','bank',id,CAST(strftime('%s','now') AS INTEGER) * 1000,CAST(strftime('%s','now') AS INTEGER) * 1000
FROM users WHERE org_id = 'org_demo_bravo' AND username = 'owner';

-- ledger: the lines the API posts (lib/ledger saleLines / expenseLines / companyExpenseLines), for both orgs.
-- Sale: shop line on bank (card) or cash (cash), plus a commission line on the barber book when commission > 0.
INSERT INTO ledger_entries(org_id,at,day,book,account,barber_id,amount,kind,source,source_id,ref,memo,actor_id)
SELECT org_id, created_at, day, 'shop', CASE payment_mode WHEN 'card' THEN 'bank' ELSE 'cash' END, NULL, amount, 'sale', 'sale', id,
       bill_no, 'Bill ' || bill_no || ' · ' || customer_label, created_by
FROM sales WHERE org_id IN ('org_demo_alpha','org_demo_bravo') ORDER BY org_id, id;

INSERT INTO ledger_entries(org_id,at,day,book,account,barber_id,amount,kind,source,source_id,ref,memo,actor_id)
SELECT org_id, created_at, day, 'barber', NULL, barber_id, commission, 'commission', 'sale', id, bill_no, 'Commission · ' || bill_no, created_by
FROM sales WHERE org_id IN ('org_demo_alpha','org_demo_bravo') AND commission > 0 ORDER BY org_id, id;

-- Barber expense: out of the day's cash; ref "<barber> · <day>", entered by the owner.
INSERT INTO ledger_entries(org_id,at,day,book,account,barber_id,amount,kind,source,source_id,ref,memo,actor_id)
SELECT e.org_id, e.created_at, e.day, 'shop', 'cash', NULL, -e.amount, 'expense', 'expense', e.id,
       u.name || ' · ' || e.day, 'Expense · ' || u.name || COALESCE(' · ' || e.note, ''),
       (SELECT o.id FROM users o WHERE o.org_id = e.org_id AND o.username = 'owner')
FROM expenses e JOIN users u ON u.org_id = e.org_id AND u.id = e.barber_id
WHERE e.org_id IN ('org_demo_alpha','org_demo_bravo') ORDER BY e.org_id, e.id;

-- Company expense: out of the account it was paid from; ref is the note.
INSERT INTO ledger_entries(org_id,at,day,book,account,barber_id,amount,kind,source,source_id,ref,memo,actor_id)
SELECT org_id, created_at, day, 'shop', paid_from, NULL, -amount, 'company_expense', 'company_expense', id, note, 'Company · ' || note, created_by
FROM company_expenses WHERE org_id IN ('org_demo_alpha','org_demo_bravo') ORDER BY org_id, id;
