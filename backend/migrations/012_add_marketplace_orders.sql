CREATE TABLE IF NOT EXISTS marketplace_orders (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_id TEXT NOT NULL,
  marketplace_order_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  buyer_id TEXT,
  buyer_nickname TEXT,
  status TEXT,
  substatus TEXT,
  order_total_cents INTEGER,
  paid_amount_cents INTEGER,
  currency_id TEXT,
  shipping_id TEXT,
  shipping_status TEXT,
  date_created TEXT,
  date_closed TEXT,
  raw_json TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
  UNIQUE (account_id, marketplace_order_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_account_updated
  ON marketplace_orders (account_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_marketplace_order
  ON marketplace_orders (marketplace, marketplace_order_id);
