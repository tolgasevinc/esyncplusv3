-- Master marka/kategori ↔ Trendyol ID eşleşmeleri
ALTER TABLE product_brands ADD COLUMN trendyol_brand_id INTEGER;
ALTER TABLE product_categories ADD COLUMN trendyol_category_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_brands_trendyol_brand_id_unique
  ON product_brands(trendyol_brand_id)
  WHERE trendyol_brand_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_trendyol_category_id_unique
  ON product_categories(trendyol_category_id)
  WHERE trendyol_category_id IS NOT NULL;
