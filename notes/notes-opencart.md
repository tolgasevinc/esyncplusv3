**Ürün Tabloları**

CREATE TABLE `oc_product` (
`product_id` int(11) NOT NULL AUTO_INCREMENT,
`feed_product_id` int(11) NOT NULL,
`import_id` int(11) NOT NULL,
`import_active_product` tinyint(1) NOT NULL DEFAULT 0,
`model` varchar(64) NOT NULL,
`sku` varchar(64) NOT NULL,
`upc` varchar(12) NOT NULL,
`ean` varchar(14) NOT NULL,
`jan` varchar(13) NOT NULL,
`isbn` varchar(17) NOT NULL,
`mpn` varchar(64) NOT NULL,
`location` varchar(128) NOT NULL,
`quantity` int(4) NOT NULL DEFAULT 0,
`stock_status_id` int(11) NOT NULL,
`image` varchar(255) DEFAULT NULL,
`manufacturer_id` int(11) NOT NULL,
`shipping` tinyint(1) NOT NULL DEFAULT 1,
`price` decimal(15,4) NOT NULL DEFAULT 0.0000,
`points` int(8) NOT NULL DEFAULT 0,
`tax_class_id` int(11) NOT NULL,
`date_available` date NOT NULL DEFAULT '0000-00-00',
`weight` decimal(15,8) NOT NULL DEFAULT 0.00000000,
`weight_class_id` int(11) NOT NULL DEFAULT 0,
`length` decimal(15,8) NOT NULL DEFAULT 0.00000000,
`width` decimal(15,8) NOT NULL DEFAULT 0.00000000,
`height` decimal(15,8) NOT NULL DEFAULT 0.00000000,
`length_class_id` int(11) NOT NULL DEFAULT 0,
`subtract` tinyint(1) NOT NULL DEFAULT 1,
`minimum` int(11) NOT NULL DEFAULT 1,
`sort_order` int(11) NOT NULL DEFAULT 0,
`status` tinyint(1) NOT NULL DEFAULT 0,
`viewed` int(5) NOT NULL DEFAULT 0,
`date_added` datetime NOT NULL,
`date_modified` datetime NOT NULL,
`meta_robots` varchar(40) NOT NULL,
`seo_canonical` varchar(32) NOT NULL,
`import_batch` varchar(64) DEFAULT NULL,
PRIMARY KEY (`product_id`)
) ENGINE=MyISAM AUTO_INCREMENT=75 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_attribute` (
`product_id` int(11) NOT NULL,
`attribute_id` int(11) NOT NULL,
`language_id` int(11) NOT NULL,
`text` text NOT NULL,
PRIMARY KEY (`product_id`,`attribute_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_description` (
`product_id` int(11) NOT NULL,
`language_id` int(11) NOT NULL,
`name` varchar(255) NOT NULL,
`description` text NOT NULL,
`tag` text NOT NULL,
`meta_title` varchar(255) NOT NULL,
`meta_description` varchar(255) NOT NULL,
`meta_keyword` varchar(255) NOT NULL,
`seo_keyword` varchar(255) NOT NULL,
`seo_h1` varchar(255) NOT NULL,
`seo_h2` varchar(255) NOT NULL,
`seo_h3` varchar(255) NOT NULL,
`image_title` varchar(255) NOT NULL,
`image_alt` varchar(255) NOT NULL,
`bilgi` varchar(100) NOT NULL,
PRIMARY KEY (`product_id`,`language_id`),
KEY `name` (`name`),
FULLTEXT KEY `related_generator` (`name`,`description`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_discount` (
`product_discount_id` int(11) NOT NULL AUTO_INCREMENT,
`product_id` int(11) NOT NULL,
`customer_group_id` int(11) NOT NULL,
`quantity` int(4) NOT NULL DEFAULT 0,
`priority` int(5) NOT NULL DEFAULT 1,
`price` decimal(15,4) NOT NULL DEFAULT 0.0000,
`date_start` date NOT NULL DEFAULT '0000-00-00',
`date_end` date NOT NULL DEFAULT '0000-00-00',
PRIMARY KEY (`product_discount_id`),
KEY `product_id` (`product_id`)
) ENGINE=MyISAM AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_filter` (
`product_id` int(11) NOT NULL,
`filter_id` int(11) NOT NULL,
PRIMARY KEY (`product_id`,`filter_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_image` (
`product_image_id` int(11) NOT NULL AUTO_INCREMENT,
`product_id` int(11) NOT NULL,
`image` varchar(255) DEFAULT NULL,
`sort_order` int(3) NOT NULL DEFAULT 0,
PRIMARY KEY (`product_image_id`),
KEY `product_id` (`product_id`)
) ENGINE=MyISAM AUTO_INCREMENT=255 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_option` (
`product_option_id` int(11) NOT NULL AUTO_INCREMENT,
`product_id` int(11) NOT NULL,
`option_id` int(11) NOT NULL,
`value` text NOT NULL,
`required` tinyint(1) NOT NULL,
PRIMARY KEY (`product_option_id`)
) ENGINE=MyISAM AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_option_value` (
`product_option_value_id` int(11) NOT NULL AUTO_INCREMENT,
`product_option_id` int(11) NOT NULL,
`product_id` int(11) NOT NULL,
`option_id` int(11) NOT NULL,
`option_value_id` int(11) NOT NULL,
`quantity` int(3) NOT NULL,
`subtract` tinyint(1) NOT NULL,
`price` decimal(15,4) NOT NULL,
`price_prefix` varchar(1) NOT NULL,
`points` int(8) NOT NULL,
`points_prefix` varchar(1) NOT NULL,
`weight` decimal(15,8) NOT NULL,
`weight_prefix` varchar(1) NOT NULL,
`default_status` int(11) NOT NULL,
`model` varchar(64) DEFAULT NULL,
`stock_status_id` int(11) NOT NULL DEFAULT 0,
PRIMARY KEY (`product_option_value_id`),
KEY `bf_product_option_value` (`product_id`,`option_value_id`)
) ENGINE=MyISAM AUTO_INCREMENT=66 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_option_value_data` (
`product_option_value_data_id` int(11) NOT NULL AUTO_INCREMENT,
`product_option_value_id` int(11) NOT NULL,
`product_id` int(11) NOT NULL,
`image` varchar(255) NOT NULL,
`model` varchar(255) NOT NULL,
`sku` varchar(255) NOT NULL,
`upc` varchar(255) NOT NULL,
`ean` varchar(255) NOT NULL,
`jan` varchar(255) NOT NULL,
`customer_group_ids` text NOT NULL,
PRIMARY KEY (`product_option_value_data_id`)
) ENGINE=MyISAM AUTO_INCREMENT=147 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

CREATE TABLE `oc_product_recurring` (
`product_id` int(11) NOT NULL,
`recurring_id` int(11) NOT NULL,
`customer_group_id` int(11) NOT NULL,
PRIMARY KEY (`product_id`,`recurring_id`,`customer_group_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_related` (
`product_id` int(11) NOT NULL,
`related_id` int(11) NOT NULL,
PRIMARY KEY (`product_id`,`related_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_reward` (
`product_reward_id` int(11) NOT NULL AUTO_INCREMENT,
`product_id` int(11) NOT NULL DEFAULT 0,
`customer_group_id` int(11) NOT NULL DEFAULT 0,
`points` int(8) NOT NULL DEFAULT 0,
PRIMARY KEY (`product_reward_id`)
) ENGINE=MyISAM AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_special` (
`product_special_id` int(11) NOT NULL AUTO_INCREMENT,
`product_id` int(11) NOT NULL,
`customer_group_id` int(11) NOT NULL,
`priority` int(5) NOT NULL DEFAULT 1,
`price` decimal(15,4) NOT NULL DEFAULT 0.0000,
`date_start` date NOT NULL DEFAULT '0000-00-00',
`date_end` date NOT NULL DEFAULT '0000-00-00',
`bulk_special` tinyint(4) NOT NULL,
PRIMARY KEY (`product_special_id`),
KEY `product_id` (`product_id`)
) ENGINE=MyISAM AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_to_category` (
`product_id` int(11) NOT NULL,
`category_id` int(11) NOT NULL,
PRIMARY KEY (`product_id`,`category_id`),
KEY `category_id` (`category_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_to_download` (
`product_id` int(11) NOT NULL,
`download_id` int(11) NOT NULL,
PRIMARY KEY (`product_id`,`download_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_to_layout` (
`product_id` int(11) NOT NULL,
`store_id` int(11) NOT NULL,
`layout_id` int(11) NOT NULL,
PRIMARY KEY (`product_id`,`store_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_product_to_store` (
`product_id` int(11) NOT NULL,
`store_id` int(11) NOT NULL DEFAULT 0,
PRIMARY KEY (`product_id`,`store_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

**Kategori Tabloları**

CREATE TABLE `oc_category` (
`category_id` int(11) NOT NULL AUTO_INCREMENT,
`image` varchar(255) DEFAULT NULL,
`yomenu_image` varchar(255) DEFAULT '',
`yomenu_icon` varchar(255) DEFAULT '',
`parent_id` int(11) NOT NULL DEFAULT 0,
`top` tinyint(1) NOT NULL,
`column` int(11) NOT NULL,
`sort_order` int(11) NOT NULL DEFAULT 0,
`status` tinyint(1) NOT NULL,
`date_added` datetime NOT NULL,
`date_modified` datetime NOT NULL,
PRIMARY KEY (`category_id`),
KEY `parent_id` (`parent_id`)
) ENGINE=MyISAM AUTO_INCREMENT=184 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_category_description` (
`category_id` int(11) NOT NULL,
`language_id` int(11) NOT NULL,
`name` varchar(255) NOT NULL,
`description` text NOT NULL,
`meta_title` varchar(255) NOT NULL,
`meta_description` varchar(255) NOT NULL,
`meta_keyword` varchar(255) NOT NULL,
`seo_keyword` varchar(255) NOT NULL,
`seo_h1` varchar(255) NOT NULL,
`seo_h2` varchar(255) NOT NULL,
`seo_h3` varchar(255) NOT NULL,
PRIMARY KEY (`category_id`,`language_id`),
KEY `name` (`name`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_category_filter` (
`category_id` int(11) NOT NULL,
`filter_id` int(11) NOT NULL,
PRIMARY KEY (`category_id`,`filter_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_category_path` (
`category_id` int(11) NOT NULL,
`path_id` int(11) NOT NULL,
`level` int(11) NOT NULL,
PRIMARY KEY (`category_id`,`path_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_category_to_layout` (
`category_id` int(11) NOT NULL,
`store_id` int(11) NOT NULL,
`layout_id` int(11) NOT NULL,
PRIMARY KEY (`category_id`,`store_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `oc_category_to_store` (
`category_id` int(11) NOT NULL,
`store_id` int(11) NOT NULL,
PRIMARY KEY (`category_id`,`store_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

**Ek Açıklamalar**

1. Kategori (Category) Tablo Yapısı
   OpenCart'ta kategoriler hiyerarşiktir ve dil verileri ayrı tutulur.

Tablo Adı Açıklama Önemli Sütunlar
oc_category Ana kategori verisi. category_id, parent_id, status, sort_order
oc_category_description Dile bağlı isim ve meta verileri. category_id, language_id, name, description
oc_category_path Kategori ağacı (Breadcrumb için). category_id, path_id (ata ID), level
oc_category_to_store Hangi mağazada görüneceği. category_id, store_id (Varsayılan: 0) 2. Ürün (Product) Tablo Yapısı
Ürünler de benzer şekilde parçalıdır. Bir ürünün "fiyatı" ana tablodayken, "ismi" açıklama tablosundadır.

Tablo Adı Açıklama Önemli Sütunlar
oc_product Teknik veriler, stok ve fiyat. product_id, model, price, quantity, status, image
oc_product_description İsim, açıklama ve SEO verileri. product_id, language_id, name, description, tag
oc_product_to_category Kritik Bağlantı! product_id, category_id
oc_product_to_store Mağaza eşleşmesi. product_id, store_id 3. Yeni Bir Ürün Eklerken İzlenmesi Gereken Adımlar
Sadece oc_product tablosuna kayıt atarsan ürün panelde görünse de sitede hatalı çıkar veya hiç görünmez. Eksiksiz bir manuel kayıt için şu sırayı izlemelisin:

oc_product: Ana kaydı oluştur (Model, fiyat, ağırlık vb.).
oc_product_description: Ürünün adını ve açıklamasını ekle (Dil ID'sine dikkat).
oc_product_to_store: Ürünü mağazaya ata (Genelde store_id = 0).
oc_product_to_category: Ürünü en az bir kategoriye bağla.
oc_product_to_layout: (Opsiyonel ama önerilir) Tasarım düzenine bağla.

"OpenCart veritabanında product_id üzerinden oc_product ve oc_product_description tablolarını JOIN yap. Ayrıca bu ürünün hangi kategoride olduğunu oc_product_to_category üzerinden oc_category_description tablosuna bağlayarak kategori ismini de getir."
