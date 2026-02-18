-- status ve is_deleted alanlarını INTEGER (0/1 = false/true) olarak düzelt
-- SQLite'da BOOLEAN yok, INTEGER 0=false, 1=true kullanılır

-- product_brands
CREATE TABLE product_brands_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  slug TEXT,
  image TEXT,
  description TEXT,
  website TEXT,
  country TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO product_brands_new SELECT id, name, code, slug, image, description, website, country, sort_order,
  CASE WHEN status IN ('active','1') OR status IS NULL THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(is_deleted,0) = 0 THEN 0 ELSE 1 END,
  created_at, updated_at FROM product_brands;
DROP TABLE product_brands;
ALTER TABLE product_brands_new RENAME TO product_brands;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_brands_code ON product_brands(code) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_product_brands_status ON product_brands(status);
CREATE INDEX IF NOT EXISTS idx_product_brands_is_deleted ON product_brands(is_deleted);
CREATE INDEX IF NOT EXISTS idx_product_brands_sort ON product_brands(sort_order);

-- products_units
CREATE TABLE products_units_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO products_units_new SELECT id, name, code, description, sort_order,
  CASE WHEN status IN ('active','1') OR status IS NULL THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(is_deleted,0) = 0 THEN 0 ELSE 1 END,
  created_at, updated_at FROM products_units;
DROP TABLE products_units;
ALTER TABLE products_units_new RENAME TO products_units;
CREATE INDEX IF NOT EXISTS idx_products_units_code ON products_units(code);
CREATE INDEX IF NOT EXISTS idx_products_units_status ON products_units(status);
CREATE INDEX IF NOT EXISTS idx_products_units_is_deleted ON products_units(is_deleted);

-- storage_folders
CREATE TABLE storage_folders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'document',
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO storage_folders_new SELECT id, name, path, type, sort_order,
  CASE WHEN status IN ('active','1') OR status IS NULL THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(is_deleted,0) = 0 THEN 0 ELSE 1 END,
  created_at, updated_at FROM storage_folders;
DROP TABLE storage_folders;
ALTER TABLE storage_folders_new RENAME TO storage_folders;

-- product_groups
CREATE TABLE product_groups_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO product_groups_new SELECT id, name, code, description, sort_order,
  CASE WHEN status IN ('active','1') OR status IS NULL THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(is_deleted,0) = 0 THEN 0 ELSE 1 END,
  created_at, updated_at FROM product_groups;
DROP TABLE product_groups;
ALTER TABLE product_groups_new RENAME TO product_groups;
CREATE INDEX IF NOT EXISTS idx_product_groups_code ON product_groups(code);
CREATE INDEX IF NOT EXISTS idx_product_groups_status ON product_groups(status);
CREATE INDEX IF NOT EXISTS idx_product_groups_is_deleted ON product_groups(is_deleted);

-- product_categories
CREATE TABLE product_categories_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER,
  category_id INTEGER,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  image TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES product_groups(id),
  FOREIGN KEY (category_id) REFERENCES product_categories(id)
);
INSERT INTO product_categories_new SELECT id, group_id, category_id, name, code, slug, description, image, icon, sort_order,
  CASE WHEN status IN ('active','1') OR status IS NULL THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(is_deleted,0) = 0 THEN 0 ELSE 1 END,
  created_at, updated_at FROM product_categories;
DROP TABLE product_categories;
ALTER TABLE product_categories_new RENAME TO product_categories;
CREATE INDEX IF NOT EXISTS idx_product_categories_group ON product_categories(group_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_status ON product_categories(status);
CREATE INDEX IF NOT EXISTS idx_product_categories_is_deleted ON product_categories(is_deleted);

-- app_settings
CREATE TABLE app_settings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  description TEXT,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO app_settings_new SELECT id, category, key, value, description,
  CASE WHEN status IN ('active','1') OR status IS NULL THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(is_deleted,0) = 0 THEN 0 ELSE 1 END,
  created_at, updated_at FROM app_settings;
DROP TABLE app_settings;
ALTER TABLE app_settings_new RENAME TO app_settings;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_category_key ON app_settings(category, key) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);
