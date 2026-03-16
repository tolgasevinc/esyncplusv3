-- product_item_groups: Ürün mü? Yedek parça mı? Aksesuar mı? ayırımı için
CREATE TABLE IF NOT EXISTS product_item_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_item_groups_code ON product_item_groups(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_product_item_groups_status ON product_item_groups(status);
CREATE INDEX IF NOT EXISTS idx_product_item_groups_is_deleted ON product_item_groups(is_deleted);

-- products tablosuna product_item_group_id ekle
ALTER TABLE products ADD COLUMN product_item_group_id INTEGER REFERENCES product_item_groups(id);
CREATE INDEX IF NOT EXISTS idx_products_product_item_group ON products(product_item_group_id);
