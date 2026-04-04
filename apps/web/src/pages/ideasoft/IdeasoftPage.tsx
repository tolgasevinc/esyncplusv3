import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Package, ShoppingCart, FileText, Tag, FolderTree, DollarSign } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const primarySections = [
  { id: 'urunler', title: 'Ürünler', icon: Package },
  { id: 'siparisler', title: 'Siparişler', icon: ShoppingCart },
  { id: 'icerikler', title: 'İçerikler', icon: FileText },
]

const secondarySections: { id: string; title: string; icon: LucideIcon; to?: string }[] = [
  { id: 'markalar', title: 'Markalar', icon: Tag, to: '/ideasoft/markalar' },
  { id: 'kategoriler', title: 'Kategoriler', icon: FolderTree },
  { id: 'para-birimleri', title: 'Para birimleri', icon: DollarSign, to: '/ideasoft/para-birimleri' },
]

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
            <div className="grid grid-cols-12 gap-4">
              {primarySections.map((section) => (
                <div key={section.id} className="col-span-12 sm:col-span-6 lg:col-span-4">
                  <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/20 text-muted-foreground cursor-default">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <section.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{section.title}</p>
                      <p className="text-sm">Yakında</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="border-t border-border my-6" />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="h-6 w-6 text-primary" />
              <CardTitle>Parametreler</CardTitle>
            </div>
            <CardDescription>Markalar, kategoriler ve para birimleri</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-4">
              {secondarySections.map((section) => {
                const inner = (
                  <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <section.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{section.title}</p>
                      <p className="text-sm">{section.to ? 'Mağaza API' : 'Yakında'}</p>
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
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
