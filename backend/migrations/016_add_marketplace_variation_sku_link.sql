ALTER TABLE marketplace_catalog_variations ADD COLUMN linked_sku_id TEXT REFERENCES sales_skus(id);

CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_variations_linked_sku
  ON marketplace_catalog_variations (linked_sku_id, updated_at DESC);
