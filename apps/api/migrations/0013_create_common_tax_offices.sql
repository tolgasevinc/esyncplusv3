-- common_tax_offices: Vergi daireleri tablosu (notes-db.md)
CREATE TABLE IF NOT EXISTS common_tax_offices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  city TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_common_tax_offices_code ON common_tax_offices(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_common_tax_offices_status ON common_tax_offices(status);
CREATE INDEX IF NOT EXISTS idx_common_tax_offices_is_deleted ON common_tax_offices(is_deleted);
CREATE INDEX IF NOT EXISTS idx_common_tax_offices_city ON common_tax_offices(city);
