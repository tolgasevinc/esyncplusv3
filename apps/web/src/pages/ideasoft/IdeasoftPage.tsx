import { Link } from 'react-router-dom'
import { FolderTree, Settings, Store, Tag, Upload } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const sections = [
  {
    id: 'ideasoft-kategoriler',
    title: 'Kategori eşleştirme',
    description: 'Master kategorileri Ideasoft mağaza kategorileriyle eşleştirin',
    icon: FolderTree,
    path: '/ideasoft/categories',
  },
  {
    id: 'ideasoft-markalar',
    title: 'Marka eşleştirme',
    description: 'Master markaları Ideasoft mağaza markalarıyla eşleştirin',
    icon: Tag,
    path: '/ideasoft/brands',
  },
  {
    id: 'ideasoft-urun-aktarim',
    title: 'Ürün aktarımı',
    description: 'Ürünleri Ideasoft’a aktarın veya güncelleyin',
    icon: Upload,
    path: '/ideasoft/products',
  },
  {
    id: 'ideasoft-ayarlar',
    title: 'OAuth ve API ayarları',
    description: 'Mağaza adresi, Client ID/Secret ve bağlantı',
    icon: Settings,
    path: '/ayarlar/entegrasyonlar/ideasoft',
  },
]

export function IdeasoftPage() {
  return (
    <PageLayout title="Ideasoft" description="Ideasoft mağaza entegrasyonu" backTo="/">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            <CardTitle>Menü</CardTitle>
          </div>
          <CardDescription>Kategori ve marka eşleştirme, bağlantı ayarları</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <Link key={section.id} to={section.path} className="block">
                <div className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <section.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{section.title}</p>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  )
}
