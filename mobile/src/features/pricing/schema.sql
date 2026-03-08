PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS printers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  power_watts INTEGER NOT NULL CHECK (power_watts > 0),
  purchase_cost_cents INTEGER NOT NULL CHECK (purchase_cost_cents >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS filaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  color TEXT NOT NULL,
  material_type TEXT NOT NULL,
  purchase_link TEXT,
  purchase_cost_cents INTEGER NOT NULL CHECK (purchase_cost_cents >= 0),
  purchased_weight_grams INTEGER NOT NULL CHECK (purchased_weight_grams > 0),
  cost_per_gram_cents INTEGER NOT NULL,
  cost_per_kg_cents INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_settings (
  id TEXT PRIMARY KEY,
  effective_from TEXT NOT NULL,
  labor_hour_cost_cents INTEGER NOT NULL CHECK (labor_hour_cost_cents >= 0),
  energy_cost_kwh_cents INTEGER NOT NULL CHECK (energy_cost_kwh_cents >= 0),
  tax_rate_bps INTEGER NOT NULL CHECK (tax_rate_bps >= 0),
  printer_payback_months INTEGER NOT NULL CHECK (printer_payback_months > 0),
  markup_bps INTEGER NOT NULL CHECK (markup_bps >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS print_quotes (
  id TEXT PRIMARY KEY,
  print_name TEXT NOT NULL,
  description TEXT,
  printer_id TEXT NOT NULL,
  cost_setting_id TEXT NOT NULL,
  print_time_minutes INTEGER NOT NULL CHECK (print_time_minutes >= 0),
  post_processing_minutes INTEGER NOT NULL CHECK (post_processing_minutes >= 0),
  packaging_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (packaging_cost_cents >= 0),
  subtotal_cost_cents INTEGER NOT NULL DEFAULT 0,
  tax_cost_cents INTEGER NOT NULL DEFAULT 0,
  final_price_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (printer_id) REFERENCES printers(id),
  FOREIGN KEY (cost_setting_id) REFERENCES cost_settings(id)
);

CREATE TABLE IF NOT EXISTS print_quote_filaments (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  filament_id TEXT NOT NULL,
  used_weight_grams INTEGER NOT NULL CHECK (used_weight_grams > 0),
  unit_cost_per_gram_cents INTEGER NOT NULL,
  line_total_cost_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (quote_id) REFERENCES print_quotes(id) ON DELETE CASCADE,
  FOREIGN KEY (filament_id) REFERENCES filaments(id)
);

CREATE TABLE IF NOT EXISTS print_quote_extra_costs (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_cost_cents INTEGER NOT NULL CHECK (item_cost_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (quote_id) REFERENCES print_quotes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS print_quote_media (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  local_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (quote_id) REFERENCES print_quotes(id) ON DELETE CASCADE
);
