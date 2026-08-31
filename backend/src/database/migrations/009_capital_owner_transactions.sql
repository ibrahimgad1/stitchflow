CREATE TABLE IF NOT EXISTS capital_transactions (
  id TEXT PRIMARY KEY,
  transaction_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('capital_injection', 'owner_withdrawal')),
  owner_id TEXT,
  safe_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE SET NULL,
  FOREIGN KEY (safe_id) REFERENCES safes(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_capital_transactions_date ON capital_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_owner_id ON capital_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_safe_id ON capital_transactions(safe_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_type ON capital_transactions(transaction_type);
