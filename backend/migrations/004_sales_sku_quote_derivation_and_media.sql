ALTER TABLE sales_skus ADD COLUMN parent_sku_id TEXT REFERENCES sales_skus(id);
ALTER TABLE sales_skus ADD COLUMN source_quote_id TEXT REFERENCES print_quotes(id);

CREATE TABLE IF NOT EXISTS sales_sku_media (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo','video','3mf')),
  local_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sku_id) REFERENCES sales_skus(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sales_skus_parent ON sales_skus (parent_sku_id);
CREATE INDEX IF NOT EXISTS idx_sales_skus_source_quote ON sales_skus (source_quote_id);
CREATE INDEX IF NOT EXISTS idx_sales_sku_media_sku ON sales_sku_media (sku_id, created_at DESC);
