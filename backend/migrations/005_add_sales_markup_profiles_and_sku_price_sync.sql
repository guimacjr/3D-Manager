ALTER TABLE cost_settings ADD COLUMN markup_final_sale_bps INTEGER NOT NULL DEFAULT 10000 CHECK (markup_final_sale_bps >= 0);
ALTER TABLE cost_settings ADD COLUMN markup_presential_sale_bps INTEGER NOT NULL DEFAULT 12000 CHECK (markup_presential_sale_bps >= 0);
ALTER TABLE cost_settings ADD COLUMN markup_wholesale_consignment_bps INTEGER NOT NULL DEFAULT 7500 CHECK (markup_wholesale_consignment_bps >= 0);
ALTER TABLE cost_settings ADD COLUMN markup_wholesale_cash_bps INTEGER NOT NULL DEFAULT 5000 CHECK (markup_wholesale_cash_bps >= 0);

UPDATE cost_settings
SET markup_final_sale_bps = CASE
  WHEN markup_bps IS NOT NULL AND markup_bps >= 0 THEN markup_bps
  ELSE 10000
END
WHERE markup_final_sale_bps = 10000;

ALTER TABLE sales_skus ADD COLUMN sync_with_quote_pricing INTEGER NOT NULL DEFAULT 0 CHECK (sync_with_quote_pricing IN (0,1));
ALTER TABLE sales_skus ADD COLUMN suggested_final_price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_skus ADD COLUMN suggested_presential_price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_skus ADD COLUMN suggested_wholesale_consignment_price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_skus ADD COLUMN suggested_wholesale_cash_price_cents INTEGER NOT NULL DEFAULT 0;
