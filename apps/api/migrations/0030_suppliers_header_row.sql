-- table_name -> header_row: Kaynak dosyada başlıkların bulunduğu satır (1 tabanlı)
ALTER TABLE suppliers ADD COLUMN header_row INTEGER DEFAULT 1;
-- SQLite 3.35+ DROP COLUMN
ALTER TABLE suppliers DROP COLUMN table_name;
