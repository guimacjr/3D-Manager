CREATE INDEX IF NOT EXISTS idx_print_quote_filaments_filament_quote
  ON print_quote_filaments (filament_id, quote_id);

CREATE INDEX IF NOT EXISTS idx_sales_skus_sync_active_quote
  ON sales_skus (is_active, sync_with_quote_pricing, source_quote_id);
