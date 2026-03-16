-- Varsayılan ürün grupları: Ürün, Yedek Parça, Aksesuar
INSERT OR IGNORE INTO product_item_groups (id, name, code, sort_order, status) VALUES
  (1, 'Ürün', 'URUN', 1, 1),
  (2, 'Yedek Parça', 'YEDEK', 2, 1),
  (3, 'Aksesuar', 'AKSESUAR', 3, 1);
