-- offer_attachments: Teklif ek sayfaları (ürünle ilişkili)
CREATE TABLE IF NOT EXISTS offer_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- offer_attachment_products: Ek-ürün ilişkisi (N:N)
CREATE TABLE IF NOT EXISTS offer_attachment_products (
  attachment_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  PRIMARY KEY (attachment_id, product_id),
  FOREIGN KEY (attachment_id) REFERENCES offer_attachments(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_offer_attachment_products_product ON offer_attachment_products(product_id);
