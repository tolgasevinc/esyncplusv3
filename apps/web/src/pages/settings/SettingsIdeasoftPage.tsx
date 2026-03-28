import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Save, ShoppingBag, Link2, CheckCircle2, XCircle, AlertTriangle, FolderTree } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL } from '@/lib/api'
import {
  fetchIdeasoftSettings,
  saveIdeasoftSettings,
  getIdeasoftRedirectUri,
  getIdeasoftOAuthStartUrl,
  type IdeasoftSettings,
} from '@/lib/ideasoft-settings'

type IdeasoftStatus = {
  connected: boolean
  hasToken?: boolean
  isExpired?: boolean
  expiresInSec?: number
  storeBase?: string
  reason?: string
}

export function SettingsIdeasoftPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [settings, setSettings] = useState<IdeasoftSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [oauthNavigating, setOauthNavigating] = useState(false)
  const [status, setStatus] = useState<IdeasoftStatus | null>(null)
  const redirectUri = getIdeasoftRedirectUri()

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/status`)
      const data = await res.json() as IdeasoftStatus
      setStatus(data)
    } catch {
      setStatus(null)
    }
  }, [])

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
    loadStatus()
  }, [loadSettings, loadStatus])

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

  async function handleIdeasoftConnect() {
    const store = (settings.store_base_url ?? '').trim()
    const cid = (settings.client_id ?? '').trim()
    const sec = (settings.client_secret ?? '').trim()
    if (!store || !cid) {
      toastError('Eksik bilgi', 'Mağaza adresi ve Client ID zorunludur.')
      return
    }
    if (!sec) {
      toastError(
        'Client Secret gerekli',
        'Ideasoft panelinden Client Secret\'ı kopyalayıp alana yapıştırın; ardından tekrar bağlanın. (Boş kayıt, sunucudaki gizli anahtarı silmez; OAuth için formda değer görünmeli.)'
      )
      return
    }
    setOauthNavigating(true)
    try {
      const saved = await saveIdeasoftSettings(settings)
      setSettings(saved)
      window.location.href = getIdeasoftOAuthStartUrl()
    } catch (err) {
      toastError('Kaydedilemedi', err instanceof Error ? err.message : 'Ayarlar kaydedilemedi; OAuth başlatılamadı.')
      setOauthNavigating(false)
    }
  }

  function formatExpiry(sec: number) {
    if (sec <= 0) return null
    if (sec < 120) return `${sec} saniye`
    if (sec < 7200) return `${Math.round(sec / 60)} dakika`
    if (sec < 172800) return `${Math.round(sec / 3600)} saat`
    return `${Math.round(sec / 86400)} gün`
  }

  const statusBadge = () => {
    if (!status) return null
    if (status.connected) {
      const exp = formatExpiry(status.expiresInSec ?? 0)
      return (
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Bağlı{exp ? ` — token ${exp} içinde yenilenir` : ''}</span>
          <Link to="/ideasoft/categories" className="ml-auto text-xs underline hover:no-underline flex items-center gap-1">
            <FolderTree className="h-3 w-3" />Kategoriler
          </Link>
        </div>
      )
    }
    if (status.reason === 'config_missing') {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg border">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Mağaza adresi veya Client ID girilmemiş.</span>
        </div>
      )
    }
    if (status.isExpired) {
      return (
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Token süresi doldu. &quot;Ideasoft ile bağlan&quot; ile yenileyin.</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
        <XCircle className="h-4 w-4 shrink-0" />
        <span>OAuth bağlantısı yok. Ayarları doldurup &quot;Ideasoft ile bağlan&quot;a tıklayın.</span>
      </div>
    )
  }

  return (
    <PageLayout
      title="IdeaSoft"
      description="IdeaSoft mağaza API ve OAuth kimlik bilgileri"
      backTo="/ayarlar"
      footerActions={
        <Button variant="save" onClick={handleSave} disabled={saving || loading || oauthNavigating}>
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
            <span className="text-muted-foreground">
              API çağrıları dokümantasyondaki gibi hem <code className="text-xs">/admin-api</code> hem{' '}
              <code className="text-xs">/api</code> kökü otomatik denenir.
            </span>{' '}
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
          {statusBadge()}
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
                  Sadece kök alan adı (örn. <code className="text-xs">https://otomatikkapimarketim.myideasoft.com</code>).
                  Sonuna <code className="text-xs">/admin</code> veya başka yol eklemeyin; OAuth adresi bozulup 404 verebilir.
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
                <Label htmlFor="ideasoft-auth-path">OAuth yetkilendirme yolu (gelişmiş)</Label>
                <Input
                  id="ideasoft-auth-path"
                  autoComplete="off"
                  placeholder="/panel/auth"
                  value={settings.oauth_authorize_path ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, oauth_authorize_path: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Boş bırakılırsa <code className="text-xs">/panel/auth</code> (Ideasoft dokümantasyonu).{' '}
                  <code className="text-xs">/admin/oauth/authorize</code> bazı mağazalarda 404 verir; o zaman bu alana{' '}
                  <code className="text-xs">/panel/auth</code> yazıp kaydedin veya alanı temizleyin.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ideasoft-scope">OAuth scope (opsiyonel)</Label>
                <Input
                  id="ideasoft-scope"
                  autoComplete="off"
                  placeholder="Boş bırakın (önerilir)"
                  value={settings.oauth_scope ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, oauth_scope: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Çoğu mağazada <strong>boş</strong> bırakın; <code className="text-xs">scope=public</code> Ideasoft tarafında 500 hatasına yol açabiliyor.
                  Dokümanda açıkça scope isteniyorsa o değeri girin.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleIdeasoftConnect()}
                  disabled={loading || saving || oauthNavigating}
                >
                  <Link2 className="h-4 w-4 mr-1" />
                  {oauthNavigating ? 'Kaydediliyor…' : status?.connected ? 'Yeniden bağlan' : 'Ideasoft ile bağlan'}
                </Button>
                {status?.connected && (
                  <Link
                    to="/ideasoft/categories"
                    className="inline-flex items-center rounded-md border border-input bg-background px-4 h-10 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <FolderTree className="h-4 w-4 mr-1" />
                    Kategori eşleştirmeye git
                  </Link>
                )}
                <p className="text-xs text-muted-foreground w-full">
                  Tıkladığınızda ayarlar önce sunucuya kaydedilir, ardından Ideasoft giriş sayfasına yönlendirilirsiniz.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}
