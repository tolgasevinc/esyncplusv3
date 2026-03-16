-- product_descriptions: E-ticaret için ürün açıklamaları (1:1 products)
CREATE TABLE IF NOT EXISTS product_descriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  ecommerce_name TEXT,
  main_description TEXT,
  seo_slug TEXT,
  seo_title TEXT,
  seo_description TEXT,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_descriptions_product ON product_descriptions(product_id) WHERE is_deleted = 0;
