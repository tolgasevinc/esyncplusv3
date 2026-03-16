-- product_descriptions: Ürün açıklamaları (1:1 products)
-- İlişki: product_id -> products.id
CREATE TABLE IF NOT EXISTS product_descriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  short_description TEXT,
  main_description TEXT,
  seo_title TEXT,
  seo_description TEXT,
  seo_slug TEXT,
  weight REAL,
  width REAL,
  height REAL,
  depth REAL,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_descriptions_product ON product_descriptions(product_id) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_product_descriptions_status ON product_descriptions(status);
CREATE INDEX IF NOT EXISTS idx_product_descriptions_is_deleted ON product_descriptions(is_deleted);
