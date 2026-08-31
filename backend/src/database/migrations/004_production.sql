CREATE TABLE IF NOT EXISTS production_batches (
  id TEXT PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  planned_quantity REAL NOT NULL DEFAULT 0 CHECK (planned_quantity >= 0),
  good_quantity REAL NOT NULL DEFAULT 0 CHECK (good_quantity >= 0),
  damaged_quantity REAL NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  wasted_quantity REAL NOT NULL DEFAULT 0 CHECK (wasted_quantity >= 0),
  start_date TEXT,
  completed_date TEXT,
  direct_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (direct_cost_minor >= 0),
  overhead_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (overhead_cost_minor >= 0),
  total_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_minor >= 0),
  cost_per_good_piece_minor INTEGER NOT NULL DEFAULT 0 CHECK (cost_per_good_piece_minor >= 0),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS production_batch_outputs (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  model_variant_id TEXT NOT NULL,
  good_quantity REAL NOT NULL DEFAULT 0 CHECK (good_quantity >= 0),
  unit_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_minor >= 0),
  total_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_minor >= 0),
  FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT,
  FOREIGN KEY (model_variant_id) REFERENCES model_variants(id) ON DELETE RESTRICT,
  UNIQUE (batch_id, model_variant_id)
);

CREATE TABLE IF NOT EXISTS production_material_consumptions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_minor >= 0),
  total_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_minor >= 0),
  consumption_date TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS production_cost_components (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  component_name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  notes TEXT,
  FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS finished_stock_movements (
  id TEXT PRIMARY KEY,
  model_variant_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('production_output', 'sale', 'adjustment', 'reversal')),
  source_type TEXT NOT NULL,
  source_id TEXT,
  quantity_delta REAL NOT NULL,
  unit_cost_minor INTEGER NOT NULL DEFAULT 0,
  total_cost_minor INTEGER NOT NULL DEFAULT 0,
  quantity_after REAL NOT NULL CHECK (quantity_after >= 0),
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (model_variant_id) REFERENCES model_variants(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS overhead_periods (
  id TEXT PRIMARY KEY,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'calculated', 'closed')),
  total_overhead_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_overhead_minor >= 0),
  total_good_quantity REAL NOT NULL DEFAULT 0 CHECK (total_good_quantity >= 0),
  overhead_per_piece_minor INTEGER NOT NULL DEFAULT 0 CHECK (overhead_per_piece_minor >= 0),
  calculated_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (period_year, period_month)
);

CREATE TABLE IF NOT EXISTS overhead_entries (
  id TEXT PRIMARY KEY,
  overhead_period_id TEXT NOT NULL,
  category_id TEXT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  paid_from_safe_id TEXT,
  expense_id TEXT,
  entry_date TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (overhead_period_id) REFERENCES overhead_periods(id) ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_from_safe_id) REFERENCES safes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS production_overhead_allocations (
  id TEXT PRIMARY KEY,
  overhead_period_id TEXT NOT NULL,
  production_batch_id TEXT NOT NULL,
  good_quantity REAL NOT NULL CHECK (good_quantity >= 0),
  overhead_per_piece_minor INTEGER NOT NULL DEFAULT 0 CHECK (overhead_per_piece_minor >= 0),
  allocated_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (allocated_amount_minor >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (overhead_period_id) REFERENCES overhead_periods(id) ON DELETE RESTRICT,
  FOREIGN KEY (production_batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT,
  UNIQUE (overhead_period_id, production_batch_id)
);

CREATE INDEX IF NOT EXISTS idx_production_batches_model_id ON production_batches(model_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON production_batches(status);
CREATE INDEX IF NOT EXISTS idx_production_batches_completed_date ON production_batches(completed_date);
CREATE INDEX IF NOT EXISTS idx_production_batch_outputs_batch_id ON production_batch_outputs(batch_id);
CREATE INDEX IF NOT EXISTS idx_production_material_consumptions_batch_id ON production_material_consumptions(batch_id);
CREATE INDEX IF NOT EXISTS idx_finished_stock_movements_variant_id ON finished_stock_movements(model_variant_id);
CREATE INDEX IF NOT EXISTS idx_finished_stock_movements_movement_date ON finished_stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_overhead_periods_year_month ON overhead_periods(period_year, period_month);
