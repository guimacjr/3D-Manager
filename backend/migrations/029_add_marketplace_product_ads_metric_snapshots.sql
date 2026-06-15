CREATE TABLE IF NOT EXISTS marketplace_product_ads_metric_snapshots (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_id TEXT NOT NULL,
  run_id TEXT,
  advertiser_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  sync_mode TEXT NOT NULL,
  sync_source TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ads_orders INTEGER NOT NULL DEFAULT 0,
  ads_revenue_cents INTEGER NOT NULL DEFAULT 0,
  previous_snapshot_id TEXT,
  delta_cost_cents INTEGER NOT NULL DEFAULT 0,
  delta_impressions INTEGER NOT NULL DEFAULT 0,
  delta_clicks INTEGER NOT NULL DEFAULT 0,
  delta_ads_orders INTEGER NOT NULL DEFAULT 0,
  delta_ads_revenue_cents INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES marketplace_sync_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (previous_snapshot_id) REFERENCES marketplace_product_ads_metric_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_ads_snapshots_account_date
  ON marketplace_product_ads_metric_snapshots (marketplace, account_id, metric_date, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_ads_snapshots_run
  ON marketplace_product_ads_metric_snapshots (run_id);
