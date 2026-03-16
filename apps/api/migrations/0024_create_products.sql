-- products: Ürünler tablosu (notes-db.md uyumlu)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  brand_id INTEGER,
  category_id INTEGER,
  type_id INTEGER,
  unit_id INTEGER,
  currency_id INTEGER,
  price REAL DEFAULT 0,
  quantity REAL DEFAULT 0,
  image TEXT,
  tax_rate REAL DEFAULT 0,
  supplier_code TEXT,
  gtip_code TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type_id);
CREATE INDEX IF NOT EXISTS idx_products_unit ON products(unit_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted);
CREATE INDEX IF NOT EXISTS idx_products_sort ON products(sort_order);
