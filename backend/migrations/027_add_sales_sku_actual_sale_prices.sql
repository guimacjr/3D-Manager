ALTER TABLE sales_skus ADD COLUMN presential_sale_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (presential_sale_price_cents >= 0);
ALTER TABLE sales_skus ADD COLUMN wholesale_consignment_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (wholesale_consignment_price_cents >= 0);
ALTER TABLE sales_skus ADD COLUMN wholesale_cash_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (wholesale_cash_price_cents >= 0);
ALTER TABLE sales_skus ADD COLUMN sync_final_sale_price_with_suggested INTEGER NOT NULL DEFAULT 1 CHECK (sync_final_sale_price_with_suggested IN (0,1));
ALTER TABLE sales_skus ADD COLUMN sync_presential_sale_price_with_suggested INTEGER NOT NULL DEFAULT 1 CHECK (sync_presential_sale_price_with_suggested IN (0,1));
ALTER TABLE sales_skus ADD COLUMN sync_wholesale_consignment_price_with_suggested INTEGER NOT NULL DEFAULT 1 CHECK (sync_wholesale_consignment_price_with_suggested IN (0,1));
ALTER TABLE sales_skus ADD COLUMN sync_wholesale_cash_price_with_suggested INTEGER NOT NULL DEFAULT 1 CHECK (sync_wholesale_cash_price_with_suggested IN (0,1));

UPDATE sales_skus
SET default_sale_price_cents = CASE
      WHEN suggested_final_price_cents IS NOT NULL AND suggested_final_price_cents > 0 THEN suggested_final_price_cents
      ELSE default_sale_price_cents
    END,
    presential_sale_price_cents = CASE
      WHEN suggested_presential_price_cents IS NOT NULL AND suggested_presential_price_cents > 0 THEN suggested_presential_price_cents
      ELSE default_sale_price_cents
    END,
    wholesale_consignment_price_cents = CASE
      WHEN suggested_wholesale_consignment_price_cents IS NOT NULL THEN suggested_wholesale_consignment_price_cents
      ELSE 0
    END,
    wholesale_cash_price_cents = CASE
      WHEN suggested_wholesale_cash_price_cents IS NOT NULL THEN suggested_wholesale_cash_price_cents
      ELSE 0
    END;
