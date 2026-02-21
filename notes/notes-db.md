### Veritabanı Tablo İsimleri

### Ortak Alanlar

status
is_deleted
created_at
updated_at

**product_brands**

- name
- code (2 harf, genellikle marka adının ilk 2 harfi ama mevcutsa 1-3 harfleri olabilir. otomatik atanacak ama değiştirilebilecek)
- slug (meta slug)
- image (storagede kayıtlı link)
- description
- website
- country
- sort_order

**product_units**

- name
- code
- description
- sort_order

**product_categories**

- group_id
- category_id
- name
- code (ilk 2 harf veya 1+3)
- slug
- description
- image
- icon
- sort_order

**product-types**
- name
- code
- description
- sort_order

**app_settings**

- category
- key
- value
- description
