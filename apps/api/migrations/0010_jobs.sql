-- Plan 2b Task 11: the cron's once-per-business-day claims for hour-targeted jobs (end-of-day summary, barber reminder).
-- The cron runs every 10 minutes and a job is due in its target hour and the hour after; INSERT OR IGNORE on this key
-- lets exactly one tick run it per org per business day. Rows older than 7 days are pruned by the cron.
CREATE TABLE job_runs (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  job TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, job, day)
);
