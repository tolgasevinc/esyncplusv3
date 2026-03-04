-- exchange_rates: Döviz kuru geçmişi (TCMB'den günlük kayıt)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  currency_code TEXT NOT NULL,
  rate REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT DEFAULT 'tcmb'
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency ON exchange_rates(currency_code);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_recorded ON exchange_rates(recorded_at);
