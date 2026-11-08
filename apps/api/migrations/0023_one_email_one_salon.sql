-- One email = one person in one salon, across all of SalonKit: sign-in by email alone finds the salon from it.
-- Owners signed up with their email as username: copy it to their email so they're found the same way.
UPDATE users SET email = lower(username) WHERE email IS NULL AND role = 'owner' AND username LIKE '%@%';
UPDATE users SET email = lower(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_email ON users(lower(email)) WHERE email IS NOT NULL;
