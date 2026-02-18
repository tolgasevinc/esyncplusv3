-- app_settings: Uygulama ayarları (key-value, kategori bazlı)
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  description TEXT,
  status TEXT DEFAULT 'active',
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_category_key ON app_settings(category, key) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);
