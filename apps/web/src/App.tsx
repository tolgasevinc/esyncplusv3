import { lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Toaster } from 'sonner'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ThemeLoader } from '@/components/ThemeLoader'
import { HomePage } from '@/pages/HomePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ParametersPage } from '@/pages/ParametersPage'
import { ParasutPage } from '@/pages/ParasutPage'

const MarkalarPage = lazy(() => import('@/pages/parameters/MarkalarPage').then((m) => ({ default: m.MarkalarPage })))
const BirimlerPage = lazy(() => import('@/pages/parameters/BirimlerPage').then((m) => ({ default: m.BirimlerPage })))
const GruplarPage = lazy(() => import('@/pages/parameters/GruplarPage').then((m) => ({ default: m.GruplarPage })))
const KategorilerPage = lazy(() => import('@/pages/parameters/KategorilerPage').then((m) => ({ default: m.KategorilerPage })))
const UrunTipleriPage = lazy(() => import('@/pages/parameters/UrunTipleriPage').then((m) => ({ default: m.UrunTipleriPage })))
const UrunGruplariPage = lazy(() => import('@/pages/parameters/UrunGruplariPage').then((m) => ({ default: m.UrunGruplariPage })))
const ParaBirimleriPage = lazy(() => import('@/pages/parameters/ParaBirimleriPage').then((m) => ({ default: m.ParaBirimleriPage })))
const FiyatTipleriPage = lazy(() => import('@/pages/parameters/FiyatTipleriPage').then((m) => ({ default: m.FiyatTipleriPage })))
const VergiOranlariPage = lazy(() => import('@/pages/parameters/VergiOranlariPage').then((m) => ({ default: m.VergiOranlariPage })))
const MusteriTipleriPage = lazy(() => import('@/pages/parameters/MusteriTipleriPage').then((m) => ({ default: m.MusteriTipleriPage })))
const MusteriGruplariPage = lazy(() => import('@/pages/parameters/MusteriGruplariPage').then((m) => ({ default: m.MusteriGruplariPage })))
const YasalTiplerPage = lazy(() => import('@/pages/parameters/YasalTiplerPage').then((m) => ({ default: m.YasalTiplerPage })))
const SuppliersPage = lazy(() => import('@/pages/parameters/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))
const TeklifNotlariPage = lazy(() => import('@/pages/parameters/TeklifNotlariPage').then((m) => ({ default: m.TeklifNotlariPage })))
const TeklifAyarlariPage = lazy(() => import('@/pages/parameters/TeklifAyarlariPage').then((m) => ({ default: m.TeklifAyarlariPage })))
const TeklifCiktiAyarlariPage = lazy(() => import('@/pages/parameters/TeklifCiktiAyarlariPage').then((m) => ({ default: m.TeklifCiktiAyarlariPage })))
const TeklifEkleriPage = lazy(() => import('@/pages/parameters/TeklifEkleriPage').then((m) => ({ default: m.TeklifEkleriPage })))
const DahilHaricEtiketleriPage = lazy(() => import('@/pages/parameters/DahilHaricEtiketleriPage').then((m) => ({ default: m.DahilHaricEtiketleriPage })))
const DiaPage = lazy(() => import('@/pages/DiaPage').then((m) => ({ default: m.DiaPage })))
const DiaCariKartlarPage = lazy(() => import('@/pages/parameters/dia/DiaCariKartlarPage').then((m) => ({ default: m.DiaCariKartlarPage })))
const DiaVergiDaireleriPage = lazy(() => import('@/pages/parameters/dia/DiaVergiDaireleriPage').then((m) => ({ default: m.DiaVergiDaireleriPage })))
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const TekliflerPage = lazy(() => import('@/pages/offers/TekliflerPage').then((m) => ({ default: m.TekliflerPage })))
const TeklifFormPage = lazy(() => import('@/pages/offers/TeklifFormPage').then((m) => ({ default: m.TeklifFormPage })))
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage').then((m) => ({ default: m.ProductsPage })))
const EDocumentsPage = lazy(() => import('@/pages/documents/EDocumentsPage').then((m) => ({ default: m.EDocumentsPage })))
const SettingsGeneralPage = lazy(() => import('@/pages/settings/SettingsGeneralPage').then((m) => ({ default: m.SettingsGeneralPage })))
const SettingsDatabasePage = lazy(() => import('@/pages/settings/SettingsDatabasePage').then((m) => ({ default: m.SettingsDatabasePage })))
const SettingsStoragePage = lazy(() => import('@/pages/settings/SettingsStoragePage').then((m) => ({ default: m.SettingsStoragePage })))
const SettingsIntegrationsPage = lazy(() => import('@/pages/settings/SettingsIntegrationsPage').then((m) => ({ default: m.SettingsIntegrationsPage })))
const SettingsIdeasoftPage = lazy(() => import('@/pages/settings/SettingsIdeasoftPage').then((m) => ({ default: m.SettingsIdeasoftPage })))
const SettingsCalculationsPage = lazy(() => import('@/pages/settings/SettingsCalculationsPage').then((m) => ({ default: m.SettingsCalculationsPage })))
const SettingsAccessPage = lazy(() => import('@/pages/settings/SettingsAccessPage').then((m) => ({ default: m.SettingsAccessPage })))
const SettingsSuppliersPage = lazy(() => import('@/pages/settings/SettingsSuppliersPage').then((m) => ({ default: m.SettingsSuppliersPage })))
const SettingsDataTransferPage = lazy(() => import('@/pages/settings/SettingsDataTransferPage').then((m) => ({ default: m.SettingsDataTransferPage })))
const SettingsFileManagerPage = lazy(() => import('@/pages/settings/SettingsFileManagerPage').then((m) => ({ default: m.SettingsFileManagerPage })))
const SettingsExchangeRatesPage = lazy(() => import('@/pages/settings/SettingsExchangeRatesPage').then((m) => ({ default: m.SettingsExchangeRatesPage })))
const SettingsMarketplacePage = lazy(() => import('@/pages/settings/SettingsMarketplacePage').then((m) => ({ default: m.SettingsMarketplacePage })))
const OpenCartPage = lazy(() => import('@/pages/opencart/OpenCartPage').then((m) => ({ default: m.OpenCartPage })))
const SalesDashboardPage = lazy(() => import('@/pages/SalesDashboardPage').then((m) => ({ default: m.SalesDashboardPage })))
const ParasutProductsPage = lazy(() => import('@/pages/parasut/ParasutProductsPage').then((m) => ({ default: m.ParasutProductsPage })))
const ParasutCategoriesPage = lazy(() => import('@/pages/parasut/ParasutCategoriesPage').then((m) => ({ default: m.ParasutCategoriesPage })))
const ParasutBrandsPage = lazy(() => import('@/pages/parasut/ParasutBrandsPage').then((m) => ({ default: m.ParasutBrandsPage })))
const IdeasoftPage = lazy(() => import('@/pages/ideasoft/IdeasoftPage').then((m) => ({ default: m.IdeasoftPage })))
const IdeasoftCategoriesPage = lazy(() =>
  import('@/pages/ideasoft/IdeasoftCategoriesPage').then((m) => ({ default: m.IdeasoftCategoriesPage }))
)
const IdeasoftBrandsPage = lazy(() =>
  import('@/pages/ideasoft/IdeasoftBrandsPage').then((m) => ({ default: m.IdeasoftBrandsPage }))
)
const IdeasoftCurrenciesPage = lazy(() =>
  import('@/pages/ideasoft/IdeasoftCurrenciesPage').then((m) => ({ default: m.IdeasoftCurrenciesPage }))
)
const IdeasoftProductsTransferPage = lazy(() =>
  import('@/pages/ideasoft/IdeasoftProductsTransferPage').then((m) => ({ default: m.IdeasoftProductsTransferPage }))
)
const VeriAktarimPage = lazy(() => import('@/pages/VeriAktarimPage').then((m) => ({ default: m.VeriAktarimPage })))
function App() {
  return (
    <>
      <ThemeLoader />
      {createPortal(
        <Toaster
          richColors
          position="top-center"
          className="!z-[2147483647]"
          style={{ zIndex: 2147483647 }}
          toastOptions={{ style: { zIndex: 2147483647 } }}
        />,
        document.body
      )}
      <AppLayout>
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      <Suspense fallback={<div className="flex flex-1 items-center justify-center text-muted-foreground">Yükleniyor...</div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/parasut" element={<ParasutPage />} />
        <Route path="/parasut/products" element={<ParasutProductsPage />} />
        <Route path="/parasut/categories" element={<ParasutCategoriesPage />} />
        <Route path="/parasut/brands" element={<ParasutBrandsPage />} />
        <Route path="/ideasoft" element={<IdeasoftPage />} />
        <Route path="/ideasoft/categories" element={<IdeasoftCategoriesPage />} />
        <Route path="/ideasoft/brands" element={<IdeasoftBrandsPage />} />
        <Route path="/ideasoft/currencies" element={<IdeasoftCurrenciesPage />} />
        <Route path="/ideasoft/products" element={<IdeasoftProductsTransferPage />} />
        <Route path="/veri-aktarim" element={<VeriAktarimPage />} />
        <Route path="/ayarlar" element={<SettingsPage />} />
        <Route path="/ayarlar/genel" element={<SettingsGeneralPage />} />
        <Route path="/ayarlar/veritabani" element={<SettingsDatabasePage />} />
        <Route path="/ayarlar/depolama" element={<SettingsStoragePage />} />
        <Route path="/ayarlar/entegrasyonlar" element={<SettingsIntegrationsPage />} />
        <Route path="/ayarlar/entegrasyonlar/ideasoft" element={<SettingsIdeasoftPage />} />
        <Route path="/ayarlar/hesaplamalar" element={<SettingsCalculationsPage />} />
        <Route path="/ayarlar/erisim" element={<SettingsAccessPage />} />
        <Route path="/ayarlar/tedarikciler" element={<SettingsSuppliersPage />} />
        <Route path="/ayarlar/veri-aktarimi" element={<SettingsDataTransferPage />} />
        <Route path="/ayarlar/dosya-yoneticisi" element={<SettingsFileManagerPage />} />
        <Route path="/ayarlar/doviz-kurlari" element={<SettingsExchangeRatesPage />} />
        <Route path="/ayarlar/marketplace" element={<SettingsMarketplacePage />} />
        <Route path="/parametreler" element={<ParametersPage />} />
        <Route path="/parametreler/markalar" element={<MarkalarPage />} />
        <Route path="/parametreler/birimler" element={<BirimlerPage />} />
        <Route path="/parametreler/gruplar" element={<GruplarPage />} />
        <Route path="/parametreler/kategoriler" element={<KategorilerPage />} />
        <Route path="/parametreler/urun-tipleri" element={<UrunTipleriPage />} />
        <Route path="/parametreler/urun-gruplari" element={<UrunGruplariPage />} />
        <Route path="/parametreler/para-birimleri" element={<ParaBirimleriPage />} />
        <Route path="/parametreler/fiyat-tipleri" element={<FiyatTipleriPage />} />
        <Route path="/parametreler/vergi-oranlari" element={<VergiOranlariPage />} />
        <Route path="/parametreler/musteri-gruplari" element={<MusteriGruplariPage />} />
        <Route path="/parametreler/musteri-tipleri" element={<MusteriTipleriPage />} />
        <Route path="/parametreler/yasal-tipler" element={<YasalTiplerPage />} />
        <Route path="/parametreler/tedarikciler" element={<SuppliersPage />} />
        <Route path="/parametreler/teklif-notlari" element={<TeklifNotlariPage />} />
        <Route path="/parametreler/teklif-ayarlari" element={<TeklifAyarlariPage />} />
        <Route path="/parametreler/teklif-cikti-ayarlari" element={<TeklifCiktiAyarlariPage />} />
        <Route path="/parametreler/teklif-ekleri" element={<TeklifEkleriPage />} />
        <Route path="/parametreler/teklif-dahil-haric-etiketleri" element={<DahilHaricEtiketleriPage />} />
        <Route path="/dia" element={<DiaPage />} />
        <Route path="/dia/cari-kartlar" element={<DiaCariKartlarPage />} />
        <Route path="/dia/vergi-daireleri" element={<DiaVergiDaireleriPage />} />
        <Route path="/parametreler/dia" element={<Navigate to="/dia" replace />} />
        <Route path="/parametreler/dia/cari-kartlar" element={<Navigate to="/dia/cari-kartlar" replace />} />
        <Route path="/parametreler/dia/vergi-daireleri" element={<Navigate to="/dia/vergi-daireleri" replace />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/musteriler" element={<Navigate to="/customers" replace />} />
        <Route path="/teklifler" element={<TekliflerPage />} />
        <Route path="/teklifler/:id" element={<TeklifFormPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/urunler" element={<Navigate to="/products" replace />} />
        <Route path="/e-documents" element={<EDocumentsPage />} />
        <Route path="/opencart" element={<OpenCartPage />} />
        <Route path="/satis" element={<SalesDashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </div>
    </AppLayout>
    </>
  )
}

export default App
