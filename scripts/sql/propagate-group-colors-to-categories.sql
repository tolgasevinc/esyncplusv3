-- Ürün grubu (product_categories: group_id=0 veya NULL, ana kayıt) rengini
-- o gruba bağlı tüm ana kategori ve alt kategorilere kopyalar.
-- Çalıştırma (API klasöründen): npx wrangler d1 execute esync-db --remote --file=../../scripts/sql/propagate-group-colors-to-categories.sql
-- Yerel: --local

UPDATE product_categories AS c
SET
  color = TRIM((
    SELECT g.color
    FROM product_categories AS g
    WHERE g.id = c.group_id
      AND g.is_deleted = 0
      AND (g.group_id IS NULL OR g.group_id = 0)
      AND (g.category_id IS NULL OR g.category_id = 0)
  )),
  updated_at = datetime('now')
WHERE c.is_deleted = 0
  AND c.group_id IS NOT NULL
  AND c.group_id != 0
  AND EXISTS (
    SELECT 1
    FROM product_categories AS g
    WHERE g.id = c.group_id
      AND g.is_deleted = 0
      AND (g.group_id IS NULL OR g.group_id = 0)
      AND (g.category_id IS NULL OR g.category_id = 0)
      AND g.color IS NOT NULL
      AND LENGTH(TRIM(g.color)) > 0
  );
