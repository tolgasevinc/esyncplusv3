-- products_units tablosu (notes-db.md'ye göre)
CREATE TABLE IF NOT EXISTS products_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_units_code ON products_units(code);
CREATE INDEX IF NOT EXISTS idx_products_units_status ON products_units(status);
CREATE INDEX IF NOT EXISTS idx_products_units_is_deleted ON products_units(is_deleted);
