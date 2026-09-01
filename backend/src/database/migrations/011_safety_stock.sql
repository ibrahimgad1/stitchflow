-- Safety stock thresholds for raw materials and finished variants
ALTER TABLE materials ADD COLUMN safety_threshold REAL NOT NULL DEFAULT 0 CHECK (safety_threshold >= 0);
ALTER TABLE model_variants ADD COLUMN safety_threshold REAL NOT NULL DEFAULT 0 CHECK (safety_threshold >= 0);

CREATE INDEX IF NOT EXISTS idx_materials_safety ON materials(safety_threshold);
CREATE INDEX IF NOT EXISTS idx_model_variants_safety ON model_variants(safety_threshold);
