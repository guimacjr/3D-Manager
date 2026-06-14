ALTER TABLE marketplace_catalog_items ADD COLUMN shipping_mode TEXT;
ALTER TABLE marketplace_catalog_items ADD COLUMN shipping_logistic_type TEXT;
ALTER TABLE marketplace_catalog_items ADD COLUMN shipping_free INTEGER CHECK (shipping_free IN (0,1));
ALTER TABLE marketplace_catalog_items ADD COLUMN shipping_tags_json TEXT;

CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_items_shipping_logistic
  ON marketplace_catalog_items (marketplace, shipping_logistic_type);
