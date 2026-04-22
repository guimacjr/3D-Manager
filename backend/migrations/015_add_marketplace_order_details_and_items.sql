ALTER TABLE marketplace_orders ADD COLUMN shipping_substatus TEXT;
ALTER TABLE marketplace_orders ADD COLUMN shipping_mode TEXT;
ALTER TABLE marketplace_orders ADD COLUMN shipping_logistic_type TEXT;
ALTER TABLE marketplace_orders ADD COLUMN shipping_type TEXT;
ALTER TABLE marketplace_orders ADD COLUMN shipping_tracking_number TEXT;
ALTER TABLE marketplace_orders ADD COLUMN shipping_stage TEXT;
ALTER TABLE marketplace_orders ADD COLUMN billed_total_cents INTEGER;
ALTER TABLE marketplace_orders ADD COLUMN gross_received_cents INTEGER;
ALTER TABLE marketplace_orders ADD COLUMN net_received_cents INTEGER;
ALTER TABLE marketplace_orders ADD COLUMN ml_fee_total_cents INTEGER;
ALTER TABLE marketplace_orders ADD COLUMN refunds_total_cents INTEGER;
ALTER TABLE marketplace_orders ADD COLUMN shipping_cost_cents INTEGER;
ALTER TABLE marketplace_orders ADD COLUMN shipping_compensation_cents INTEGER;

CREATE TABLE IF NOT EXISTS marketplace_order_items (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  marketplace_order_id TEXT NOT NULL,
  marketplace_item_id TEXT NOT NULL,
  marketplace_variation_id TEXT,
  variation_key TEXT NOT NULL,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER,
  total_price_cents INTEGER,
  currency_id TEXT,
  linked_catalog_variation_id TEXT,
  linked_catalog_variation_label TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_catalog_variation_id) REFERENCES marketplace_catalog_variations(id) ON DELETE SET NULL,
  UNIQUE (order_id, marketplace_item_id, variation_key)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_order_id
  ON marketplace_order_items (order_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_marketplace_ref
  ON marketplace_order_items (marketplace, marketplace_item_id, marketplace_variation_id);
