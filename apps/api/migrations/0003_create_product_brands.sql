-- product_brands: Marka tablosu (notes-db.md)
CREATE TABLE IF NOT EXISTS product_brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  slug TEXT,
  image TEXT,
  description TEXT,
  website TEXT,
  country TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_brands_code ON product_brands(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_product_brands_status ON product_brands(status);
CREATE INDEX IF NOT EXISTS idx_product_brands_is_deleted ON product_brands(is_deleted);
CREATE INDEX IF NOT EXISTS idx_product_brands_sort ON product_brands(sort_order);
