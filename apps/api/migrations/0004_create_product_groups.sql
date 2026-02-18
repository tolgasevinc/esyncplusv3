-- product_groups: Ürün grupları (product_categories group_id için)
CREATE TABLE IF NOT EXISTS product_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_groups_code ON product_groups(code);
CREATE INDEX IF NOT EXISTS idx_product_groups_status ON product_groups(status);
CREATE INDEX IF NOT EXISTS idx_product_groups_is_deleted ON product_groups(is_deleted);
