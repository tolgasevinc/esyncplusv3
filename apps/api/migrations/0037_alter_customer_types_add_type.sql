-- customer_types: type sütunu ekle (şahıs, firma)
ALTER TABLE customer_types ADD COLUMN type TEXT DEFAULT 'firma';
