import { Toaster } from 'sonner'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ThemeLoader } from '@/components/ThemeLoader'
import { HomePage } from '@/pages/HomePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ParametersPage } from '@/pages/ParametersPage'
import { MarkalarPage } from '@/pages/parameters/MarkalarPage'
import { BirimlerPage } from '@/pages/parameters/BirimlerPage'
import { GruplarPage } from '@/pages/parameters/GruplarPage'
import { KategorilerPage } from '@/pages/parameters/KategorilerPage'
import { UrunTipleriPage } from '@/pages/parameters/UrunTipleriPage'
import { ParaBirimleriPage } from '@/pages/parameters/ParaBirimleriPage'
import { FiyatTipleriPage } from '@/pages/parameters/FiyatTipleriPage'
import { VergiOranlariPage } from '@/pages/parameters/VergiOranlariPage'
import { MusteriTipleriPage } from '@/pages/parameters/MusteriTipleriPage'
import { MusteriGruplariPage } from '@/pages/parameters/MusteriGruplariPage'
import { YasalTiplerPage } from '@/pages/parameters/YasalTiplerPage'
import { SuppliersPage } from '@/pages/parameters/SuppliersPage'
import { DiaPage } from '@/pages/DiaPage'
import { DiaCariKartlarPage } from '@/pages/parameters/dia/DiaCariKartlarPage'
import { DiaVergiDaireleriPage } from '@/pages/parameters/dia/DiaVergiDaireleriPage'
import { CustomersPage } from '@/pages/customers/CustomersPage'
import { TekliflerPage } from '@/pages/offers/TekliflerPage'
import { ProductsPage } from '@/pages/products/ProductsPage'
import { EDocumentsPage } from '@/pages/documents/EDocumentsPage'
import { SettingsGeneralPage } from '@/pages/settings/SettingsGeneralPage'
import { SettingsDatabasePage } from '@/pages/settings/SettingsDatabasePage'
import { SettingsStoragePage } from '@/pages/settings/SettingsStoragePage'
import { SettingsIntegrationsPage } from '@/pages/settings/SettingsIntegrationsPage'
import { SettingsCalculationsPage } from '@/pages/settings/SettingsCalculationsPage'
import { SettingsAccessPage } from '@/pages/settings/SettingsAccessPage'
import { SettingsSuppliersPage } from '@/pages/settings/SettingsSuppliersPage'
import { SettingsDataTransferPage } from '@/pages/settings/SettingsDataTransferPage'
import { SettingsFileManagerPage } from '@/pages/settings/SettingsFileManagerPage'
import { OpenCartPage } from '@/pages/opencart/OpenCartPage'

function App() {
  const location = useLocation()
  return (
    <>
      <ThemeLoader />
      <Toaster richColors position="top-center" />
      <AppLayout>
      <Routes key={location.pathname}>
        <Route path="/" element={<HomePage />} />
        <Route path="/ayarlar" element={<SettingsPage />} />
        <Route path="/ayarlar/genel" element={<SettingsGeneralPage />} />
        <Route path="/ayarlar/veritabani" element={<SettingsDatabasePage />} />
        <Route path="/ayarlar/depolama" element={<SettingsStoragePage />} />
        <Route path="/ayarlar/entegrasyonlar" element={<SettingsIntegrationsPage />} />
        <Route path="/ayarlar/hesaplamalar" element={<SettingsCalculationsPage />} />
        <Route path="/ayarlar/erisim" element={<SettingsAccessPage />} />
        <Route path="/ayarlar/tedarikciler" element={<SettingsSuppliersPage />} />
        <Route path="/ayarlar/veri-aktarimi" element={<SettingsDataTransferPage />} />
        <Route path="/ayarlar/dosya-yoneticisi" element={<SettingsFileManagerPage />} />
        <Route path="/parametreler" element={<ParametersPage />} />
        <Route path="/parametreler/markalar" element={<MarkalarPage />} />
        <Route path="/parametreler/birimler" element={<BirimlerPage />} />
        <Route path="/parametreler/gruplar" element={<GruplarPage />} />
        <Route path="/parametreler/kategoriler" element={<KategorilerPage />} />
        <Route path="/parametreler/urun-tipleri" element={<UrunTipleriPage />} />
        <Route path="/parametreler/para-birimleri" element={<ParaBirimleriPage />} />
        <Route path="/parametreler/fiyat-tipleri" element={<FiyatTipleriPage />} />
        <Route path="/parametreler/vergi-oranlari" element={<VergiOranlariPage />} />
        <Route path="/parametreler/musteri-gruplari" element={<MusteriGruplariPage />} />
        <Route path="/parametreler/musteri-tipleri" element={<MusteriTipleriPage />} />
        <Route path="/parametreler/yasal-tipler" element={<YasalTiplerPage />} />
        <Route path="/parametreler/tedarikciler" element={<SuppliersPage />} />
        <Route path="/dia" element={<DiaPage />} />
        <Route path="/dia/cari-kartlar" element={<DiaCariKartlarPage />} />
        <Route path="/dia/vergi-daireleri" element={<DiaVergiDaireleriPage />} />
        <Route path="/parametreler/dia" element={<Navigate to="/dia" replace />} />
        <Route path="/parametreler/dia/cari-kartlar" element={<Navigate to="/dia/cari-kartlar" replace />} />
        <Route path="/parametreler/dia/vergi-daireleri" element={<Navigate to="/dia/vergi-daireleri" replace />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/musteriler" element={<Navigate to="/customers" replace />} />
        <Route path="/teklifler" element={<TekliflerPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/urunler" element={<Navigate to="/products" replace />} />
        <Route path="/e-documents" element={<EDocumentsPage />} />
        <Route path="/opencart" element={<OpenCartPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
    </>
  )
}

export default App
