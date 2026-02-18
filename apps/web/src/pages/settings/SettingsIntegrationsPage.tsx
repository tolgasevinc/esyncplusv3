import { Umbrella, ShoppingCart } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLayout } from '@/components/layout/PageLayout'

export function SettingsIntegrationsPage() {
  return (
    <PageLayout
      title="Entegrasyonlar"
      description="API entegrasyon ayarları"
      backTo="/ayarlar"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Umbrella className="h-5 w-5" />
              Paraşüt API Ayarları
            </CardTitle>
            <CardDescription>
              Paraşüt muhasebe entegrasyonu
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>API URL</Label>
              <Input placeholder="https://api.parasut.com" />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" placeholder="••••••••" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              OpenCart API Ayarları
            </CardTitle>
            <CardDescription>
              OpenCart e-ticaret entegrasyonu
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mağaza URL</Label>
              <Input placeholder="https://example.com" />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" placeholder="••••••••" />
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
