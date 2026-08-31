INSERT INTO document_sequences (id, document_type, prefix, next_number, padding)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
       substr(lower(hex(randomblob(2))), 2) || '-' ||
       substr('89ab', abs(random()) % 4 + 1, 1) ||
       substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
       'safe_transfer',
       'TR-',
       1,
       5
WHERE NOT EXISTS (
  SELECT 1 FROM document_sequences WHERE document_type = 'safe_transfer'
);

CREATE TABLE IF NOT EXISTS safe_transfers (
  id TEXT PRIMARY KEY,
  transfer_number TEXT NOT NULL UNIQUE,
  transfer_date TEXT NOT NULL,
  from_safe_id TEXT NOT NULL,
  to_safe_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_safe_id) REFERENCES safes(id) ON DELETE RESTRICT,
  FOREIGN KEY (to_safe_id) REFERENCES safes(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (from_safe_id <> to_safe_id)
);

CREATE INDEX IF NOT EXISTS idx_safe_transfers_transfer_date ON safe_transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_safe_transfers_from_safe_id ON safe_transfers(from_safe_id);
CREATE INDEX IF NOT EXISTS idx_safe_transfers_to_safe_id ON safe_transfers(to_safe_id);
