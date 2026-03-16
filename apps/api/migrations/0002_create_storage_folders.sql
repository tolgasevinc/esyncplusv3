-- storage_folders: R2'de döküman, resim, video klasör tanımları
CREATE TABLE IF NOT EXISTS storage_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'document',
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Varsayılan klasörler: documents, images, videos
INSERT INTO storage_folders (name, path, type, sort_order) VALUES
  ('Dökümanlar', 'documents/', 'document', 1),
  ('Resimler', 'images/', 'image', 2),
  ('Videolar', 'videos/', 'video', 3);
