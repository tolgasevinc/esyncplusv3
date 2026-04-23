/** Uygulamadaki mevcut modüller - sidebar menülerine bağlanabilir */
export interface AppModule {
  id: string
  label: string
  path: string
}

export const APP_MODULES: AppModule[] = [
  { id: 'home', label: 'home', path: '/' },
  { id: 'products', label: 'products', path: '/products' },
  { id: 'customers', label: 'customers', path: '/customers' },
  { id: 'teklifler', label: 'teklifler', path: '/teklifler' },
  { id: 'dia', label: 'Dia', path: '/dia' },
  { id: 'e-documents', label: 'e-documents', path: '/e-documents' },
  { id: 'suppliers', label: 'suppliers', path: '/parametreler/tedarikciler' },
  { id: 'parametreler', label: 'parameters', path: '/parametreler' },
  { id: 'parametreler-markalar', label: 'parameters › brands', path: '/parametreler/markalar' },
  { id: 'parametreler-birimler', label: 'parameters › units', path: '/parametreler/birimler' },
  { id: 'parametreler-gruplar', label: 'parameters › groups', path: '/parametreler/gruplar' },
  { id: 'parametreler-kategoriler', label: 'parameters › categories', path: '/parametreler/kategoriler' },
  { id: 'parametreler-urun-tipleri', label: 'parameters › product-types', path: '/parametreler/urun-tipleri' },
  { id: 'parametreler-para-birimleri', label: 'parameters › currencies', path: '/parametreler/para-birimleri' },
  { id: 'parametreler-fiyat-tipleri', label: 'parameters › price-types', path: '/parametreler/fiyat-tipleri' },
  { id: 'parametreler-vergi-oranlari', label: 'parameters › tax-rates', path: '/parametreler/vergi-oranlari' },
  { id: 'parametreler-musteri-tipleri', label: 'parameters › customer-types', path: '/parametreler/musteri-tipleri' },
  { id: 'parametreler-tedarikciler', label: 'parameters › suppliers', path: '/parametreler/tedarikciler' },
  { id: 'ayarlar', label: 'settings', path: '/ayarlar' },
  { id: 'ayarlar-genel', label: 'settings › general', path: '/ayarlar/genel' },
  { id: 'ayarlar-veritabani', label: 'settings › database', path: '/ayarlar/veritabani' },
  { id: 'ayarlar-depolama', label: 'settings › storage', path: '/ayarlar/depolama' },
  { id: 'ayarlar-entegrasyonlar', label: 'settings › integrations', path: '/ayarlar/entegrasyonlar' },
  { id: 'opencart', label: 'OpenCart', path: '/opencart' },
  { id: 'okm', label: 'OKM', path: '/okm' },
  { id: 'okm-blog', label: 'OKM › Blog', path: '/okm/blog' },
  { id: 'okm-products', label: 'OKM › Ürünler (eski site)', path: '/okm/products' },
  { id: 'trendyol', label: 'Trendyol', path: '/trendyol' },
  { id: 'trendyol-urunler', label: 'Trendyol › Ürünler', path: '/trendyol/urunler' },
  { id: 'trendyol-kategoriler', label: 'Trendyol › Kategoriler', path: '/trendyol/kategoriler' },
  { id: 'ideasoft', label: 'IdeaSoft', path: '/ideasoft' },
  { id: 'ideasoft-para-birimleri', label: 'IdeaSoft › Para birimleri', path: '/ideasoft/para-birimleri' },
  { id: 'ideasoft-markalar', label: 'IdeaSoft › Markalar', path: '/ideasoft/markalar' },
  { id: 'ideasoft-kategoriler', label: 'IdeaSoft › Kategoriler', path: '/ideasoft/kategoriler' },
  { id: 'ideasoft-birimler', label: 'IdeaSoft › Birimler', path: '/ideasoft/birimler' },
  { id: 'ideasoft-urun-resimleri', label: 'IdeaSoft › Ürün resimleri', path: '/ideasoft/urun-resimleri' },
  { id: 'ideasoft-urun-etiketleri', label: 'IdeaSoft › Kişisel Etiketler', path: '/ideasoft/urun-etiketleri' },
  { id: 'ideasoft-ekstra-ozellikler', label: 'IdeaSoft › Ekstra özellikler', path: '/ideasoft/ekstra-ozellikler' },
  { id: 'ideasoft-urunler', label: 'IdeaSoft › Ürünler', path: '/ideasoft/urunler' },
  { id: 'ideasoft2', label: 'IdeaSoft 2', path: '/ideasoft2' },
  { id: 'ideasoft2-urunler', label: 'IdeaSoft 2 › Ürünler', path: '/ideasoft2/urunler' },
  { id: 'ideasoft2-kategoriler', label: 'IdeaSoft 2 › Kategoriler', path: '/ideasoft2/kategoriler' },
  { id: 'ideasoft2-markalar', label: 'IdeaSoft 2 › Markalar', path: '/ideasoft2/markalar' },
  { id: 'parasut', label: 'Paraşüt', path: '/parasut' },
  { id: 'parasut-products', label: 'Paraşüt › Ürünler', path: '/parasut/products' },
  { id: 'parasut-customers', label: 'Paraşüt › Müşteriler', path: '/parasut/customers' },
  { id: 'parasut-brands', label: 'Paraşüt › Marka Eşleştirme', path: '/parasut/brands' },
  { id: 'ayarlar-hesaplamalar', label: 'settings › calculations', path: '/ayarlar/hesaplamalar' },
  { id: 'ayarlar-erisim', label: 'settings › access', path: '/ayarlar/erisim' },
  { id: 'ayarlar-tedarikciler', label: 'settings › suppliers', path: '/ayarlar/tedarikciler' },
  { id: 'ayarlar-veri-aktarimi', label: 'settings › data-transfer', path: '/ayarlar/veri-aktarimi' },
  { id: 'ayarlar-doviz-kurlari', label: 'settings › exchange-rates', path: '/ayarlar/doviz-kurlari' },
  { id: 'veri-aktarim', label: 'Veri Aktarım', path: '/veri-aktarim' },
]

export function getModuleById(id: string): AppModule | undefined {
  return APP_MODULES.find((m) => m.id === id)
}

export function getModulePath(moduleId: string | undefined, fallbackLink: string): string {
  if (!moduleId) return fallbackLink
  const mod = getModuleById(moduleId)
  return mod?.path ?? fallbackLink
}
