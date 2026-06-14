CREATE TABLE IF NOT EXISTS sales_sku_barcodes (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  barcode_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sku_id) REFERENCES sales_skus(id) ON DELETE CASCADE,
  UNIQUE (sku_id, barcode_value)
);

CREATE INDEX IF NOT EXISTS idx_sales_sku_barcodes_sku ON sales_sku_barcodes (sku_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_sales_sku_barcodes_value ON sales_sku_barcodes (barcode_value);
