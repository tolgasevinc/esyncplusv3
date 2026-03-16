-- product_price_types, product_prices (notes-db.md)
-- E-ticaret fiyatı products tablosundan ayrı tabloya taşınır

-- Fiyat tipi tablosu (Genel, E-Ticaret vb.)
CREATE TABLE IF NOT EXISTS product_price_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Ürün fiyatları (ürün + fiyat tipi + fiyat + para birimi)
CREATE TABLE IF NOT EXISTS product_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  price_type_id INTEGER NOT NULL,
  price REAL DEFAULT 0,
  currency_id INTEGER,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id, price_type_id)
);

CREATE INDEX IF NOT EXISTS idx_product_prices_product ON product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_price_type ON product_prices(price_type_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_is_deleted ON product_prices(is_deleted);

-- Varsayılan E-Ticaret fiyat tipi
INSERT OR IGNORE INTO product_price_types (id, name, code, sort_order) VALUES (1, 'E-Ticaret Fiyatı', 'ecommerce', 0);
