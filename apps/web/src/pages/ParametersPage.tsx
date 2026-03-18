import { Link } from 'react-router-dom'
import { Package, PackageSearch, Users, Tag, Ruler, FolderTree, Layers, Type, CircleDollarSign, Percent, UserCircle, Truck, Receipt, UsersRound, Scale, Boxes, FileText, Settings, Paperclip, Tags, FileOutput } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const productTables = [
  { id: 'urunler', title: 'Ürünler', icon: PackageSearch, path: '/products' },
  { id: 'markalar', title: 'Markalar', icon: Tag, path: '/parametreler/markalar' },
  { id: 'birimler', title: 'Birimler', icon: Ruler, path: '/parametreler/birimler' },
  { id: 'urun-gruplari', title: 'Ürün Grupları', icon: Boxes, path: '/parametreler/urun-gruplari' },
  { id: 'gruplar', title: 'Gruplar', icon: FolderTree, path: '/parametreler/gruplar' },
  { id: 'kategoriler', title: 'Kategoriler', icon: Layers, path: '/parametreler/kategoriler' },
  { id: 'urun-tipleri', title: 'Ürün Tipleri', icon: Type, path: '/parametreler/urun-tipleri' },
  { id: 'para-birimleri', title: 'Para Birimleri', icon: CircleDollarSign, path: '/parametreler/para-birimleri' },
  { id: 'fiyat-tipleri', title: 'Fiyat Tipleri', icon: Receipt, path: '/parametreler/fiyat-tipleri' },
  { id: 'vergi-oranlari', title: 'Vergi Oranları', icon: Percent, path: '/parametreler/vergi-oranlari' },
  { id: 'tedarikciler', title: 'Tedarikçiler', icon: Truck, path: '/parametreler/tedarikciler' },
]

const customerTables = [
  { id: 'musteri-gruplari', title: 'Müşteri Grupları', icon: UsersRound, path: '/parametreler/musteri-gruplari' },
  { id: 'musteri-tipleri', title: 'Müşteri Tipleri', icon: UserCircle, path: '/parametreler/musteri-tipleri' },
  { id: 'yasal-tipler', title: 'Yasal Tipler', icon: Scale, path: '/parametreler/yasal-tipler' },
]

const teklifTables = [
  { id: 'teklif-notlari', title: 'Teklif Notları', icon: FileText, path: '/parametreler/teklif-notlari' },
  { id: 'teklif-ayarlari', title: 'Teklif Ayarları', icon: Settings, path: '/parametreler/teklif-ayarlari' },
  { id: 'teklif-cikti-ayarlari', title: 'Teklif Çıktı Ayarları', icon: FileOutput, path: '/parametreler/teklif-cikti-ayarlari' },
  { id: 'teklif-ekleri', title: 'Teklif Ekleri', icon: Paperclip, path: '/parametreler/teklif-ekleri' },
  { id: 'teklif-dahil-haric-etiketleri', title: 'Dahil/Hariç Etiketleri', icon: Tags, path: '/parametreler/teklif-dahil-haric-etiketleri' },
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
            <div className="grid grid-cols-12 gap-4">
              {productTables.map((table) => (
                <Link key={table.id} to={table.path} className="col-span-4">
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

        {/* Teklif Tabloları */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              <CardTitle>Teklif Tabloları</CardTitle>
            </div>
            <CardDescription>
              Teklif notları, ön sayfa ve ek sayfalar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-4">
              {teklifTables.map((table) => (
                <Link key={table.id} to={table.path} className="col-span-4">
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
            <div className="grid grid-cols-12 gap-4">
              {customerTables.map((table) => (
                <Link key={table.id} to={table.path} className="col-span-4">
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
