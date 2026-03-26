import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Package,
  Tag,
  FolderTree,
  Layers,
  Type,
  Receipt,
  CircleDollarSign,
  Percent,
  Users,
  UserCircle,
  UsersRound,
  Scale,
  Truck,
  FileText,
  Settings,
  Paperclip,
  Tags,
  FileOutput,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'
import { cn } from '@/lib/utils'

type ParamLinkItem = {
  id: string
  title: string
  hint?: string
  icon: LucideIcon
  path: string
}

type ParamSection = {
  id: string
  title: string
  description: string
  icon: LucideIcon
  items: ParamLinkItem[]
}

const paramSections: ParamSection[] = [
  {
    id: 'genel',
    title: 'Genel',
    description: 'Para birimi ve vergi parametreleri',
    icon: SlidersHorizontal,
    items: [
      { id: 'para-birimleri', title: 'Para Birimleri', icon: CircleDollarSign, path: '/parametreler/para-birimleri' },
      { id: 'vergi-oranlari', title: 'Vergi Oranları', icon: Percent, path: '/parametreler/vergi-oranlari' },
    ],
  },
  {
    id: 'urun',
    title: 'Ürün',
    description: 'Ürün kartı ve fiyatlandırma ile ilgili parametreler',
    icon: Package,
    items: [
      { id: 'markalar', title: 'Markalar', icon: Tag, path: '/parametreler/markalar' },
      { id: 'gruplar', title: 'Gruplar', icon: FolderTree, path: '/parametreler/gruplar' },
      { id: 'kategoriler', title: 'Kategoriler', icon: Layers, path: '/parametreler/kategoriler' },
      { id: 'urun-tipleri', title: 'Tipler', icon: Type, path: '/parametreler/urun-tipleri' },
      {
        id: 'fiyatlar',
        title: 'Fiyatlar',
        hint: 'Fiyat tipleri ve hesaplamalar bu bölümde yönetilecek',
        icon: Receipt,
        path: '/parametreler/fiyat-tipleri',
      },
    ],
  },
  {
    id: 'musteriler',
    title: 'Müşteriler',
    description: 'Müşteri sınıflandırma ve fatura modelleri',
    icon: Users,
    items: [
      { id: 'musteri-gruplari', title: 'Gruplar', icon: UsersRound, path: '/parametreler/musteri-gruplari' },
      { id: 'musteri-tipleri', title: 'Tipler', icon: UserCircle, path: '/parametreler/musteri-tipleri' },
      {
        id: 'fatura-modelleri',
        title: 'Fatura Modelleri',
        icon: Scale,
        path: '/parametreler/yasal-tipler',
      },
    ],
  },
  {
    id: 'tedarikciler',
    title: 'Tedarikçiler',
    description: 'Tedarikçi kayıtları ve eşleştirmeler',
    icon: Truck,
    items: [{ id: 'tedarikciler', title: 'Tedarikçiler', icon: Truck, path: '/parametreler/tedarikciler' }],
  },
]

const teklifTables: ParamLinkItem[] = [
  { id: 'teklif-notlari', title: 'Teklif Notları', icon: FileText, path: '/parametreler/teklif-notlari' },
  { id: 'teklif-ayarlari', title: 'Teklif Ayarları', icon: Settings, path: '/parametreler/teklif-ayarlari' },
  { id: 'teklif-cikti-ayarlari', title: 'Teklif Çıktı Ayarları', icon: FileOutput, path: '/parametreler/teklif-cikti-ayarlari' },
  { id: 'teklif-ekleri', title: 'Teklif Ekleri', icon: Paperclip, path: '/parametreler/teklif-ekleri' },
  { id: 'teklif-dahil-haric-etiketleri', title: 'Dahil/Hariç Etiketleri', icon: Tags, path: '/parametreler/teklif-dahil-haric-etiketleri' },
]

function ParamLinkList({ items }: { items: ParamLinkItem[] }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      {items.map((table, index) => (
        <Link
          key={table.id}
          to={table.path}
          className={cn(
            'flex min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50',
            index > 0 && 'border-t border-border'
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <table.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{table.title}</p>
            <p className="text-sm text-muted-foreground leading-snug">{table.hint ?? `${table.title} listesini yönet`}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-50" aria-hidden />
        </Link>
      ))}
    </div>
  )
}

export function ParametersPage() {
  return (
    <PageLayout title="Parametreler" description="Genel, ürün, müşteri ve teklif parametrelerini yönetin">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-stretch">
        {paramSections.map((section) => {
          const SectionIcon = section.icon
          return (
            <Card key={section.id} className="flex h-full min-h-0 flex-col">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <SectionIcon className="h-6 w-6 text-primary" />
                  <CardTitle>{section.title}</CardTitle>
                </div>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ParamLinkList items={section.items} />
              </CardContent>
            </Card>
          )
        })}

        <Card className="flex h-full min-h-0 flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              <CardTitle>Teklif</CardTitle>
            </div>
            <CardDescription>Teklif notları, çıktı ve ek ayarları</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ParamLinkList items={teklifTables} />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
