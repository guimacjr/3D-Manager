PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS stock_movements_new (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'initial',
      'adjustment_in',
      'adjustment_out',
      'consignment_out',
      'consignment_return',
      'marketplace_sale_out',
      'marketplace_sale_reversal'
    )
  ),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta != 0),
  occurred_at TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sku_id) REFERENCES sales_skus(id)
);

INSERT INTO stock_movements_new (
  id, sku_id, movement_type, quantity_delta, occurred_at, reference_type, reference_id, notes, created_at, updated_at
)
SELECT id, sku_id, movement_type, quantity_delta, occurred_at, reference_type, reference_id, notes, created_at, updated_at
FROM stock_movements;

DROP TABLE stock_movements;
ALTER TABLE stock_movements_new RENAME TO stock_movements;

CREATE INDEX IF NOT EXISTS idx_stock_movements_sku ON stock_movements (sku_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements (reference_type, reference_id, movement_type);

PRAGMA foreign_keys = ON;
