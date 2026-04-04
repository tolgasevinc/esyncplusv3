import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Umbrella, Sparkles, Store, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PageLayout } from '@/components/layout/PageLayout'
import { getSidebarMenus, fetchSidebarMenus } from '@/lib/sidebar-menus'
import { getImageDisplayUrl } from '@/components/ImageInput'
import { API_URL } from '@/lib/api'
import { toastSuccess, toastError } from '@/lib/toast'
import {
  PARASUT_SETTINGS_SCHEMA,
  fetchParasutSettings,
  saveParasutSettings,
  type ParasutSettings,
} from '@/lib/parasut-settings'
import {
  fetchOpenAISettings,
  saveOpenAISettings,
  type OpenAISettings,
} from '@/lib/openai-settings'
import {
  IDEASOFT_SETTINGS_KEYS,
  buildIdeasoftAuthorizationUrl,
  fetchIdeasoftSettings,
  normalizeIdeasoftStoreBaseInput,
  saveIdeasoftSettings,
  validateIdeasoftSettingsForSave,
  type IdeasoftSettings,
} from '@/lib/ideasoft-settings'

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

const INT_TABS = ['parasut', 'ideasoft', 'openai'] as const
type IntTab = (typeof INT_TABS)[number]

function parseIntTab(raw: string | null): IntTab {
  if (raw === 'openai' || raw === 'parasut' || raw === 'ideasoft') return raw
  return 'parasut'
}

const emptyIdeasoft: IdeasoftSettings = {}

export function SettingsIntegrationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = useMemo(() => parseIntTab(searchParams.get('tab')), [searchParams])

  const [activeTab, setActiveTab] = useState<IntTab>(tabFromUrl)

  useEffect(() => {
    setActiveTab(tabFromUrl)
  }, [tabFromUrl])

  const handleTabChange = (v: string) => {
    const next = parseIntTab(v)
    setActiveTab(next)
    setSearchParams({ tab: next }, { replace: true })
  }
  const [parasutIconPath, setParasutIconPath] = useState<string | undefined>()
  const [ideasoftIconPath, setIdeasoftIconPath] = useState<string | undefined>()
  const [parasutSettings, setParasutSettings] = useState<ParasutSettings>({})
  const [ideasoftSettings, setIdeasoftSettings] = useState<IdeasoftSettings>(emptyIdeasoft)
  const [openaiSettings, setOpenaiSettings] = useState<OpenAISettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ideasoftSaving, setIdeasoftSaving] = useState(false)
  const [openaiSaving, setOpenaiSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [ideasoftTesting, setIdeasoftTesting] = useState(false)
  const [ideasoftExchanging, setIdeasoftExchanging] = useState(false)
  const [authCodeInput, setAuthCodeInput] = useState('')
  const lastOAuthState = useRef<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [parasutData, ideasoftData, openaiData] = await Promise.all([
        fetchParasutSettings(),
        fetchIdeasoftSettings().catch(() => ({}) as IdeasoftSettings),
        fetchOpenAISettings().catch(() => ({})),
      ])
      setParasutSettings(parasutData)
      setIdeasoftSettings(ideasoftData)
      setOpenaiSettings(openaiData)
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Ayarlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

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

  async function saveIdeasoft() {
    const err = validateIdeasoftSettingsForSave(ideasoftSettings)
    if (err) {
      toastError('Doğrulama', err)
      return
    }
    setIdeasoftSaving(true)
    try {
      await saveIdeasoftSettings(ideasoftSettings)
      toastSuccess('Kaydedildi', 'IdeaSoft ayarları güncellendi.')
      setIdeasoftSettings((s) => ({
        ...s,
        [IDEASOFT_SETTINGS_KEYS.clientSecret]: '',
        [IDEASOFT_SETTINGS_KEYS.accessToken]: '',
        [IDEASOFT_SETTINGS_KEYS.refreshToken]: '',
      }))
      await loadSettings()
    } catch (e) {
      toastError('Kaydetme hatası', e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setIdeasoftSaving(false)
    }
  }

  async function saveOpenAI() {
    setOpenaiSaving(true)
    try {
      await saveOpenAISettings(openaiSettings)
      toastSuccess('Kaydedildi', 'OpenAI ayarları güncellendi.')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setOpenaiSaving(false)
    }
  }

  useEffect(() => {
    const resolveIcons = (items: { label: string; iconPath?: string }[]) => {
      setParasutIconPath(findIntegrationIconPath(items, ['paraşüt', 'parasut']))
      setIdeasoftIconPath(findIntegrationIconPath(items, ['ideasoft', 'ideashop', 'idea soft']))
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

  async function handleTest() {
    setTesting(true)
    try {
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
    } catch (err) {
      toastError('Test hatası', err instanceof Error ? err.message : 'Bağlantı test edilemedi')
    } finally {
      setTesting(false)
    }
  }

  async function handleIdeasoftTest() {
    setIdeasoftTesting(true)
    try {
      const res = await fetch(`${API_URL}/api/integrations/test/ideasoft`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) toastSuccess('Bağlantı başarılı', data.message || 'Store API yanıt verdi.')
      else toastError('Bağlantı hatası', data.error || 'Test başarısız')
    } catch (err) {
      toastError('Test hatası', err instanceof Error ? err.message : 'Bağlantı test edilemedi')
    } finally {
      setIdeasoftTesting(false)
    }
  }

  function openIdeasoftAuthPage() {
    const state = crypto.randomUUID()
    lastOAuthState.current = state
    const url = buildIdeasoftAuthorizationUrl(
      ideasoftSettings[IDEASOFT_SETTINGS_KEYS.storeBase] ?? '',
      ideasoftSettings[IDEASOFT_SETTINGS_KEYS.clientId] ?? '',
      ideasoftSettings[IDEASOFT_SETTINGS_KEYS.redirectUri] ?? '',
      state
    )
    if (!url) {
      toastError(
        'Eksik bilgi',
        'Mağaza adresi, Client ID ve Redirect URI doğrulanamadı. Alanları kontrol edin.'
      )
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    toastSuccess('Yetki sayfası açıldı', 'Giriş yaptıktan sonra redirect URI’deki `code` değerini aşağıya yapıştırın.')
  }

  async function exchangeIdeasoftCode() {
    const code = authCodeInput.trim()
    if (!code) {
      toastError('Eksik', 'Yetkilendirme kodunu girin.')
      return
    }
    const redirect = (ideasoftSettings[IDEASOFT_SETTINGS_KEYS.redirectUri] ?? '').trim()
    const v = validateIdeasoftSettingsForSave(ideasoftSettings)
    if (v) {
      toastError('Doğrulama', v)
      return
    }
    setIdeasoftExchanging(true)
    try {
      const res = await fetch(`${API_URL}/api/integrations/ideasoft/exchange-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: redirect }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Token alınamadı')
      }
      toastSuccess('Tamam', data.message || 'Token’lar kaydedildi.')
      setAuthCodeInput('')
      await loadSettings()
    } catch (err) {
      toastError('Token hatası', err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setIdeasoftExchanging(false)
    }
  }

  const ideasoftBaseDisplay = normalizeIdeasoftStoreBaseInput(ideasoftSettings[IDEASOFT_SETTINGS_KEYS.storeBase] ?? '')

  return (
    <PageLayout
      title="Entegrasyonlar"
      description="API entegrasyon ayarları"
      backTo="/ayarlar"
      footerActions={
        activeTab === 'parasut' ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? 'Test ediliyor...' : 'Test Et'}
            </Button>
            <Button variant="save" onClick={saveParasut} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        ) : activeTab === 'ideasoft' ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleIdeasoftTest} disabled={ideasoftTesting}>
              {ideasoftTesting ? 'Test...' : 'Store API test'}
            </Button>
            <Button variant="save" onClick={saveIdeasoft} disabled={ideasoftSaving}>
              {ideasoftSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        ) : (
          <Button variant="save" onClick={saveOpenAI} disabled={openaiSaving}>
            {openaiSaving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        )
      }
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="parasut" className="flex items-center gap-2">
            <TabIcon
              iconPath={parasutIconPath}
              fallback={Umbrella}
              alt="Paraşüt"
              className="h-4 w-4"
            />
            Paraşüt
          </TabsTrigger>
          <TabsTrigger value="ideasoft" className="flex items-center gap-2">
            <TabIcon iconPath={ideasoftIconPath} fallback={Store} alt="IdeaSoft" className="h-4 w-4" />
            IdeaSoft
          </TabsTrigger>
          <TabsTrigger value="openai" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            OpenAI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parasut" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Paraşüt API Ayarları</CardTitle>
              <CardDescription>Paraşüt muhasebe entegrasyonu</CardDescription>
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

        <TabsContent value="ideasoft" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>IdeaSoft Store API — OAuth2</CardTitle>
              <CardDescription>
                Panel › Entegrasyonlar › API ile Client ID, Client Secret ve Redirect URI kaydı oluşturun.
                Yetkilendirme: <code className="text-xs">/panel/auth</code>, token:{' '}
                <code className="text-xs">/oauth/v2/token</code> (access ~24 saat, refresh ~2 ay).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
              ) : (
                <>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1">
                    <p>
                      <span className="font-medium text-foreground">Beklenen uçlar</span> (mağaza kökünüze göre):
                    </p>
                    {ideasoftBaseDisplay ? (
                      <ul className="list-disc list-inside text-xs space-y-0.5 font-mono break-all">
                        <li>{ideasoftBaseDisplay}/panel/auth</li>
                        <li>{ideasoftBaseDisplay}/oauth/v2/token</li>
                        <li>{ideasoftBaseDisplay}/api/… (Store API)</li>
                      </ul>
                    ) : (
                      <p className="text-xs">Mağaza adresi girildiğinde özet burada görünür.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="is-base">Mağaza kök adresi</Label>
                    <Input
                      id="is-base"
                      placeholder="https://magaza-adiniz.myideasoft.com"
                      value={ideasoftSettings[IDEASOFT_SETTINGS_KEYS.storeBase] ?? ''}
                      onChange={(e) =>
                        setIdeasoftSettings((s) => ({
                          ...s,
                          [IDEASOFT_SETTINGS_KEYS.storeBase]: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">https ile tam mağaza adresi; sondaki / opsiyonel.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="is-cid">Client ID</Label>
                    <Input
                      id="is-cid"
                      placeholder="Panelde üretilen client_id"
                      value={ideasoftSettings[IDEASOFT_SETTINGS_KEYS.clientId] ?? ''}
                      onChange={(e) =>
                        setIdeasoftSettings((s) => ({
                          ...s,
                          [IDEASOFT_SETTINGS_KEYS.clientId]: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="is-secret">Client Secret</Label>
                    <Input
                      id="is-secret"
                      type="password"
                      autoComplete="new-password"
                      placeholder="•••••••• (yalnızca değiştirirken doldurun)"
                      value={ideasoftSettings[IDEASOFT_SETTINGS_KEYS.clientSecret] ?? ''}
                      onChange={(e) =>
                        setIdeasoftSettings((s) => ({
                          ...s,
                          [IDEASOFT_SETTINGS_KEYS.clientSecret]: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Güvenlik için kayıttan sonra burada gösterilmez. Token almak için en az bir kez doğru secret ile
                      kaydetmelisiniz.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="is-redir">Redirect URI</Label>
                    <Input
                      id="is-redir"
                      placeholder="https://uygulamaniz.com/ideasoft-callback"
                      value={ideasoftSettings[IDEASOFT_SETTINGS_KEYS.redirectUri] ?? ''}
                      onChange={(e) =>
                        setIdeasoftSettings((s) => ({
                          ...s,
                          [IDEASOFT_SETTINGS_KEYS.redirectUri]: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      IdeaSoft panelindeki API kaydındaki Redirect URL ile <strong>birebir</strong> aynı olmalı
                      (redirect_uri_mismatch hatasını önler).
                    </p>
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-medium">İsteğe bağlı — elle yapıştırma</p>
                    <div className="space-y-2">
                      <Label htmlFor="is-at">Access token</Label>
                      <Input
                        id="is-at"
                        type="password"
                        placeholder="Boş bırakırsanız mevcut token korunur"
                        value={ideasoftSettings[IDEASOFT_SETTINGS_KEYS.accessToken] ?? ''}
                        onChange={(e) =>
                          setIdeasoftSettings((s) => ({
                            ...s,
                            [IDEASOFT_SETTINGS_KEYS.accessToken]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="is-rt">Refresh token</Label>
                      <Input
                        id="is-rt"
                        type="password"
                        placeholder="Boş bırakırsanız mevcut token korunur"
                        value={ideasoftSettings[IDEASOFT_SETTINGS_KEYS.refreshToken] ?? ''}
                        onChange={(e) =>
                          setIdeasoftSettings((s) => ({
                            ...s,
                            [IDEASOFT_SETTINGS_KEYS.refreshToken]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-md border p-4 space-y-3">
                    <p className="text-sm font-medium">OAuth authorization_code akışı</p>
                    <p className="text-xs text-muted-foreground">
                      Önce Client Secret dahil formu kaydedin. Ardından yetki sayfasını açın; onay sonrası redirect
                      adresinize gelen <code className="text-[11px]">code</code> parametresini (≈30 sn geçerli)
                      yapıştırıp token alın.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={openIdeasoftAuthPage}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Yetkilendirme sayfasını aç
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="is-code">Yetkilendirme kodu (code)</Label>
                      <Input
                        id="is-code"
                        placeholder="Redirect sonrası URL’deki code=…"
                        value={authCodeInput}
                        onChange={(e) => setAuthCodeInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={exchangeIdeasoftCode}
                        disabled={ideasoftExchanging}
                      >
                        {ideasoftExchanging ? 'İşleniyor...' : 'Token al ve kaydet'}
                      </Button>
                    </div>
                    {lastOAuthState.current && (
                      <p className="text-[11px] text-muted-foreground">
                        Son açılışta kullanılan <code>state</code> (isteğe bağlı doğrulama):{' '}
                        <span className="font-mono break-all">{lastOAuthState.current}</span>
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="openai" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>OpenAI / ChatGPT</CardTitle>
              <CardDescription>
                Ürün e-ticaret metinlerini (açıklama, SEO vb.) otomatik oluşturmak için API anahtarı
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="openai-api_key">API Key</Label>
                    <Input
                      id="openai-api_key"
                      type="password"
                      value={openaiSettings.api_key ?? ''}
                      onChange={(e) => setOpenaiSettings((s) => ({ ...s, api_key: e.target.value }))}
                      placeholder="sk-..."
                    />
                    <p className="text-xs text-muted-foreground">
                      platform.openai.com adresinden API anahtarı alın. Ürün modalında E-Ticaret sekmesindeki &quot;ChatGPT
                      ile Oluştur&quot; butonu bu anahtarı kullanır.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
