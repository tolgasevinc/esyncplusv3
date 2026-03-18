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
  { id: 'parasut', label: 'Paraşüt', path: '/parasut' },
  { id: 'parasut-products', label: 'Paraşüt › Ürünler', path: '/parasut/products' },
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
