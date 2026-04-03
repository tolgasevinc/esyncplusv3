import { Link } from 'react-router-dom'
import {
  Package,
  ShoppingBag,
  FileText,
  Tag,
  FolderTree,
  Coins,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'
import { cn } from '@/lib/utils'

type MenuTile = {
  id: string
  title: string
  description: string
  icon: typeof Package
  /** Tanımlandıysa kart tıklanır ve alt sayfaya gider */
  to?: string
}

const blokIslemler: MenuTile[] = [
  {
    id: 'urunler',
    title: 'Ürünler',
    description: 'Mağaza ürün listesi ve senkronizasyon',
    icon: Package,
  },
  {
    id: 'siparisler',
    title: 'Siparişler',
    description: 'Sipariş takibi ve durumlar',
    icon: ShoppingBag,
  },
  {
    id: 'icerikler',
    title: 'İçerikler',
    description: 'Sayfa, blog ve vitrin içerikleri',
    icon: FileText,
  },
]

const blokParametreler: MenuTile[] = [
  {
    id: 'markalar',
    title: 'Markalar',
    description: 'Store API marka listesi ve yönetimi',
    icon: Tag,
    to: '/ideasoft/markalar',
  },
  {
    id: 'kategoriler',
    title: 'Kategoriler',
    description: 'Kategori ağacı ve eşleştirme',
    icon: FolderTree,
  },
  {
    id: 'para-birimleri',
    title: 'Para birimleri',
    description: 'Döviz ve mağaza para birimleri',
    icon: Coins,
    to: '/ideasoft/para-birimleri',
  },
]

function MenuCard({ tile, className }: { tile: MenuTile; className?: string }) {
  const Icon = tile.icon
  const inner = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium leading-tight">{tile.title}</p>
          {!tile.to && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Yakında
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{tile.description}</p>
      </div>
    </>
  )
  if (tile.to) {
    return (
      <Link
        to={tile.to}
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 hover:border-primary/20',
          className
        )}
      >
        {inner}
      </Link>
    )
  }
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 p-4',
        className
      )}
    >
      {inner}
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
              <CardTitle>İşlemler</CardTitle>
            </div>
            <CardDescription>Ürünler, siparişler ve içerik yönetimi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {blokIslemler.map((tile) => (
                <MenuCard key={tile.id} tile={tile} />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="border-t border-border" aria-hidden />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="h-6 w-6 text-primary" />
              <CardTitle>Tanımlar</CardTitle>
            </div>
            <CardDescription>Markalar, kategoriler ve para birimleri</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {blokParametreler.map((tile) => (
                <MenuCard key={tile.id} tile={tile} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
