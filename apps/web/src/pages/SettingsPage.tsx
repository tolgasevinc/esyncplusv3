import { Link } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  Database,
  HardDrive,
  Plug,
  Calculator,
  Shield,
  Truck,
  ArrowRightLeft,
} from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const settingsSections = [
  { id: 'genel', title: 'Genel Ayarlar', icon: SettingsIcon, path: '/ayarlar/genel' },
  { id: 'veritabani', title: 'Veritabanı Ayarları', icon: Database, path: '/ayarlar/veritabani' },
  { id: 'depolama', title: 'Depolama Ayarları', icon: HardDrive, path: '/ayarlar/depolama' },
  { id: 'entegrasyonlar', title: 'Entegrasyonlar', icon: Plug, path: '/ayarlar/entegrasyonlar' },
  { id: 'hesaplamalar', title: 'Hesaplamalar', icon: Calculator, path: '/ayarlar/hesaplamalar' },
  { id: 'erisim', title: 'Erişim', icon: Shield, path: '/ayarlar/erisim' },
  { id: 'tedarikciler', title: 'Tedarikçiler', icon: Truck, path: '/ayarlar/tedarikciler' },
  { id: 'veri-aktarimi', title: 'Veri Aktarımı', icon: ArrowRightLeft, path: '/ayarlar/veri-aktarimi' },
]

export function SettingsPage() {
  return (
    <PageLayout title="Ayarlar" description="Uygulama ayarlarını yönetin">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {settingsSections.map((section) => (
          <Link key={section.id} to={section.path}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/50 h-full">
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <section.icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                  <CardDescription>
                    {section.title} yapılandırması
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </PageLayout>
  )
}
