import { Link } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  Database,
  HardDrive,
  FolderTree,
  Plug,
  Calculator,
  Shield,
  Truck,
  ArrowRightLeft,
  DollarSign,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const settingsSections = [
  { id: 'genel', title: 'Genel Ayarlar', icon: SettingsIcon, path: '/ayarlar/genel' },
  { id: 'veritabani', title: 'Veritabanı Ayarları', icon: Database, path: '/ayarlar/veritabani' },
  { id: 'depolama', title: 'Depolama Ayarları', icon: HardDrive, path: '/ayarlar/depolama' },
  { id: 'dosya-yoneticisi', title: 'Dosya Yöneticisi', icon: FolderTree, path: '/ayarlar/dosya-yoneticisi' },
  { id: 'entegrasyonlar', title: 'Entegrasyonlar', icon: Plug, path: '/ayarlar/entegrasyonlar' },
  { id: 'hesaplamalar', title: 'Hesaplamalar', icon: Calculator, path: '/ayarlar/hesaplamalar' },
  { id: 'erisim', title: 'Erişim', icon: Shield, path: '/ayarlar/erisim' },
  { id: 'tedarikciler', title: 'Tedarikçiler', icon: Truck, path: '/ayarlar/tedarikciler' },
  { id: 'veri-aktarimi', title: 'Veri Aktarımı', icon: ArrowRightLeft, path: '/ayarlar/veri-aktarimi' },
  { id: 'doviz-kurlari', title: 'Döviz Kurları', icon: DollarSign, path: '/ayarlar/doviz-kurlari' },
]

export function SettingsPage() {
  return (
    <PageLayout title="Ayarlar" description="Uygulama ayarlarını yönetin">
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-6 w-6 text-primary" />
              <CardTitle>Uygulama Ayarları</CardTitle>
            </div>
            <CardDescription>
              Genel yapılandırma ve ayarlar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-4">
              {settingsSections.map((section) => (
                <Link key={section.id} to={section.path} className="col-span-4">
                  <div className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <section.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{section.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {section.title} yapılandırması
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
