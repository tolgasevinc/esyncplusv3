-- customers tablosuna adres alanları ekle
ALTER TABLE customers ADD COLUMN address_line_1 TEXT;
ALTER TABLE customers ADD COLUMN address_line_2 TEXT;
ALTER TABLE customers ADD COLUMN city TEXT;
ALTER TABLE customers ADD COLUMN district TEXT;
ALTER TABLE customers ADD COLUMN post_code TEXT;
