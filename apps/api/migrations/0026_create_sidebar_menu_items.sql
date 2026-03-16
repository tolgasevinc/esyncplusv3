-- sidebar_menu_items: Sidebar menü elemanları (menü linkleri ve ayırıcılar)
CREATE TABLE IF NOT EXISTS sidebar_menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'menu',
  label TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  module_id TEXT,
  icon_path TEXT,
  separator_color TEXT,
  separator_thickness INTEGER,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sidebar_menu_items_sort ON sidebar_menu_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_sidebar_menu_items_status ON sidebar_menu_items(status);
CREATE INDEX IF NOT EXISTS idx_sidebar_menu_items_is_deleted ON sidebar_menu_items(is_deleted);
