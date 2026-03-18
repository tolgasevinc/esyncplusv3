-- offers: Dahil olanlar ve hariç olanlar etiket ID'leri (JSON array)
ALTER TABLE offers ADD COLUMN include_tag_ids TEXT;
ALTER TABLE offers ADD COLUMN exclude_tag_ids TEXT;
