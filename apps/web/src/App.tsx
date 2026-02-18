import { Toaster } from 'sonner'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { HomePage } from '@/pages/HomePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ParametersPage } from '@/pages/ParametersPage'
import { MarkalarPage } from '@/pages/parameters/MarkalarPage'
import { BirimlerPage } from '@/pages/parameters/BirimlerPage'
import { GruplarPage } from '@/pages/parameters/GruplarPage'
import { KategorilerPage } from '@/pages/parameters/KategorilerPage'
import { SettingsGeneralPage } from '@/pages/settings/SettingsGeneralPage'
import { SettingsDatabasePage } from '@/pages/settings/SettingsDatabasePage'
import { SettingsStoragePage } from '@/pages/settings/SettingsStoragePage'
import { SettingsIntegrationsPage } from '@/pages/settings/SettingsIntegrationsPage'
import { SettingsCalculationsPage } from '@/pages/settings/SettingsCalculationsPage'
import { SettingsAccessPage } from '@/pages/settings/SettingsAccessPage'
import { SettingsSuppliersPage } from '@/pages/settings/SettingsSuppliersPage'
import { SettingsDataTransferPage } from '@/pages/settings/SettingsDataTransferPage'

function App() {
  return (
    <>
      <Toaster richColors position="top-right" />
      <AppLayout>
      <Routes>
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
        <Route path="/parametreler" element={<ParametersPage />} />
        <Route path="/parametreler/markalar" element={<MarkalarPage />} />
        <Route path="/parametreler/birimler" element={<BirimlerPage />} />
        <Route path="/parametreler/gruplar" element={<GruplarPage />} />
        <Route path="/parametreler/kategoriler" element={<KategorilerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
    </>
  )
}

export default App
