-- opencart2 sidebar menü öğesini opencart olarak güncelle (OpenCart REST API sayfası kaldırıldı, OC2 MySQL sayfası OpenCart adıyla kullanılacak)
-- item_id UNIQUE olduğu için, opencart zaten varsa önce sil (0053 tekrar ekleyecek)
DELETE FROM sidebar_menu_items WHERE item_id = 'opencart';
UPDATE sidebar_menu_items SET item_id = 'opencart', label = 'OpenCart', module_id = 'opencart' WHERE item_id = 'opencart2';
