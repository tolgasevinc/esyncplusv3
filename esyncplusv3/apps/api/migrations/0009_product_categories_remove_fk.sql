-- product_categories: FK kısıtlamalarını kaldır (veri aktarımı için)
-- group_id ve category_id referansları uygulama tarafından yönetilir
CREATE TABLE product_categories_new (
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
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO product_categories_new SELECT id, group_id, category_id, name, code, slug, description, image, icon, sort_order, status, is_deleted, created_at, updated_at FROM product_categories;
DROP TABLE product_categories;
ALTER TABLE product_categories_new RENAME TO product_categories;
CREATE INDEX IF NOT EXISTS idx_product_categories_group ON product_categories(group_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_status ON product_categories(status);
CREATE INDEX IF NOT EXISTS idx_product_categories_is_deleted ON product_categories(is_deleted);
