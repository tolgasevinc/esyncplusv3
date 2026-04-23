import { Link } from 'react-router-dom'
import { Package, Users, Truck, Tag, FolderTree } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const topSections = [
  { id: 'urunler', title: 'Ürünler', icon: Package, path: '/parasut/products' },
  { id: 'musteriler', title: 'Müşteriler', icon: Users, path: '/parasut/customers' },
  { id: 'tedarikciler', title: 'Tedarikçiler', icon: Truck, path: '/parametreler/tedarikciler' },
]

const bottomSections = [
  { id: 'parasut-kategoriler', title: 'Paraşüt Kategoriler', icon: FolderTree, path: '/parasut/categories' },
  { id: 'parasut-markalar', title: 'Paraşüt Marka Eşleştirme', icon: Tag, path: '/parasut/brands' },
]

export function ParasutPage() {
  return (
    <PageLayout title="Paraşüt" description="Paraşüt entegrasyonu menüleri" backTo="/">
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <CardTitle>Ana Menüler</CardTitle>
            </div>
            <CardDescription>
              Ürünler, müşteriler ve tedarikçiler
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-4">
              {topSections.map((section) => (
                <Link key={section.id} to={section.path} className="col-span-4">
                  <div className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <section.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{section.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {section.title} yönetimi
                      </p>
                    </div>
                  </div>
                </Link>
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
            <CardDescription>
              Markalar ve kategoriler
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-4">
              {bottomSections.map((section) => (
                <Link key={section.id} to={section.path} className="col-span-4">
                  <div className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <section.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{section.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {section.title} yönetimi
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
