CREATE TABLE IF NOT EXISTS material_receivings (
  id TEXT PRIMARY KEY,
  receiving_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL,
  receiving_date TEXT NOT NULL,
  due_date TEXT,
  document_reference TEXT,
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  remaining_minor INTEGER NOT NULL CHECK (remaining_minor >= 0),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS material_receiving_items (
  id TEXT PRIMARY KEY,
  receiving_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  notes TEXT,
  FOREIGN KEY (receiving_id) REFERENCES material_receivings(id) ON DELETE RESTRICT,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS material_stock_movements (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receiving', 'production_consumption', 'adjustment', 'reversal')),
  source_type TEXT NOT NULL,
  source_id TEXT,
  quantity_delta REAL NOT NULL,
  unit_cost_minor INTEGER NOT NULL DEFAULT 0,
  total_cost_minor INTEGER NOT NULL DEFAULT 0,
  quantity_after REAL NOT NULL CHECK (quantity_after >= 0),
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  payment_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  payment_method_id TEXT,
  safe_id TEXT NOT NULL,
  unallocated_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (unallocated_amount_minor >= 0),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
  FOREIGN KEY (safe_id) REFERENCES safes(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  material_receiving_id TEXT NOT NULL,
  allocated_amount_minor INTEGER NOT NULL CHECK (allocated_amount_minor > 0),
  FOREIGN KEY (payment_id) REFERENCES supplier_payments(id) ON DELETE RESTRICT,
  FOREIGN KEY (material_receiving_id) REFERENCES material_receivings(id) ON DELETE RESTRICT,
  UNIQUE (payment_id, material_receiving_id)
);

CREATE TABLE IF NOT EXISTS safe_transactions (
  id TEXT PRIMARY KEY,
  safe_id TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'opening_balance', 'customer_payment', 'supplier_payment', 'expense_payment',
    'capital_injection', 'owner_withdrawal', 'transfer_in', 'transfer_out', 'adjustment'
  )),
  source_type TEXT NOT NULL,
  source_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  balance_after_minor INTEGER NOT NULL CHECK (balance_after_minor >= 0),
  payment_method_id TEXT,
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (safe_id) REFERENCES safes(id) ON DELETE RESTRICT,
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_material_receivings_supplier_id ON material_receivings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_material_receivings_receiving_date ON material_receivings(receiving_date);
CREATE INDEX IF NOT EXISTS idx_material_receiving_items_receiving_id ON material_receiving_items(receiving_id);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_material_id ON material_stock_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_movement_date ON material_stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_payment_id ON supplier_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_safe_transactions_safe_id ON safe_transactions(safe_id);
