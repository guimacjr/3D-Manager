CREATE TABLE IF NOT EXISTS marketplace_sync_cancel_requests (
  run_id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL,
  reason TEXT,
  FOREIGN KEY (run_id) REFERENCES marketplace_sync_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_marketplace_sync_cancel_requests_requested_at
  ON marketplace_sync_cancel_requests (requested_at DESC);
