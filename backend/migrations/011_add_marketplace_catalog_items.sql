CREATE TABLE IF NOT EXISTS marketplace_catalog_items (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_id TEXT NOT NULL,
  marketplace_item_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT,
  condition TEXT,
  permalink TEXT,
  thumbnail TEXT,
  currency_id TEXT,
  listing_type_id TEXT,
  price_cents INTEGER,
  available_quantity INTEGER,
  sold_quantity INTEGER,
  site_id TEXT,
  raw_json TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
  UNIQUE (account_id, marketplace_item_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_items_account_updated
  ON marketplace_catalog_items (account_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_catalog_items_marketplace_item
  ON marketplace_catalog_items (marketplace, marketplace_item_id);
