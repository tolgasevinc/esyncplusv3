import { Link } from 'react-router-dom'
import { Package, Users, Tag, Ruler, FolderTree, Layers, UserCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const productTables = [
  { id: 'markalar', title: 'Markalar', icon: Tag, path: '/parametreler/markalar' },
  { id: 'birimler', title: 'Birimler', icon: Ruler, path: '/parametreler/birimler' },
  { id: 'gruplar', title: 'Gruplar', icon: FolderTree, path: '/parametreler/gruplar' },
  { id: 'kategoriler', title: 'Kategoriler', icon: Layers, path: '/parametreler/kategoriler' },
]

const customerTables = [
  { id: 'musteri-tipleri', title: 'Müşteri Tipleri', icon: UserCircle, path: '/parametreler' },
]

export function ParametersPage() {
  return (
    <PageLayout
      title="Parametreler"
      description="Ürün ve müşteri tablolarını yönetin"
    >
      <div className="space-y-8">
        {/* Ürün Tabloları */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <CardTitle>Ürün Tabloları</CardTitle>
            </div>
            <CardDescription>
              Ürün ile ilgili parametre tabloları
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {productTables.map((table) => (
                <Link key={table.id} to={table.path}>
                  <div
                    className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer"
                  >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <table.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{table.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {table.title} listesini yönet
                    </p>
                  </div>
                </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Müşteri Tabloları */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              <CardTitle>Müşteri Tabloları</CardTitle>
            </div>
            <CardDescription>
              Müşteri ile ilgili parametre tabloları
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {customerTables.map((table) => (
                <Link key={table.id} to={table.path}>
                  <div
                    className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <table.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{table.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {table.title} listesini yönet
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
