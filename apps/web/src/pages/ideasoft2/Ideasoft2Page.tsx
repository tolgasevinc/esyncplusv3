import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { FolderTree, Package, Tag } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const sections: { id: string; title: string; description: string; icon: LucideIcon; to: string }[] = [
  {
    id: 'urunler',
    title: 'Ürünler',
    description: 'Product LIST — mağaza ürün koleksiyonu',
    icon: Package,
    to: '/ideasoft2/urunler',
  },
  {
    id: 'kategoriler',
    title: 'Kategoriler',
    description: 'Category LIST — üst-alt ilişkisine göre hiyerarşik ağaç',
    icon: FolderTree,
    to: '/ideasoft2/kategoriler',
  },
  {
    id: 'markalar',
    title: 'Markalar',
    description: 'Brand LIST — mağaza markaları ve logolar',
    icon: Tag,
    to: '/ideasoft2/markalar',
  },
]

export function Ideasoft2Page() {
  return (
    <PageLayout title="IdeaSoft 2" description="Mağaza Admin / Store API — ürünler, kategoriler ve markalar">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.id} to={section.to} className="block min-h-0">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
              <CardHeader className="flex flex-row items-start gap-3 pb-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <section.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <CardDescription className="text-xs">{section.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                Ayarlar › Entegrasyonlar › IdeaSoft ile aynı mağaza kimlik bilgileri kullanılır.
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PageLayout>
  )
}
