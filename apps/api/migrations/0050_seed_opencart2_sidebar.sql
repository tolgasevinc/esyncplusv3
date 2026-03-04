-- OpenCart 2 sidebar menü öğesi ekle (mevcut değilse)
INSERT INTO sidebar_menu_items (item_id, sort_order, type, label, link, module_id, status)
SELECT 'opencart2', (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM sidebar_menu_items), 'menu', 'OpenCart 2', '', 'opencart2', 1
WHERE NOT EXISTS (SELECT 1 FROM sidebar_menu_items WHERE item_id = 'opencart2');
