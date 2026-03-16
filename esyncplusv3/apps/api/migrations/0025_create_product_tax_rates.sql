-- product_tax_rates: Vergi oranları tablosu (notes-db.md)
CREATE TABLE IF NOT EXISTS product_tax_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_tax_rates_status ON product_tax_rates(status);
CREATE INDEX IF NOT EXISTS idx_product_tax_rates_is_deleted ON product_tax_rates(is_deleted);
CREATE INDEX IF NOT EXISTS idx_product_tax_rates_sort ON product_tax_rates(sort_order);
