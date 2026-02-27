-- dia_carikartlar: updated_at sütunu ekle (veri aktarımı upsert için gerekli)
ALTER TABLE dia_carikartlar ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
