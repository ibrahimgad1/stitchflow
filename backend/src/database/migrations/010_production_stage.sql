-- Add production stage column for Kanban board tracking
ALTER TABLE production_batches ADD COLUMN stage TEXT NOT NULL DEFAULT 'draft'
  CHECK (stage IN ('draft', 'cutting', 'sewing', 'finishing', 'completed'));

UPDATE production_batches SET stage = 'draft' WHERE status = 'draft';
UPDATE production_batches SET stage = 'cutting' WHERE status = 'in_progress';
UPDATE production_batches SET stage = 'completed' WHERE status = 'completed';
