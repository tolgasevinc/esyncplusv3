-- product_categories: Ürün kategorileri (notes-db.md)
CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER,
  category_id INTEGER,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  image TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES product_groups(id),
  FOREIGN KEY (category_id) REFERENCES product_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_group ON product_categories(group_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_status ON product_categories(status);
CREATE INDEX IF NOT EXISTS idx_product_categories_is_deleted ON product_categories(is_deleted);
