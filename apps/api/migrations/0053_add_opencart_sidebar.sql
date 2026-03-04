-- OpenCart sayfası sidebar'a ekle
INSERT INTO sidebar_menu_items (item_id, sort_order, type, label, link, module_id, status)
SELECT 'opencart', (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM sidebar_menu_items), 'menu', 'OpenCart', '', 'opencart', 1
WHERE NOT EXISTS (SELECT 1 FROM sidebar_menu_items WHERE item_id = 'opencart');
