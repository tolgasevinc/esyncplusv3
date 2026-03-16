-- products tablosundan ecommerce_price, ecommerce_currency_id kaldır
-- (Eski 0031 uygulanmış DB'ler için - bu kolonlar product_prices tablosuna taşındı)
-- Tablo yeniden oluşturarak kolonları kaldır (her iki durumda da çalışır: kolon varsa/yoksa)
-- D1: FK doğrulaması transaction sonuna ertelenir (product_package_items vb. products'a referans veriyor)
PRAGMA defer_foreign_keys = on;

CREATE TABLE products_new (
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

INSERT INTO products_new SELECT id, name, sku, barcode, brand_id, category_id, type_id, unit_id, currency_id, price, quantity, image, tax_rate, supplier_code, gtip_code, sort_order, status, is_deleted, created_at, updated_at FROM products;

DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type_id);
CREATE INDEX IF NOT EXISTS idx_products_unit ON products(unit_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted);
CREATE INDEX IF NOT EXISTS idx_products_sort ON products(sort_order);

PRAGMA defer_foreign_keys = off;
