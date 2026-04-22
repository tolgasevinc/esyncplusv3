-- Master marka ↔ IdeaSoft Store/Admin API Brand.id
ALTER TABLE product_brands ADD COLUMN ideasoft_brand_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_brands_ideasoft_brand_id_unique
  ON product_brands(ideasoft_brand_id)
  WHERE ideasoft_brand_id IS NOT NULL;
