-- products: description alanı kaldırılıyor (product_descriptions tablosunda tutulacak)
-- SQLite 3.35+ DROP COLUMN destekler
ALTER TABLE products DROP COLUMN description;
