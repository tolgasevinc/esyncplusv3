-- Önizleme: güncellenecek satırlar (dry-run)
-- npx wrangler d1 execute esync-db --remote --file=../../scripts/sql/propagate-group-colors-to-categories-preview.sql

SELECT
  c.id,
  c.name,
  c.code,
  c.group_id,
  c.category_id,
  c.color AS mevcut_renk,
  TRIM(g.color) AS uygulanacak_grup_rengi
FROM product_categories AS c
INNER JOIN product_categories AS g ON g.id = c.group_id
WHERE c.is_deleted = 0
  AND c.group_id IS NOT NULL
  AND c.group_id != 0
  AND g.is_deleted = 0
  AND (g.group_id IS NULL OR g.group_id = 0)
  AND (g.category_id IS NULL OR g.category_id = 0)
  AND g.color IS NOT NULL
  AND LENGTH(TRIM(g.color)) > 0
ORDER BY c.group_id, c.category_id, c.sort_order, c.name;
