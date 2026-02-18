import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

export function SettingsCalculationsPage() {
  return (
    <PageLayout
      title="Hesaplamalar"
      description="Hesaplama ve fiyatlandırma ayarları"
      backTo="/ayarlar"
    >
      <Card>
        <CardHeader>
          <CardTitle>Hesaplama Kuralları</CardTitle>
          <CardDescription>
            Fiyat, KDV ve diğer hesaplama ayarları
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Hesaplama ayarları formu burada yer alacak.
          </p>
        </CardContent>
      </Card>
    </PageLayout>
  )
}
