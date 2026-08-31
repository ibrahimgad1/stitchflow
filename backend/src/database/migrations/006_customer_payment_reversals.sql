ALTER TABLE customer_payments
ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed'));

ALTER TABLE customer_payments
ADD COLUMN reversed_at TEXT;

ALTER TABLE customer_payments
ADD COLUMN reversal_notes TEXT;
