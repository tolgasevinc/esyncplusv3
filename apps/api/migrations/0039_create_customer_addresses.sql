-- customer_addresses: Müşteri adresleri (Fatura, Sevkiyat, Project, Other)
CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'Fatura',
  title TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  phone_mobile TEXT,
  country_code TEXT DEFAULT 'TR',
  city TEXT,
  district TEXT,
  post_code TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  latitude REAL,
  longitude REAL,
  google_map_link TEXT,
  is_default INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_type ON customer_addresses(type);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_is_default ON customer_addresses(is_default);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_status ON customer_addresses(status);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_is_deleted ON customer_addresses(is_deleted);
