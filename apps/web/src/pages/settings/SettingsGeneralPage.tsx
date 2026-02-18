import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

export function SettingsGeneralPage() {
  return (
    <PageLayout
      title="Genel Ayarlar"
      description="Genel uygulama ayarları"
      backTo="/ayarlar"
    >
      <Card>
        <CardHeader>
          <CardTitle>Genel Yapılandırma</CardTitle>
          <CardDescription>
            Uygulama genelinde geçerli ayarlar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Genel ayarlar formu burada yer alacak.
          </p>
        </CardContent>
      </Card>
    </PageLayout>
  )
}
