-- product_mappings: Ürün-pazar eşleştirmeleri (N:N products <-> product_marketplaces)
-- İlişkiler: product_id -> products.id, marketplace_id -> product_marketplaces.id
CREATE TABLE IF NOT EXISTS product_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  marketplace_id INTEGER NOT NULL,
  marketplace_sku TEXT,
  marketplace_model_code TEXT,
  marketplace_category_id TEXT,
  marketplace_category_name TEXT,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_mappings_product ON product_mappings(product_id);
CREATE INDEX IF NOT EXISTS idx_product_mappings_marketplace ON product_mappings(marketplace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_mappings_product_marketplace ON product_mappings(product_id, marketplace_id) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_product_mappings_status ON product_mappings(status);
CREATE INDEX IF NOT EXISTS idx_product_mappings_is_deleted ON product_mappings(is_deleted);
