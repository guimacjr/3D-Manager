CREATE TABLE IF NOT EXISTS sales_skus (
  id TEXT PRIMARY KEY,
  sku_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_sale_price_cents INTEGER NOT NULL CHECK (default_sale_price_cents >= 0),
  production_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (production_cost_cents >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps >= 0),
  next_contact_at TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'initial',
      'adjustment_in',
      'adjustment_out',
      'consignment_out',
      'consignment_return'
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

CREATE TABLE IF NOT EXISTS consignment_batches (
  id TEXT PRIMARY KEY,
  sales_point_id TEXT NOT NULL,
  dispatched_at TEXT NOT NULL,
  expected_settlement_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sales_point_id) REFERENCES sales_points(id)
);

CREATE TABLE IF NOT EXISTS consignment_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  quantity_sent INTEGER NOT NULL CHECK (quantity_sent > 0),
  unit_sale_price_cents INTEGER NOT NULL CHECK (unit_sale_price_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES consignment_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (sku_id) REFERENCES sales_skus(id)
);

CREATE TABLE IF NOT EXISTS consignment_sales (
  id TEXT PRIMARY KEY,
  batch_item_id TEXT NOT NULL,
  sold_quantity INTEGER NOT NULL CHECK (sold_quantity > 0),
  sold_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (batch_item_id) REFERENCES consignment_batch_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consignment_returns (
  id TEXT PRIMARY KEY,
  batch_item_id TEXT NOT NULL,
  returned_quantity INTEGER NOT NULL CHECK (returned_quantity > 0),
  returned_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (batch_item_id) REFERENCES consignment_batch_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sales_skus_active ON sales_skus (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_points_active ON sales_points (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_sku ON stock_movements (sku_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_point ON consignment_batches (sales_point_id, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON consignment_batch_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_consignment_sales_item ON consignment_sales (batch_item_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_consignment_returns_item ON consignment_returns (batch_item_id, returned_at DESC);
