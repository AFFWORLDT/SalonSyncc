-- A phone's push token belongs to the phone session that registered it, so ending that session (sign out, an admin
-- signing the phone out, another person signing in on it, a password change) also stops its pushes.
-- NULL for web-push tokens (cookie sessions).
ALTER TABLE push_tokens ADD COLUMN mobile_session_id TEXT;
CREATE INDEX push_tokens_mobile_session ON push_tokens(mobile_session_id) WHERE mobile_session_id IS NOT NULL;
