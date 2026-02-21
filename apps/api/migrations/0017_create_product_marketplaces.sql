-- product_marketplaces: Pazar yerleri (Trendyol, Hepsiburada vb.)
-- İlişki: product_mappings.marketplace_id -> product_marketplaces.id
CREATE TABLE IF NOT EXISTS product_marketplaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  logo TEXT,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_marketplaces_code ON product_marketplaces(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_product_marketplaces_status ON product_marketplaces(status);
CREATE INDEX IF NOT EXISTS idx_product_marketplaces_is_deleted ON product_marketplaces(is_deleted);
