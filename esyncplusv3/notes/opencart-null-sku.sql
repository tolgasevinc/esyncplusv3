-- OpenCart oc_product tablosunda sku alanını NULL yap
-- Model alanı ana ürün eşleştirmesi için kullanılacak, sku kullanılmayacak
-- MySQL OpenCart veritabanında çalıştırın
-- Tablo öneki farklıysa (örn. opencart_) değiştirin

UPDATE oc_product SET sku = NULL;
