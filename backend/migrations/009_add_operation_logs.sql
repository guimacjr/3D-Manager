CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at
  ON operation_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_logs_event_type
  ON operation_logs (event_type, created_at DESC);
