-- common_tax_offices tablosuna description sütunu ekle
-- Not: Sütun zaten varsa bu migration atlanmalı veya hata yok sayılır
ALTER TABLE common_tax_offices ADD COLUMN description TEXT;
