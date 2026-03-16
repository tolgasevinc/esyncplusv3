import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'
import { API_URL } from '@/lib/api'

const DIA_ICON_KEY = 'images/icons/1771670345789-yqkiwdl30bh.png'

const diaTables = [
  { id: 'cari-kartlar', title: 'Cari Kartlar', path: '/dia/cari-kartlar' },
  { id: 'vergi-daireleri', title: 'Vergi Daireleri', path: '/dia/vergi-daireleri' },
]

export function DiaPage() {
  return (
    <PageLayout
      title="Dia"
      description="Dia entegrasyonu tabloları"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <img
              src={`${API_URL}/storage/serve?key=${encodeURIComponent(DIA_ICON_KEY)}`}
              alt="Dia"
              className="h-6 w-6 object-contain"
            />
            <CardTitle>Dia Tabloları</CardTitle>
          </div>
          <CardDescription>
            Dia entegrasyonu ile ilgili parametre tabloları
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-12 gap-4">
            {diaTables.map((table) => (
              <Link key={table.id} to={table.path} className="col-span-4">
                <div
                  className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <img
                      src={`${API_URL}/storage/serve?key=${encodeURIComponent(DIA_ICON_KEY)}`}
                      alt=""
                      className="h-5 w-5 object-contain"
                    />
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
    </PageLayout>
  )
}
