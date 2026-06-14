ALTER TABLE marketplace_orders ADD COLUMN pack_id TEXT;

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_pack
  ON marketplace_orders (account_id, pack_id, date_created);
