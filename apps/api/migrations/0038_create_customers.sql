-- customers: Müşteri ana tablosu (notes-db.md)
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  code TEXT,
  group_id INTEGER,
  type_id INTEGER,
  legal_type_id INTEGER,
  tags TEXT,
  sales_user_id INTEGER,
  identity_id TEXT,
  tax_no TEXT,
  tax_office TEXT,
  email TEXT,
  phone TEXT,
  phone2 TEXT,
  phone_mobile TEXT,
  external_refs TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_group ON customers(group_id);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(type_id);
CREATE INDEX IF NOT EXISTS idx_customers_legal_type ON customers(legal_type_id);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_customers_tax_no ON customers(tax_no) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON customers(is_deleted);
CREATE INDEX IF NOT EXISTS idx_customers_sort ON customers(sort_order);
