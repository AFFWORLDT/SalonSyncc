-- Usernames are unique per org ignoring case (login is case-insensitive).
CREATE UNIQUE INDEX users_org_username_ci ON users(org_id, lower(username));
