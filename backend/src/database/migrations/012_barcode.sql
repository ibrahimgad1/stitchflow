-- Barcode for garment variants
ALTER TABLE model_variants ADD COLUMN barcode TEXT;

-- Generate barcode for existing variants where null (modelCode-size-color)
-- This will be handled in application layer on creation, but set default for existing
UPDATE model_variants SET barcode = substr(hex(randomblob(6)), 1, 12) WHERE barcode IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_variants_barcode ON model_variants(barcode);
