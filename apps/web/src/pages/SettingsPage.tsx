import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Settings as SettingsIcon,
  PanelLeft,
  HardDrive,
  FolderTree,
  Plug,
  Shield,
  ArrowRightLeft,
  FileText,
  Database,
  Calculator,
  DollarSign,
  Store,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type SettingsNavItem = {
  label: string
  to?: string
  soon?: boolean
}

type SettingsNavGroup = {
  id: string
  title: string
  description?: string
  icon: LucideIcon
  items: SettingsNavItem[]
}

const SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    id: 'genel-ayarlar',
    title: 'Genel Ayarlar',
    description: 'Uygulama geneli ve görünüm',
    icon: SettingsIcon,
    items: [
      { label: 'Genel', to: '/ayarlar/genel?tab=genel' },
      { label: 'Tema Ayarları', to: '/ayarlar/genel?tab=tema' },
    ],
  },
  {
    id: 'sidebar',
    title: 'Sidebar',
    description: 'Menü, logo ve başlık',
    icon: PanelLeft,
    items: [{ label: 'Sidebar ayarları', to: '/ayarlar/genel?tab=sidebar' }],
  },
  {
    id: 'depolama',
    title: 'Depolama',
    description: 'Dosya ve bulut bağlantıları',
    icon: HardDrive,
    items: [
      { label: 'Klasör tanımları (R2 eşleştirmeleri)', to: '/ayarlar/depolama' },
      { label: 'Google Drive', soon: true },
      { label: 'OneDrive', soon: true },
    ],
  },
  {
    id: 'dosya-yoneticisi',
    title: 'Dosya Yöneticisi',
    description: 'Depolanan dosyalar',
    icon: FolderTree,
    items: [{ label: 'Dosya yöneticisi', to: '/ayarlar/dosya-yoneticisi' }],
  },
  {
    id: 'entegrasyonlar',
    title: 'Entegrasyonlar',
    description: 'Harici sistem ve pazaryerleri',
    icon: Plug,
    items: [
      { label: 'Paraşüt', to: '/ayarlar/entegrasyonlar?tab=parasut' },
      { label: 'IdeaSoft', to: '/ayarlar/entegrasyonlar?tab=ideasoft' },
      { label: 'OpenAI', to: '/ayarlar/entegrasyonlar?tab=openai' },
      { label: 'OKM (eski site MySQL)', to: '/ayarlar/entegrasyonlar?tab=okm' },
      { label: 'Opencart', to: '/opencart' },
      { label: 'Shopify', soon: true },
      { label: 'Trendyol (API)', to: '/ayarlar/marketplace?m=trendyol' },
      { label: 'Hepsiburada', soon: true },
      { label: 'Pazarama', soon: true },
      { label: 'EPttAVM', soon: true },
      { label: 'N11', soon: true },
      { label: 'Çiçeksepeti', soon: true },
      { label: 'Idefix', soon: true },
      { label: 'Uretico', soon: true },
    ],
  },
  {
    id: 'erisim',
    title: 'Erişim',
    description: 'Kullanıcılar ve yetkiler',
    icon: Shield,
    items: [
      { label: 'Kullanıcı Yönetimi', to: '/ayarlar/erisim?tab=users' },
      { label: 'Yetkiler', to: '/ayarlar/erisim?tab=roles' },
    ],
  },
  {
    id: 'veri-aktarimi',
    title: 'Veri Aktarımı',
    description: 'Dışa / içe aktarım ve veritabanı taşıma',
    icon: ArrowRightLeft,
    items: [
      { label: 'Dışa Aktarım', to: '/veri-aktarim?tab=export' },
      { label: 'İçe Aktarım', to: '/veri-aktarim?tab=import' },
      { label: 'MySQL → D1 aktarımı', to: '/ayarlar/veri-aktarimi' },
    ],
  },
  {
    id: 'teklif-ayarlari',
    title: 'Teklif Ayarları',
    description: 'Teklif şablonu ve çıktı',
    icon: FileText,
    items: [
      { label: 'Genel', to: '/parametreler/teklif-ayarlari' },
      { label: 'Notlar', to: '/parametreler/teklif-notlari' },
      { label: 'Ek Sayfalar', to: '/parametreler/teklif-ekleri' },
    ],
  },
  {
    id: 'sistem',
    title: 'Sistem ve diğer',
    description: 'Veritabanı, hesap ve pazar yeri',
    icon: Database,
    items: [
      { label: 'Veritabanı', to: '/ayarlar/veritabani' },
      { label: 'Hesaplamalar', to: '/ayarlar/hesaplamalar' },
      { label: 'Döviz Kurları', to: '/ayarlar/doviz-kurlari' },
      { label: 'Marketplace', to: '/ayarlar/marketplace' },
      { label: 'Tedarikçi ayarları', to: '/ayarlar/tedarikciler' },
    ],
  },
]

function NavRow({ item }: { item: SettingsNavItem }) {
  if (item.soon || !item.to) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm',
          'text-muted-foreground bg-muted/30'
        )}
      >
        <span>{item.label}</span>
        <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
          Yakında
        </Badge>
      </div>
    )
  }
  return (
    <Link
      to={item.to}
      className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground group"
    >
      <span>{item.label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-40 group-hover:opacity-70" />
    </Link>
  )
}

export function SettingsPage() {
  return (
    <PageLayout title="Ayarlar" description="Uygulama yapılandırması — kategorilere göz atın">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SETTINGS_GROUPS.map((group) => {
          const Icon = group.icon
          return (
            <Card key={group.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base leading-tight">{group.title}</CardTitle>
                    {group.description ? (
                      <CardDescription className="text-xs leading-snug">{group.description}</CardDescription>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex-1">
                <ul className="space-y-0.5 border-t border-border pt-3">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      <NavRow item={item} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-6 flex flex-wrap items-center gap-2">
        <Calculator className="h-3.5 w-3.5 inline" />
        İlgili sayfalar:
        <Link to="/parametreler/teklif-cikti-ayarlari" className="underline underline-offset-2 hover:text-foreground">
          Teklif PDF çıktı düzeni
        </Link>
        <span className="text-border">·</span>
        <Link to="/parametreler/teklif-dahil-haric-etiketleri" className="underline underline-offset-2 hover:text-foreground">
          Dahil / hariç etiketleri
        </Link>
        <span className="text-border">·</span>
        <Link to="/ayarlar/entegrasyonlar?tab=openai" className="underline underline-offset-2 hover:text-foreground">
          OpenAI
        </Link>
        <span className="text-border">·</span>
        <Link to="/ayarlar/entegrasyonlar?tab=okm" className="underline underline-offset-2 hover:text-foreground">
          OKM MySQL
        </Link>
        <span className="text-border">·</span>
        <Link to="/parasut" className="underline underline-offset-2 hover:text-foreground inline-flex items-center gap-1">
          Paraşüt modülü <Store className="h-3 w-3" />
        </Link>
        <span className="text-border">·</span>
        <Link to="/ayarlar/doviz-kurlari" className="underline underline-offset-2 hover:text-foreground inline-flex items-center gap-1">
          Döviz <DollarSign className="h-3 w-3" />
        </Link>
      </p>
    </PageLayout>
  )
}
