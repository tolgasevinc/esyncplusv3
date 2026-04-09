import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Package,
  ShoppingCart,
  FileText,
  Tag,
  FolderTree,
  DollarSign,
  Ruler,
  ImageIcon,
  Tags,
  TableProperties,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const primarySections: { id: string; title: string; icon: LucideIcon; to?: string }[] = [
  { id: 'urunler', title: 'Ürünler', icon: Package, to: '/ideasoft/urunler' },
  { id: 'siparisler', title: 'Siparişler', icon: ShoppingCart },
  { id: 'icerikler', title: 'İçerikler', icon: FileText },
]

const storeParamSections: { id: string; title: string; icon: LucideIcon; to?: string; apiHint?: string }[] = [
  { id: 'markalar', title: 'Markalar', icon: Tag, to: '/ideasoft/markalar' },
  { id: 'kategoriler', title: 'Kategoriler', icon: FolderTree, to: '/ideasoft/kategoriler' },
  { id: 'para-birimleri', title: 'Para birimleri', icon: DollarSign, to: '/ideasoft/para-birimleri' },
]

const productParamSections: { id: string; title: string; icon: LucideIcon; to?: string; apiHint?: string }[] = [
  { id: 'birimler', title: 'Birimler', icon: Ruler, to: '/ideasoft/birimler', apiHint: 'Ürün stok birimi (Product PDF)' },
  {
    id: 'urun-resimleri',
    title: 'Ürün resimleri',
    icon: ImageIcon,
    to: '/ideasoft/urun-resimleri',
    apiHint: 'ProductImage Admin API',
  },
  {
    id: 'urun-etiketleri',
    title: 'Ürün etiketleri',
    icon: Tags,
    to: '/ideasoft/urun-etiketleri',
    apiHint: 'ProductLabel (label_to_products)',
  },
  {
    id: 'ekstra-ozellikler',
    title: 'Ekstra özellikler',
    icon: TableProperties,
    to: '/ideasoft/ekstra-ozellikler',
    apiHint: 'ProductExtraField (product_extra_fields)',
  },
]

function SectionGrid({
  sections,
}: {
  sections: { id: string; title: string; icon: LucideIcon; to?: string; apiHint?: string }[]
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {sections.map((section) => {
        const inner = (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <section.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{section.title}</p>
              <p className="text-sm">
                {section.to ? (section.apiHint ?? 'Admin API / mağaza') : 'Yakında'}
              </p>
            </div>
          </>
        )
        return (
          <div key={section.id} className="col-span-12 sm:col-span-6 lg:col-span-4">
            {section.to ? (
              <Link
                to={section.to}
                className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/20 text-muted-foreground cursor-default">
                {inner}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function IdeasoftPage() {
  return (
    <PageLayout title="IdeaSoft" description="Mağaza entegrasyonu menüleri" backTo="/">
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <CardTitle>Ana menüler</CardTitle>
            </div>
            <CardDescription>Ürünler, siparişler ve içerik yönetimi</CardDescription>
          </CardHeader>
          <CardContent>
            <SectionGrid sections={primarySections} />
          </CardContent>
        </Card>

        <div className="border-t border-border my-6" />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderTree className="h-6 w-6 text-primary" />
              <CardTitle>Mağaza parametreleri</CardTitle>
            </div>
            <CardDescription>Markalar, kategoriler ve para birimleri</CardDescription>
          </CardHeader>
          <CardContent>
            <SectionGrid sections={storeParamSections} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Ruler className="h-6 w-6 text-primary" />
              <CardTitle>Ürün parametreleri</CardTitle>
            </div>
            <CardDescription>Stok birimi, görseller, etiket ve ekstra alanlar (Admin API)</CardDescription>
          </CardHeader>
          <CardContent>
            <SectionGrid sections={productParamSections} />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
