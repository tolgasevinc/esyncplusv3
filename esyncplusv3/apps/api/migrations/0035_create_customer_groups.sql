-- customer_groups: Müşteri grupları (notes-db.md)
CREATE TABLE IF NOT EXISTS customer_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_groups_name ON customer_groups(name) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_customer_groups_status ON customer_groups(status);
CREATE INDEX IF NOT EXISTS idx_customer_groups_is_deleted ON customer_groups(is_deleted);
CREATE INDEX IF NOT EXISTS idx_customer_groups_sort ON customer_groups(sort_order);
