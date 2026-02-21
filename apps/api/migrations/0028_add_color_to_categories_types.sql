-- Renk sütunu: product_categories, product_types, customer_types
ALTER TABLE product_categories ADD COLUMN color TEXT;
ALTER TABLE product_types ADD COLUMN color TEXT;
ALTER TABLE customer_types ADD COLUMN color TEXT;
