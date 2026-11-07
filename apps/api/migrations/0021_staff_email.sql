-- Staff email (optional): where SalonKit sends the barber their daily and monthly report, announcements and
-- "your sale was changed" notices. Plus the salon's switches for the two scheduled reports.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE org_settings ADD COLUMN email_staff_daily INTEGER NOT NULL DEFAULT 1;
ALTER TABLE org_settings ADD COLUMN email_staff_monthly INTEGER NOT NULL DEFAULT 1;
