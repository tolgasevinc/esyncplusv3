/** Uygulamadaki mevcut modüller - sidebar menülerine bağlanabilir */
export interface AppModule {
  id: string
  label: string
  path: string
}

export const APP_MODULES: AppModule[] = [
  { id: 'home', label: 'home', path: '/' },
  { id: 'products', label: 'products', path: '/products' },
  { id: 'parametreler', label: 'parameters', path: '/parametreler' },
  { id: 'parametreler-markalar', label: 'parameters › brands', path: '/parametreler/markalar' },
  { id: 'parametreler-birimler', label: 'parameters › units', path: '/parametreler/birimler' },
  { id: 'parametreler-gruplar', label: 'parameters › groups', path: '/parametreler/gruplar' },
  { id: 'parametreler-kategoriler', label: 'parameters › categories', path: '/parametreler/kategoriler' },
  { id: 'parametreler-urun-tipleri', label: 'parameters › product-types', path: '/parametreler/urun-tipleri' },
  { id: 'parametreler-para-birimleri', label: 'parameters › currencies', path: '/parametreler/para-birimleri' },
  { id: 'parametreler-vergi-oranlari', label: 'parameters › tax-rates', path: '/parametreler/vergi-oranlari' },
  { id: 'parametreler-musteri-tipleri', label: 'parameters › customer-types', path: '/parametreler/musteri-tipleri' },
  { id: 'ayarlar', label: 'settings', path: '/ayarlar' },
  { id: 'ayarlar-genel', label: 'settings › general', path: '/ayarlar/genel' },
  { id: 'ayarlar-veritabani', label: 'settings › database', path: '/ayarlar/veritabani' },
  { id: 'ayarlar-depolama', label: 'settings › storage', path: '/ayarlar/depolama' },
  { id: 'ayarlar-entegrasyonlar', label: 'settings › integrations', path: '/ayarlar/entegrasyonlar' },
  { id: 'ayarlar-hesaplamalar', label: 'settings › calculations', path: '/ayarlar/hesaplamalar' },
  { id: 'ayarlar-erisim', label: 'settings › access', path: '/ayarlar/erisim' },
  { id: 'ayarlar-tedarikciler', label: 'settings › suppliers', path: '/ayarlar/tedarikciler' },
  { id: 'ayarlar-veri-aktarimi', label: 'settings › data-transfer', path: '/ayarlar/veri-aktarimi' },
]

export function getModuleById(id: string): AppModule | undefined {
  return APP_MODULES.find((m) => m.id === id)
}

export function getModulePath(moduleId: string | undefined, fallbackLink: string): string {
  if (!moduleId) return fallbackLink
  const mod = getModuleById(moduleId)
  return mod?.path ?? fallbackLink
}
