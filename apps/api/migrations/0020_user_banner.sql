-- A banner behind a person's photo on their profile (LinkedIn-style). Same storage and versioning as the photo:
-- banner_v grows on each upload, negative after a clear, and the public URL carries it so it can be cached forever.
ALTER TABLE users ADD COLUMN banner BLOB;
ALTER TABLE users ADD COLUMN banner_type TEXT;
ALTER TABLE users ADD COLUMN banner_v INTEGER NOT NULL DEFAULT 0;
