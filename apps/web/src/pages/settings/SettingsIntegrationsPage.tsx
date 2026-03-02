import { useState, useEffect, useCallback } from 'react'
import { Umbrella, ShoppingCart, Eye, EyeOff, FolderTree } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLayout } from '@/components/layout/PageLayout'
import { getSidebarMenus, fetchSidebarMenus } from '@/lib/sidebar-menus'
import { getImageDisplayUrl } from '@/components/ImageInput'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { toastSuccess, toastError } from '@/lib/toast'
import {
  PARASUT_SETTINGS_SCHEMA,
  fetchParasutSettings,
  saveParasutSettings,
  type ParasutSettings,
} from '@/lib/parasut-settings'

const OPENCART_CATEGORY = 'opencart'

/** Sidebar menülerden entegrasyon ikon path'ini bul (label ile eşleşme) */
function findIntegrationIconPath(menus: { label: string; iconPath?: string }[], keywords: string[]): string | undefined {
  const lower = (s: string) => s.toLowerCase().replace(/[ş]/g, 's').replace(/[ı]/g, 'i')
  for (const item of menus) {
    const label = lower(item.label)
    if (keywords.some((k) => label.includes(lower(k))) && item.iconPath) {
      return item.iconPath
    }
  }
  return undefined
}

function TabIcon({
  iconPath,
  fallback: FallbackIcon,
  alt,
  className = 'h-4 w-4',
}: {
  iconPath?: string
  fallback: React.ComponentType<{ className?: string }>
  alt: string
  className?: string
}) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    setImgError(false)
  }, [iconPath])

  if (iconPath && !imgError) {
    return (
      <img
        src={getImageDisplayUrl(iconPath)}
        alt={alt}
        className={className}
        onError={() => setImgError(true)}
      />
    )
  }
  return <FallbackIcon className={className} />
}

export function SettingsIntegrationsPage() {
  const [parasutIconPath, setParasutIconPath] = useState<string | undefined>()
  const [opencartIconPath, setOpencartIconPath] = useState<string | undefined>()
  const [opencartAuthType, setOpencartAuthType] = useState<'simple' | 'oauth'>('simple')

  const [parasutSettings, setParasutSettings] = useState<ParasutSettings>({})

  const [opencartStoreUrl, setOpencartStoreUrl] = useState('')
  const [opencartApiFormat, setOpencartApiFormat] = useState<'rest' | 'api_rest_admin'>('rest')
  const [opencartSecretKey, setOpencartSecretKey] = useState('')
  const [opencartClientId, setOpencartClientId] = useState('')
  const [opencartClientSecret, setOpencartClientSecret] = useState('')
  const [opencartLanguage, setOpencartLanguage] = useState('tr')
  const [showOpencartSecretKey, setShowOpencartSecretKey] = useState(false)
  const [showOpencartClientSecret, setShowOpencartClientSecret] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoriesData, setCategoriesData] = useState<unknown>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [opencartRes, parasutData] = await Promise.all([
        fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(OPENCART_CATEGORY)}`),
        fetchParasutSettings(),
      ])
      const opencartData = opencartRes.ok
        ? await parseJsonResponse<Record<string, string>>(opencartRes)
        : {}
      setOpencartStoreUrl(opencartData.store_url ?? '')
      setOpencartApiFormat((opencartData.api_format === 'api_rest_admin' ? 'api_rest_admin' : 'rest') as 'rest' | 'api_rest_admin')
      setOpencartAuthType((opencartData.auth_type || 'simple') as 'simple' | 'oauth')
      setOpencartSecretKey(opencartData.secret_key ?? '')
      setOpencartClientId(opencartData.client_id ?? '')
      setOpencartClientSecret(opencartData.client_secret ?? '')
      setOpencartLanguage(opencartData.language ?? 'tr')
      setParasutSettings(parasutData)
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Paraşüt ve OpenCart ayarları yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  async function saveOpenCart() {
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/app-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: OPENCART_CATEGORY,
          settings: {
            store_url: opencartStoreUrl.trim(),
            api_format: opencartApiFormat,
            auth_type: opencartAuthType,
            secret_key: opencartSecretKey,
            client_id: opencartClientId,
            client_secret: opencartClientSecret,
            language: opencartLanguage,
          },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Kaydedilemedi')
      toastSuccess('Kaydedildi', 'OpenCart entegrasyon ayarları güncellendi.')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  async function saveParasut() {
    setSaving(true)
    try {
      await saveParasutSettings(parasutSettings)
      toastSuccess('Kaydedildi', 'Paraşüt entegrasyon ayarları güncellendi.')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const resolveIcons = (items: { label: string; iconPath?: string }[]) => {
      setParasutIconPath(findIntegrationIconPath(items, ['paraşüt', 'parasut']))
      setOpencartIconPath(findIntegrationIconPath(items, ['opencart', 'open cart']))
    }
    const load = async () => {
      const menus = await fetchSidebarMenus()
      resolveIcons(menus.length > 0 ? menus : getSidebarMenus())
    }
    load()
    const onMenusUpdate = () => resolveIcons(getSidebarMenus())
    window.addEventListener('esync-sidebar-menus-updated', onMenusUpdate)
    return () => window.removeEventListener('esync-sidebar-menus-updated', onMenusUpdate)
  }, [])

  const [activeTab, setActiveTab] = useState<'parasut' | 'opencart'>('parasut')

  const handleSave = () => {
    if (activeTab === 'parasut') saveParasut()
    else saveOpenCart()
  }

  async function handleTest() {
    setTesting(true)
    try {
      if (activeTab === 'parasut') {
        const res = await fetch(`${API_URL}/api/integrations/test/parasut`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            PARASUT_CLIENT_ID: parasutSettings.PARASUT_CLIENT_ID,
            PARASUT_CLIENT_SECRET: parasutSettings.PARASUT_CLIENT_SECRET,
            PARASUT_USERNAME: parasutSettings.PARASUT_USERNAME,
            PARASUT_PASSWORD: parasutSettings.PARASUT_PASSWORD,
          }),
        })
        const data = await res.json()
        if (data.ok) toastSuccess('Bağlantı başarılı', 'Paraşüt API bağlantısı doğrulandı.')
        else toastError('Bağlantı hatası', data.error || 'Test başarısız')
      } else {
        const res = await fetch(`${API_URL}/api/integrations/test/opencart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_url: opencartStoreUrl.trim(),
            api_format: opencartApiFormat,
            auth_type: opencartAuthType,
            secret_key: opencartSecretKey,
            client_id: opencartClientId,
            client_secret: opencartClientSecret,
            language: opencartLanguage,
          }),
        })
        const data = await res.json()
        if (data.ok) toastSuccess('Bağlantı başarılı', 'OpenCart API bağlantısı doğrulandı.')
        else {
          const errMsg = [data.error, data.detail].filter(Boolean).join(' — ') || 'Test başarısız'
          console.error('[OpenCart Test] 400:', errMsg)
          toastError('Bağlantı hatası', errMsg)
        }
      }
    } catch (err) {
      toastError('Test hatası', err instanceof Error ? err.message : 'Bağlantı test edilemedi')
    } finally {
      setTesting(false)
    }
  }

  async function handleFetchCategories() {
    if (activeTab !== 'opencart') return
    setCategoriesLoading(true)
    setCategoriesData(null)
    try {
      const res = await fetch(`${API_URL}/api/integrations/test/opencart/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_url: opencartStoreUrl.trim(),
          api_format: opencartApiFormat,
          auth_type: opencartAuthType,
          secret_key: opencartSecretKey,
          client_id: opencartClientId,
          client_secret: opencartClientSecret,
          language: opencartLanguage,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setCategoriesData(data.data)
        const list = Array.isArray((data.data as { data?: unknown[] })?.data)
          ? (data.data as { data: unknown[] }).data
          : Array.isArray((data.data as { categories?: unknown[] })?.categories)
            ? (data.data as { categories: unknown[] }).categories
            : []
        toastSuccess('Kategoriler alındı', `${list.length} kategori bulundu`)
      } else {
        toastError('Kategoriler alınamadı', data.error || 'Hata')
      }
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kategoriler çekilemedi')
    } finally {
      setCategoriesLoading(false)
    }
  }

  return (
    <PageLayout
      title="Entegrasyonlar"
      description="API entegrasyon ayarları"
      backTo="/ayarlar"
      footerActions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? 'Test ediliyor...' : 'Test Et'}
          </Button>
          {activeTab === 'opencart' && (
            <Button variant="outline" onClick={handleFetchCategories} disabled={categoriesLoading}>
              <FolderTree className="h-4 w-4 mr-1.5" />
              {categoriesLoading ? 'Yükleniyor...' : 'Kategorileri Çek'}
            </Button>
          )}
          <Button variant="save" onClick={handleSave} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'parasut' | 'opencart')} className="space-y-4">
        <TabsList>
          <TabsTrigger value="parasut" className="gap-1.5">
            <TabIcon
              iconPath={parasutIconPath}
              fallback={Umbrella}
              alt="Paraşüt"
            />
            Paraşüt
          </TabsTrigger>
          <TabsTrigger value="opencart" className="gap-1.5">
            <TabIcon
              iconPath={opencartIconPath}
              fallback={ShoppingCart}
              alt="OpenCart"
            />
            OpenCart
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parasut" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TabIcon
                  iconPath={parasutIconPath}
                  fallback={Umbrella}
                  alt="Paraşüt"
                  className="h-5 w-5"
                />
                Paraşüt API Ayarları
              </CardTitle>
              <CardDescription>
                Paraşüt muhasebe entegrasyonu
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
              ) : (
                <div className="space-y-4">
                  {PARASUT_SETTINGS_SCHEMA.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`parasut-${field.key}`}>{field.label}</Label>
                      <Input
                        id={`parasut-${field.key}`}
                        type={field.type}
                        value={parasutSettings[field.key] ?? ''}
                        onChange={(e) =>
                          setParasutSettings((s) => ({ ...s, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                      />
                      {field.description && (
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opencart" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TabIcon
                  iconPath={opencartIconPath}
                  fallback={ShoppingCart}
                  alt="OpenCart"
                  className="h-5 w-5"
                />
                OpenCart REST Admin API Ayarları
              </CardTitle>
              <CardDescription>
                OpenCart e-ticaret mağazası ile entegrasyon. REST Admin API eklentisi (opencart-api.com) gereklidir. Ürünler, siparişler, müşteriler yönetilebilir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
              ) : (
                <>
              <div className="space-y-2">
                <Label htmlFor="opencart-store-url">Mağaza URL</Label>
                <Input
                  id="opencart-store-url"
                  value={opencartStoreUrl}
                  onChange={(e) => setOpencartStoreUrl(e.target.value)}
                  placeholder="https://shop.example.com/"
                  title="OpenCart mağaza ana adresi (sonunda / olmalı)"
                />
                <p className="text-xs text-muted-foreground">
                  Mağazanın kök adresi. Örn: https://shop.example.com/
                </p>
              </div>

              <div className="space-y-2">
                <Label>API formatı</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={opencartApiFormat}
                  onChange={(e) => setOpencartApiFormat(e.target.value as 'rest' | 'api_rest_admin')}
                >
                  <option value="rest">index.php?route=rest/ (opencart-api.com standart)</option>
                  <option value="api_rest_admin">/api/rest_admin/ (shop.hhsotomatikkapi.com vb.)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Mağazanızdaki REST API eklentisinin URL yapısı. /api/rest_admin/categories gibi adresler kullanıyorsa ikinci seçeneği seçin.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Kimlik doğrulama</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={opencartAuthType}
                  onChange={(e) => setOpencartAuthType(e.target.value as 'simple' | 'oauth')}
                >
                  <option value="simple">Simple (Secret Key) — X-Oc-Restadmin-Id header</option>
                  <option value="oauth">OAuth 2.0 — Bearer token</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  REST Admin API eklenti ayarlarından seçilen güvenlik tipi ile eşleşmeli.
                </p>
              </div>

              {opencartAuthType === 'simple' && (
                <div className="space-y-2">
                  <Label htmlFor="opencart-secret-key">Secret Key (X-Oc-Restadmin-Id)</Label>
                  <div className="relative">
                    <Input
                      id="opencart-secret-key"
                      type={showOpencartSecretKey ? 'text' : 'password'}
                      value={opencartSecretKey}
                      onChange={(e) => setOpencartSecretKey(e.target.value)}
                      placeholder="REST API yapılandırma sayfasındaki secret key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowOpencartSecretKey((v) => !v)}
                      title={showOpencartSecretKey ? 'Gizle' : 'Göster'}
                    >
                      {showOpencartSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Eklenti ayarlarında tanımladığınız secret key. Boş bırakılırsa kimlik doğrulama devre dışı kalır.
                  </p>
                </div>
              )}

              {opencartAuthType === 'oauth' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="opencart-client-id">Client ID</Label>
                      <Input
                        id="opencart-client-id"
                        value={opencartClientId}
                        onChange={(e) => setOpencartClientId(e.target.value)}
                        placeholder="OAuth client id"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="opencart-client-secret">Client Secret</Label>
                      <div className="relative">
                        <Input
                          id="opencart-client-secret"
                          type={showOpencartClientSecret ? 'text' : 'password'}
                          value={opencartClientSecret}
                          onChange={(e) => setOpencartClientSecret(e.target.value)}
                          placeholder="OAuth client secret"
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowOpencartClientSecret((v) => !v)}
                          title={showOpencartClientSecret ? 'Gizle' : 'Göster'}
                        >
                          {showOpencartClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Client ID ve Client Secret herhangi bir string olabilir. Bearer token almak için index.php?route=rest/token kullanılır.
                  </p>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="opencart-language">API yanıt dili (X-Oc-Merchant-Language)</Label>
                <select
                  id="opencart-language"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={opencartLanguage}
                  onChange={(e) => setOpencartLanguage(e.target.value)}
                >
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                  <option value="hu">Magyar</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  API yanıtlarının dilini belirler (kategori, ürün adları vb.).
                </p>
              </div>
                </>
              )}

              {categoriesData != null ? (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <FolderTree className="h-4 w-4" />
                    Kategori listesi (örnek)
                  </h4>
                  <pre className="p-4 rounded-lg bg-muted text-xs overflow-auto max-h-64">
                    {JSON.stringify(categoriesData, null, 2)}
                  </pre>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
