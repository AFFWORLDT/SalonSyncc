-- The salon's Google Maps link (directions), set in Settings next to the Google review link; shown on the public bill.
ALTER TABLE org_settings ADD COLUMN google_maps_url TEXT;
