-- products: notes-db.md uyumu - code alanı kaldırılıyor (sku kullanılacak)
-- Mevcut code değerlerini sku'ya taşı (sku boşsa)
UPDATE products SET sku = code WHERE (sku IS NULL OR sku = '') AND code IS NOT NULL AND code != '';
DROP INDEX IF EXISTS idx_products_code;
ALTER TABLE products DROP COLUMN code;
