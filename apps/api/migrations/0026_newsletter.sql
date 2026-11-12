-- Newsletter from the public site (salonkit.online footer). Double opt-in: a row is "pending" until the
-- confirmation link is opened; the same token unsubscribes (one-click). Platform-level, not per salon.
CREATE TABLE newsletter_subscribers (
  email TEXT PRIMARY KEY,              -- lower-cased
  lang TEXT NOT NULL DEFAULT 'en',     -- en | ar
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  token TEXT NOT NULL UNIQUE,          -- confirm + unsubscribe link token
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER
);
