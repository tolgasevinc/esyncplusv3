-- suppliers: Tedarikçiler (notes-db.md)
-- column_mappings: JSON - kaynak sütun -> products sütun eşleştirmesi
-- Örn: {"Ürün Adı":"name","Stok Kodu":"sku","Fiyat":"price"}
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand_id INTEGER,
  source_type TEXT DEFAULT 'excel',
  currency_id INTEGER,
  source_file TEXT,
  table_name TEXT,
  record_count INTEGER DEFAULT 0,
  column_mappings TEXT,
  column_types TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_deleted ON suppliers(is_deleted);
CREATE INDEX IF NOT EXISTS idx_suppliers_sort ON suppliers(sort_order);
