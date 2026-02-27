-- customer_legal_types: Müşteri yasal tipleri (TEMELFATURA, TICARIFATURA, IHRACAT, EARSIV)
CREATE TABLE IF NOT EXISTS customer_legal_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_legal_types_name ON customer_legal_types(name) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_customer_legal_types_status ON customer_legal_types(status);
CREATE INDEX IF NOT EXISTS idx_customer_legal_types_is_deleted ON customer_legal_types(is_deleted);

INSERT OR IGNORE INTO customer_legal_types (name, description, sort_order) VALUES
  ('TEMELFATURA', 'Temel e-fatura', 1),
  ('TICARIFATURA', 'Ticari e-fatura', 2),
  ('IHRACAT', 'İhracat', 3),
  ('EARSIV', 'E-arşiv fatura', 4);
