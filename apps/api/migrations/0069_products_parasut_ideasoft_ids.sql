-- Master ürün ↔ entegrasyon eşleşme ID’leri (liste, filtre, ikonlar)
ALTER TABLE products ADD COLUMN parasut_product_id TEXT;
ALTER TABLE products ADD COLUMN ideasoft_product_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_products_parasut_id ON products(parasut_product_id) WHERE is_deleted = 0 AND parasut_product_id IS NOT NULL AND parasut_product_id != '';
CREATE INDEX IF NOT EXISTS idx_products_ideasoft_id ON products(ideasoft_product_id) WHERE is_deleted = 0 AND ideasoft_product_id IS NOT NULL AND ideasoft_product_id > 0;
