-- OKM MySQL blog satırları ↔ IdeaSoft Admin API blog eşlemesi ve aktarım durumu
CREATE TABLE okm_blog_ideasoft_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  ideasoft_blog_id INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_table, source_id)
);

CREATE INDEX idx_okm_blog_sync_status ON okm_blog_ideasoft_sync(sync_status);
CREATE INDEX idx_okm_blog_sync_table ON okm_blog_ideasoft_sync(source_table);
