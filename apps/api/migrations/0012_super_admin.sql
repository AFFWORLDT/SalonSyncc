-- Plan 5: super admin panel. A per-salon staff-limit override set by the super admin (JSON like plans.limits_json,
-- NULL = the plan's limits), and indexes for the panel's lists.
ALTER TABLE orgs ADD COLUMN limits_override_json TEXT;
CREATE INDEX idx_orgs_created ON orgs(created_at);
CREATE INDEX idx_support_sessions_org ON support_sessions(org_id, expires_at);
