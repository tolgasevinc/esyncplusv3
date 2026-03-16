-- offer_items: 5 iskonto, type (product/expense), description
ALTER TABLE offer_items ADD COLUMN type TEXT DEFAULT 'product';
ALTER TABLE offer_items ADD COLUMN description TEXT;
ALTER TABLE offer_items ADD COLUMN discount_1 REAL DEFAULT 0;
ALTER TABLE offer_items ADD COLUMN discount_2 REAL DEFAULT 0;
ALTER TABLE offer_items ADD COLUMN discount_3 REAL DEFAULT 0;
ALTER TABLE offer_items ADD COLUMN discount_4 REAL DEFAULT 0;
ALTER TABLE offer_items ADD COLUMN discount_5 REAL DEFAULT 0;
