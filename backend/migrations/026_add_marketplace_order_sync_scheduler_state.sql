CREATE TABLE IF NOT EXISTS marketplace_order_sync_scheduler_state (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes >= 0),
  last_started_at TEXT,
  last_finished_at TEXT,
  last_status TEXT,
  last_run_id TEXT,
  last_message TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
  UNIQUE (marketplace, account_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_order_sync_scheduler_state_due
  ON marketplace_order_sync_scheduler_state (marketplace, account_id, mode, last_started_at);
