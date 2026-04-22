CREATE TABLE IF NOT EXISTS marketplace_accounts (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_label TEXT,
  marketplace_user_id TEXT NOT NULL,
  seller_nickname TEXT,
  country_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TEXT,
  scope TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_connected_at TEXT NOT NULL,
  last_token_refresh_at TEXT,
  UNIQUE (marketplace, marketplace_user_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_marketplace_active
  ON marketplace_accounts (marketplace, is_active);

CREATE TABLE IF NOT EXISTS marketplace_oauth_states (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  context_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_marketplace_oauth_states_lookup
  ON marketplace_oauth_states (marketplace, state, consumed_at);

CREATE TABLE IF NOT EXISTS marketplace_sync_runs (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  account_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  records_read INTEGER NOT NULL DEFAULT 0,
  records_upserted INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_marketplace_sync_runs_account_started_at
  ON marketplace_sync_runs (account_id, started_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_sync_errors (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  account_id TEXT,
  marketplace TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES marketplace_sync_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES marketplace_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_marketplace_sync_errors_created_at
  ON marketplace_sync_errors (created_at DESC);
