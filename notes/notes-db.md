### Veritabanı Tablo İsimleri

### Ortak Alanlar

status
is_deleted
created_at
updated_at

**product_marketplaces**

- name
- code
- logo

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

**product_currencies**

- name
- code
- symbol
- is_default
- sort_order

**customer_types**

- name
- code
- description
- sort_order

**product_tax_rates**

- name
- value
- description
- sort_order

**product_price_types**
- name
  
**product_prices**
- producs_id
- price_type_id
- price
- currency

**e_documents**
- date
- uuid
- invoice_no
- seller_title
- buyer_title
- directory
- file_name
- total_price
- tax_value
- tax_rate

**app_settings**

- category
- key
- value
- description

**sidebar_menu_items**

- item_id (benzersiz, client id)
- sort_order
- type (menu | separator)
- label
- link
- module_id
- icon_path
- separator_color
- separator_thickness

**suppliers**

- name
- brand_id
- soruce_type (excel, xml, cvs)
- currency_id
- source_file
- table_name
- record_count
- column_mappings
- column_types

**CUSTOMER TABLOLARI**

**customer_groups**
- name (unique)
- code
- description
- 
**customer_types**
- name
- code
- type (şahıs, firma)
- description
- 
**customer_legal_types**
- name (TEMELFATURA, TICARIFATURA, IHRACAT, EARSIV)
- description

**customers**
- title
- code
- group_id
- type_id
- legal_type_id
- tags (json)
- sales_user_id
- identity_id
- tax_no
- tax_office
- e-mail
- phone
- phone2
- phone_mobil
- external_refs (json) - (parasut_id, dia_code, opencart_code, vs)

**customer_addresses**
- customer_id
- type (enum=Fatura, Sevkiyat, Project, Other)
- title
- contact_name
- phone
- e-mail
- phone_mobile
- country_code (default=TR)
- city
- district
- post_code
- address_line_1
- address_line_2
- latitude, longitude
- googlemaplink
- is_default

**customer_contacts**
- customer_id
- full_name
- role (satıanlam, muhasebe, şantiye şefi, firma sahibi, yönetici)
- phone
- phone_mobile
- e-mail
- is_primary
- notes

**offers**
- date
- order_no
- uuid
- customer_id
- contact_id
- description
- notes
- discount_1
- discount_2
- discount_3
- discount_4
- discount_15

**offer_items**
- offer_id
- product_id
- amount
- unit_price
- line_discount
- tax_rate

**offer_notes**
- title
- description
- sort_order