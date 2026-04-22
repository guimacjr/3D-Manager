CREATE TABLE IF NOT EXISTS marketplace_catalog_variations (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_id TEXT NOT NULL,
  marketplace_item_id TEXT NOT NULL,
  marketplace_variation_id TEXT,
  variation_key TEXT NOT NULL,
  title TEXT NOT NULL,
  variation_label TEXT,
  attribute_combinations_json TEXT,
  status TEXT,
  currency_id TEXT,
  price_cents INTEGER,
  effective_price_cents INTEGER,
  estimated_sale_fee_cents INTEGER,
  estimated_listing_fee_cents INTEGER,
  estimated_net_proceeds_cents INTEGER,
  available_quantity INTEGER,
  sold_quantity INTEGER,
  raw_json TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
  UNIQUE (account_id, marketplace_item_id, variation_key)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_variations_account_updated
  ON marketplace_catalog_variations (account_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_variations_item
  ON marketplace_catalog_variations (marketplace, marketplace_item_id, marketplace_variation_id);
