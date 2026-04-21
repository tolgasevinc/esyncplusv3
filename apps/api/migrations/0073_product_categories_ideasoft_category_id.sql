-- Master kategori ↔ IdeaSoft Admin API Category.id
ALTER TABLE product_categories ADD COLUMN ideasoft_category_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_ideasoft_id_unique
  ON product_categories(ideasoft_category_id)
  WHERE ideasoft_category_id IS NOT NULL;
