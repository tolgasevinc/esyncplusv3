-- e_documents: E-fatura ve e-arşiv belgeleri (notes-db.md)
-- directory: e-documents/{gelen|giden|arsiv}/{YYYY}/{MM}/
CREATE TABLE IF NOT EXISTS e_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  uuid TEXT,
  invoice_no TEXT,
  seller_title TEXT,
  buyer_title TEXT,
  directory TEXT NOT NULL,
  file_name TEXT NOT NULL,
  total_price REAL,
  tax_value REAL,
  tax_rate REAL,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(directory, file_name)
);

CREATE INDEX IF NOT EXISTS idx_e_documents_directory ON e_documents(directory);
CREATE INDEX IF NOT EXISTS idx_e_documents_date ON e_documents(date);
CREATE INDEX IF NOT EXISTS idx_e_documents_invoice_no ON e_documents(invoice_no);
CREATE INDEX IF NOT EXISTS idx_e_documents_status ON e_documents(status);
CREATE INDEX IF NOT EXISTS idx_e_documents_is_deleted ON e_documents(is_deleted);
