-- Master ürün ↔ Trendyol ürün eşleşme ID’si
ALTER TABLE products ADD COLUMN trendyol_product_id TEXT;

CREATE INDEX IF NOT EXISTS idx_products_trendyol_product_id
  ON products(trendyol_product_id)
  WHERE is_deleted = 0 AND trendyol_product_id IS NOT NULL AND trendyol_product_id != '';
