-- common_cities: Şehirler tablosu
CREATE TABLE IF NOT EXISTS common_cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_common_cities_code ON common_cities(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_common_cities_status ON common_cities(status);
CREATE INDEX IF NOT EXISTS idx_common_cities_is_deleted ON common_cities(is_deleted);
CREATE INDEX IF NOT EXISTS idx_common_cities_sort ON common_cities(sort_order);
