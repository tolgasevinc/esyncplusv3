-- dia_carikartlar: MySQL dia_cari_kartlar'dan aktarılan cari kart verileri
CREATE TABLE IF NOT EXISTS dia_carikartlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carikayitturu TEXT,
  carikartkodu TEXT,
  unvan TEXT,
  vergidairesi INTEGER,
  verginumarasi TEXT,
  grupkodu TEXT,
  ozelkod1 TEXT,
  eposta TEXT,
  tckimlikno TEXT,
  adresler_adres_adresadi TEXT,
  adresler_adres_adres1 TEXT,
  adresler_adres_ilce TEXT,
  adresler_adres_sehir TEXT,
  adresler_adres_telefon1 TEXT,
  adresler_adres_ceptel TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dia_carikartlar_carikartkodu ON dia_carikartlar(carikartkodu);
