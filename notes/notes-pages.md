**Sayfa Tasarım Kuralları**

- Sayfalarda sabit header alanı olacak, solda gerekiyors geri butonu (ikon ve çerçeveli) sağında sayfa başlığı
  ve altında açıklaması olacak, sağ başta refresh butonu sadece ikon.
- altta sabit bir footer alanı olacak.
- tooltip butonlarda ve başka yerlerde hemen görünsün ve standarttan 1 birim büyük olsun

**Kart/Liste Sayfaları**

- Headerda sağa yaslı olarak yeni ve refresh butonları sadece ikon olarak bulunur. solunda arama kutusu olur, gerekli sayfalarda toggle buton veya dropdown olarak filtre seçenekleri de olur.
- arama veya filtreleme işlemi yapıldığında refresh yanında reset butonu görünür x ikonu ile
- tablo ve liste içeren sayfaların footer alanında solda sayfalama ve kayıt sayıları (toplam ve göstterilen) olur.
- satırlarda işlem butonu olmayacak, satırlara tıkladığımızda edit modal açılsın, modal footer da ikon olarak sil, kopyala, kaydet butonları olacak ve sağa yaslı olacak, modallarda aktif/pasif switch footer da sola yaslı olmalı
- sayfalama < << 1 2 3 4 .. 20 >> > şeklinde olmalı
- sayfada gösterilecek kayıt sayısı ayarı toggle buton olmalı, Sığdır, 10, 25, 50, 100. Varsayılan (default) Sığdır seçili yüklenecek.
- Kayıt: X/Y (Gösterilen/Toplam) ve Sayfa A/B (Mevcut/Toplam)

**Görsel İşlemleri**

- kayıtlara görsel eklemek gerektiğinde textbox ile görsel linki göstereceğiz, pasif olacak, textbox'a bitişik ikon olarak yükle ve linkten indir butonları olacak. yükle ile lokalden bir görsel dosyasını seçebiliriz veya linkten indir ile açılan modaldan bir web linki girilecek textbox, link yapıştırıldığında avatar boyutunda görseli gösteririz ve kurallara göre görseli işleyip storage alanında tanımlanmış olan klasöre kaydederiz. linkini de textboxa yapıştırırız.
- brand görselleri 50x50 px ve kare olacak, kare değilse kısa kenarı uzun kenarın ölçüsüne büyüterek kare yapacağız. büyütürken kenardaki renk kodu neyse eklediğimiz alanları o renk ile dolduracağız.
- product görselleri 1000x1000 olacak, kare olacak, kare değilse yukarıda açıklandığı gibi boyut değişimi yapılacak.
- müşteri logosu görselleri 50x50 olacak
- sidebar ikon görselleri 50x50 olacak

**Modal Tassarım Kuralları**

- Header ve Footer alanı olacak
- Footer da sola yaslı sıra kontrolü ve hemen yanında aktif/pasif switch kontrolü
- Footer da sağa yaslı kaydet, kopyala, sil butonları, sadece ikon olarak. butonlar gri çerçeveli olacak.
