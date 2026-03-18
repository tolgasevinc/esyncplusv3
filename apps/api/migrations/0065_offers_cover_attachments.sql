-- offers: Ön sayfa ve ek seçimleri
ALTER TABLE offers ADD COLUMN include_cover_page INTEGER DEFAULT 0;
ALTER TABLE offers ADD COLUMN include_attachment_ids TEXT;
