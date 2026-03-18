-- offer_note_categories: Teklif not grupları (Teslimat, Ödeme Şekli vb.)
CREATE TABLE IF NOT EXISTS offer_note_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  allow_custom INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offer_note_categories_sort ON offer_note_categories(sort_order);

-- offer_note_options: Her kategori için seçenekler
CREATE TABLE IF NOT EXISTS offer_note_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  enabled_by_default INTEGER DEFAULT 1,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES offer_note_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_offer_note_options_category ON offer_note_options(category_id);
