-- OpenCart entegrasyonu kaldırıldı: sidebar menü öğelerini sil, fiyat_getir_price_type ayarını products kategorisine taşı

DELETE FROM sidebar_menu_items WHERE item_id IN ('opencart', 'opencart2');

-- fiyat_getir_price_type: opencart_mysql'den products'a taşı (api/products/by-sku endpoint'i için)
UPDATE app_settings SET category = 'products' WHERE category = 'opencart_mysql' AND key = 'fiyat_getir_price_type';
