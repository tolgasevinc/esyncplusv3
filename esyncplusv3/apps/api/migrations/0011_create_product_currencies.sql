-- product_currencies: Para birimleri tablosu (notes-db.md)
CREATE TABLE IF NOT EXISTS product_currencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  symbol TEXT,
  is_default INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_currencies_code ON product_currencies(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_product_currencies_status ON product_currencies(status);
CREATE INDEX IF NOT EXISTS idx_product_currencies_is_deleted ON product_currencies(is_deleted);
CREATE INDEX IF NOT EXISTS idx_product_currencies_sort ON product_currencies(sort_order);
CREATE INDEX IF NOT EXISTS idx_product_currencies_is_default ON product_currencies(is_default);
