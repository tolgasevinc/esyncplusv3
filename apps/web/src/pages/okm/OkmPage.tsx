import { Link } from 'react-router-dom'
import { FileText, Package } from 'lucide-react'
import { PageLayout } from '@/components/layout/PageLayout'

const sections = [
  {
    id: 'products',
    title: 'Ürünler (eski site)',
    description: 'MySQL ürün tablosu, SEF adres ve tahmini ürün URL’si',
    to: '/okm/products',
    icon: Package,
  },
  { id: 'blog', title: 'Blog sayfaları', description: 'OKM veritabanındaki blog yazıları listesi', to: '/okm/blog', icon: FileText },
]

export function OkmPage() {
  return (
    <PageLayout title="OKM" description="OKM mağaza veritabanı bağlantısı ve içerik yönetimi">
      <div className="grid grid-cols-12 gap-4 max-w-4xl">
        {sections.map((s) => (
          <div key={s.id} className="col-span-12 sm:col-span-6 lg:col-span-4">
            <Link
              to={s.to}
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </PageLayout>
  )
}
