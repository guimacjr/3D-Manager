ALTER TABLE marketplace_catalog_variations ADD COLUMN is_ignored INTEGER NOT NULL DEFAULT 0 CHECK (is_ignored IN (0,1));

CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_variations_ignored
  ON marketplace_catalog_variations (account_id, is_ignored, updated_at DESC);
