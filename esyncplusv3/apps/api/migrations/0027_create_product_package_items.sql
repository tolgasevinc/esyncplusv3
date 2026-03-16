-- product_package_items: Paket ürünlerin içeriği (paket -> ürün, adet)
CREATE TABLE IF NOT EXISTS product_package_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  item_product_id INTEGER NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (item_product_id) REFERENCES products(id),
  UNIQUE(product_id, item_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_package_items_product ON product_package_items(product_id);
CREATE INDEX IF NOT EXISTS idx_product_package_items_item ON product_package_items(item_product_id);
