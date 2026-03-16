-- dia_vergidaireleri: MySQL dia_vergidaireleri'den aktarılan vergi dairesi verileri
CREATE TABLE IF NOT EXISTS dia_vergidaireleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vergidairesiadi TEXT,
  sehir TEXT,
  vdkod INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dia_vergidaireleri_sehir ON dia_vergidaireleri(sehir);
CREATE INDEX IF NOT EXISTS idx_dia_vergidaireleri_vdkod ON dia_vergidaireleri(vdkod);
