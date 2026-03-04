-- offers: currency_id ve exchange_rate (teklifteki döviz kuru)
ALTER TABLE offers ADD COLUMN currency_id INTEGER;
ALTER TABLE offers ADD COLUMN exchange_rate REAL DEFAULT 1;
