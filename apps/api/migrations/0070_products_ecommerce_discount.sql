-- E-ticaret liste fiyatı iskontosu: genel fiyat üzerinden yüzde veya sabit tutar
ALTER TABLE products ADD COLUMN ecommerce_discount_type INTEGER NOT NULL DEFAULT 0;
-- 0 = yüzde (0–100), 1 = sabit tutar (genel fiyat ile aynı para biriminde düşülecek tutar)
ALTER TABLE products ADD COLUMN ecommerce_discount_value REAL NOT NULL DEFAULT 0;
