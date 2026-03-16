-- products: notes-db.md alanları ekleme (sku, barcode, tax_rate, supplier_code, gtip_code)
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN tax_rate REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN supplier_code TEXT;
ALTER TABLE products ADD COLUMN gtip_code TEXT;

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
