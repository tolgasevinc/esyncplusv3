-- products: E-ticarete açık/kapalı seçimi (dışa aktarım ve entegrasyonlarda dahil edilecekler)
-- 1 = e-ticarete açık (dahil), 0 = kapalı (hariç)
ALTER TABLE products ADD COLUMN ecommerce_enabled INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_products_ecommerce_enabled ON products(ecommerce_enabled) WHERE is_deleted = 0;
