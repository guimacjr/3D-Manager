CREATE TABLE IF NOT EXISTS marketplace_product_ads_daily_metrics (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_id TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ads_orders INTEGER NOT NULL DEFAULT 0,
  ads_revenue_cents INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (marketplace, account_id, advertiser_id, site_id, metric_date),
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_ads_metrics_account_date
  ON marketplace_product_ads_daily_metrics (marketplace, account_id, metric_date);
