import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Save, ShoppingBag, Link2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError } from '@/lib/toast'
import {
  fetchIdeasoftSettings,
  saveIdeasoftSettings,
  getIdeasoftRedirectUri,
  getIdeasoftOAuthStartUrl,
  type IdeasoftSettings,
} from '@/lib/ideasoft-settings'

export function SettingsIdeasoftPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [settings, setSettings] = useState<IdeasoftSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const redirectUri = getIdeasoftRedirectUri()

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchIdeasoftSettings()
      setSettings(data)
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Ayarlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    const connected = searchParams.get('ideasoft_connected')
    const err = searchParams.get('ideasoft_error')
    if (connected === '1') {
      toastSuccess('Ideasoft bağlantısı kuruldu', 'OAuth token kaydedildi; ürün yayınını kullanabilirsiniz.')
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('ideasoft_connected')
          return n
        },
        { replace: true }
      )
    } else if (err) {
      toastError('Ideasoft OAuth hatası', err)
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('ideasoft_error')
          return n
        },
        { replace: true }
      )
    }
  }, [searchParams, setSearchParams])

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await saveIdeasoftSettings(settings)
      setSettings(saved)
      toastSuccess('Kaydedildi', 'IdeaSoft entegrasyon ayarları güncellendi.')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageLayout
      title="IdeaSoft"
      description="IdeaSoft mağaza API ve OAuth kimlik bilgileri"
      backTo="/ayarlar"
      footerActions={
        <Button variant="save" onClick={handleSave} disabled={saving || loading}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Entegrasyon ayarları
          </CardTitle>
          <CardDescription>
            Mağaza adresiniz ve Ideasoft panelinden oluşturduğunuz OAuth uygulama bilgileri.{' '}
            <a
              href="https://apidoc.ideasoft.dev/"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              API dokümantasyonu
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6">Yükleniyor...</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <strong>Yönlendirme adresi</strong> Ideasoft panelinde şu şekilde kayıtlı olmalıdır (değiştirmeyin):
                <code className="mt-2 block text-xs break-all rounded border bg-background px-2 py-1.5">{redirectUri}</code>
              </p>
              <div className="grid gap-2">
                <Label htmlFor="ideasoft-store">Mağaza adresi (Admin API)</Label>
                <Input
                  id="ideasoft-store"
                  type="url"
                  autoComplete="off"
                  placeholder="https://magaza-adiniz.myideasoft.com"
                  value={settings.store_base_url ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, store_base_url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Ideasoft mağazanızın kök adresi; API istekleri bu tabana göre yapılır.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ideasoft-client-id">Client ID</Label>
                <Input
                  id="ideasoft-client-id"
                  autoComplete="off"
                  placeholder="OAuth client_id"
                  value={settings.client_id ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, client_id: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ideasoft-client-secret">Client Secret</Label>
                <Input
                  id="ideasoft-client-secret"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={settings.client_secret ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, client_secret: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Gizli anahtar; üretimde güvenli saklama için ileride Worker secret ile de eşlenebilir.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ideasoft-scope">OAuth scope (opsiyonel)</Label>
                <Input
                  id="ideasoft-scope"
                  autoComplete="off"
                  placeholder="public"
                  value={settings.oauth_scope ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, oauth_scope: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Boş bırakılırsa &quot;public&quot; kullanılır. Ideasoft dokümantasyonundaki scope ile uyumlu olmalıdır.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    window.location.href = getIdeasoftOAuthStartUrl()
                  }}
                >
                  <Link2 className="h-4 w-4 mr-1" />
                  Ideasoft ile bağlan
                </Button>
                <p className="text-xs text-muted-foreground w-full">
                  Kaydettikten sonra tıklayın; Ideasoft girişinden sonra bu uygulamaya dönersiniz.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}
