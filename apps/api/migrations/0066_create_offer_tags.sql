-- offer_tags: Teklif dahil/hariç etiketleri
CREATE TABLE IF NOT EXISTS offer_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('dahil', 'haric')),
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offer_tags_type ON offer_tags(type);
CREATE INDEX IF NOT EXISTS idx_offer_tags_sort ON offer_tags(sort_order);
