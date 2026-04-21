-- Master kategori ↔ IdeaSoft kategori kodu (Admin API Category.distributor ile eşleşir)
ALTER TABLE product_categories ADD COLUMN ideasoft_category_code TEXT;

-- Aynı IdeaSoft kodu (büyük/küçük harf duyarsız) iki master’da olamaz
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_ideasoft_code_unique
  ON product_categories(lower(trim(ideasoft_category_code)))
  WHERE ideasoft_category_code IS NOT NULL AND length(trim(ideasoft_category_code)) > 0;
