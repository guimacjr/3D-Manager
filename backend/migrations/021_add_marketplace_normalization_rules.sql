CREATE TABLE IF NOT EXISTS marketplace_normalization_rules (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  category TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (marketplace, category, raw_value)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_normalization_rules_lookup
  ON marketplace_normalization_rules (marketplace, category, is_active);

INSERT INTO marketplace_normalization_rules (
  id, marketplace, category, raw_value, normalized_label, is_active, created_at, updated_at
) VALUES
  ('mercadolivre-shipping_logistic_type-drop_off', 'mercadolivre', 'shipping_logistic_type', 'drop_off', 'Agência Correio', 1, datetime('now'), datetime('now')),
  ('mercadolivre-shipping_logistic_type-fullfilment', 'mercadolivre', 'shipping_logistic_type', 'fullfilment', 'Fullfilment', 1, datetime('now'), datetime('now')),
  ('mercadolivre-shipping_logistic_type-fulfillment', 'mercadolivre', 'shipping_logistic_type', 'fulfillment', 'Fullfilment', 1, datetime('now'), datetime('now')),
  ('mercadolivre-shipping_logistic_type-self_service', 'mercadolivre', 'shipping_logistic_type', 'self_service', 'Flex', 1, datetime('now'), datetime('now')),
  ('mercadolivre-shipping_logistic_type-xd_drop_off', 'mercadolivre', 'shipping_logistic_type', 'xd_drop_off', 'Agência Mercado Livre', 1, datetime('now'), datetime('now'))
ON CONFLICT(marketplace, category, raw_value) DO NOTHING;
