ALTER TABLE marketplace_order_items ADD COLUMN cost_snapshot_sku_id TEXT;
ALTER TABLE marketplace_order_items ADD COLUMN cost_snapshot_sku_code TEXT;
ALTER TABLE marketplace_order_items ADD COLUMN cost_snapshot_sku_name TEXT;
ALTER TABLE marketplace_order_items ADD COLUMN cost_snapshot_source_quote_id TEXT;
ALTER TABLE marketplace_order_items ADD COLUMN unit_production_cost_cents INTEGER;
ALTER TABLE marketplace_order_items ADD COLUMN unit_energy_cost_cents INTEGER;
ALTER TABLE marketplace_order_items ADD COLUMN unit_payback_cost_cents INTEGER;
ALTER TABLE marketplace_order_items ADD COLUMN unit_filament_cost_cents INTEGER;
ALTER TABLE marketplace_order_items ADD COLUMN unit_other_cost_cents INTEGER;
ALTER TABLE marketplace_order_items ADD COLUMN filament_cost_breakdown_json TEXT;
ALTER TABLE marketplace_order_items ADD COLUMN cost_snapshot_at TEXT;

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_cost_snapshot
  ON marketplace_order_items (account_id, cost_snapshot_at DESC);
