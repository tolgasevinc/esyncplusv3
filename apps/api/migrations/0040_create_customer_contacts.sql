-- customer_contacts: Müşteri iletişim kişileri
CREATE TABLE IF NOT EXISTS customer_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  phone_mobile TEXT,
  email TEXT,
  is_primary INTEGER DEFAULT 0,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_is_primary ON customer_contacts(is_primary);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_status ON customer_contacts(status);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_is_deleted ON customer_contacts(is_deleted);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_sort ON customer_contacts(sort_order);
