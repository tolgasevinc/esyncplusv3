-- offers: Teklif ana tablosu (notes-db.md)
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (date('now')),
  order_no TEXT,
  uuid TEXT,
  customer_id INTEGER,
  contact_id INTEGER,
  description TEXT,
  notes TEXT,
  discount_1 REAL DEFAULT 0,
  discount_2 REAL DEFAULT 0,
  discount_3 REAL DEFAULT 0,
  discount_4 REAL DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offers_customer ON offers(customer_id);
CREATE INDEX IF NOT EXISTS idx_offers_date ON offers(date);
CREATE INDEX IF NOT EXISTS idx_offers_order_no ON offers(order_no) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_is_deleted ON offers(is_deleted);

-- offer_items: Teklif kalemleri
CREATE TABLE IF NOT EXISTS offer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id INTEGER NOT NULL,
  product_id INTEGER,
  amount REAL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  line_discount REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offer_items_offer ON offer_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_product ON offer_items(product_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_is_deleted ON offer_items(is_deleted);
