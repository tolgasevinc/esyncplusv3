-- dia_vergidaireleri: updated_at sütunu ekle (veri aktarımı upsert için gerekli)
ALTER TABLE dia_vergidaireleri ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
