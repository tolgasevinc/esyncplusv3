-- customer_types: Müşteri tipleri tablosu (notes-db.md)
CREATE TABLE IF NOT EXISTS customer_types (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_types_code ON customer_types(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_customer_types_status ON customer_types(status);
CREATE INDEX IF NOT EXISTS idx_customer_types_is_deleted ON customer_types(is_deleted);
CREATE INDEX IF NOT EXISTS idx_customer_types_sort ON customer_types(sort_order);
