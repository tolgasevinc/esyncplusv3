-- Master ürün üzerinde Trendyol kategori bilgisini sakla
ALTER TABLE products ADD COLUMN trendyol_category_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_products_trendyol_category_id
  ON products(trendyol_category_id)
  WHERE is_deleted = 0 AND trendyol_category_id IS NOT NULL;
