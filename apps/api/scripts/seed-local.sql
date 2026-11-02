-- Local demo data: orgs alpha (free/active) and bravo (pro_max/trial), owner / pass1234. Re-runnable.
DELETE FROM users WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM org_settings WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
DELETE FROM subscriptions WHERE org_id IN ('org_demo_alpha','org_demo_bravo');
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
