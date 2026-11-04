-- Atlantic Portal feature bundles: a named set of feature switches the super admin applies to a salon in one go.
-- Applying one writes ordinary salon overrides (reason "Bundle: {name}"); the bundle itself is just the recipe, so editing or
-- deleting it never changes salons it was applied to.
CREATE TABLE feature_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  features TEXT NOT NULL, -- JSON {feature_key: true|false}
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
