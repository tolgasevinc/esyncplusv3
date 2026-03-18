-- Varsayılan teklif not kategorileri ve seçenekleri
INSERT INTO offer_note_categories (code, label, sort_order, allow_custom) VALUES
  ('teslimat', 'Teslimat', 1, 0),
  ('odeme_sekli', 'Ödeme Şekli', 2, 0),
  ('odeme_vadesi', 'Ödeme Vadesi', 3, 1),
  ('gecerlilik', 'Geçerlilik', 4, 0),
  ('odeme_kuru', 'Ödeme Kuru', 5, 0),
  ('uygulama', 'Uygulama', 6, 0);

-- Teslimat: Müşteri Adresinte Teslim, Depo Teslim, Kargo/Ambar Teslim
INSERT INTO offer_note_options (category_id, label, sort_order, enabled_by_default) VALUES
  (1, 'Müşteri Adresinte Teslim.', 0, 1),
  (1, 'Depo Teslim.', 1, 1),
  (1, 'Kargo/Ambar Teslim.', 2, 1);

-- Ödeme Şekli: Siparişte, İş Tesliminde
INSERT INTO offer_note_options (category_id, label, sort_order, enabled_by_default) VALUES
  (2, 'Siparişte', 0, 1),
  (2, 'İş Tesliminde', 1, 1);

-- Ödeme Vadesi
INSERT INTO offer_note_options (category_id, label, sort_order, enabled_by_default) VALUES
  (3, 'Siparişte Nakit', 0, 1),
  (3, 'Nakit', 1, 1),
  (3, 'İş tesliminde nakit', 2, 1),
  (3, 'Fatura tarihinden itibaren 7 (yedi) gün.', 3, 1),
  (3, 'Fatura tarihinden itibaren 30 (otuz) gün.', 4, 1);

-- Geçerlilik
INSERT INTO offer_note_options (category_id, label, sort_order, enabled_by_default) VALUES
  (4, 'Teklifimiz 10 (on) gün geçerlidir.', 0, 1),
  (4, 'Teklifimiz 20 (yirmi) gün geçerlidir.', 1, 1);

-- Ödeme Kuru (tek seçenek)
INSERT INTO offer_note_options (category_id, label, sort_order, enabled_by_default) VALUES
  (5, 'Ödeme teklifte belirtilen kur ile ödeme gününde hesaplanır. Ödeme Türk Lirası olarak yapılacaktır.', 0, 1);

-- Uygulama
INSERT INTO offer_note_options (category_id, label, sort_order, enabled_by_default) VALUES
  (6, 'Montaj Dahil Değildir.', 0, 1),
  (6, 'Montaj Dahildir.', 1, 1);
