import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Umbrella, Sparkles, Store, ExternalLink, Database, Loader2 } from 'lucide-react'
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
import {
  fetchOkmMysqlSettings,
  saveOkmMysqlSettings,
  type OkmMysqlSettings,
} from '@/lib/okm-mysql-settings'

const okmMysqlSelectClass =
  'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

async function postOkmMysqlDatabases(s: OkmMysqlSettings): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/integrations/okm-mysql/databases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: s.host,
      port: s.port,
      user: s.user,
      password: s.password,
    }),
  })
  const data = (await res.json()) as { ok?: boolean; databases?: string[]; error?: string }
  if (!data.ok) throw new Error(data.error || 'Veritabanları alınamadı')
  return data.databases ?? []
}

async function postOkmMysqlTables(s: OkmMysqlSettings, database: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/integrations/okm-mysql/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: s.host,
      port: s.port,
      user: s.user,
      password: s.password,
      database,
    }),
  })
  const data = (await res.json()) as { ok?: boolean; tables?: string[]; error?: string }
  if (!data.ok) throw new Error(data.error || 'Tablolar alınamadı')
  return data.tables ?? []
}

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

const INT_TABS = ['parasut', 'ideasoft', 'openai', 'okm'] as const
type IntTab = (typeof INT_TABS)[number]

function parseIntTab(raw: string | null): IntTab {
  if (raw === 'openai' || raw === 'parasut' || raw === 'ideasoft' || raw === 'okm') return raw
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
  const [okmIconPath, setOkmIconPath] = useState<string | undefined>()
  const [parasutSettings, setParasutSettings] = useState<ParasutSettings>({})
  const [ideasoftSettings, setIdeasoftSettings] = useState<IdeasoftSettings>(emptyIdeasoft)
  const [openaiSettings, setOpenaiSettings] = useState<OpenAISettings>({})
  const [okmSettings, setOkmSettings] = useState<OkmMysqlSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ideasoftSaving, setIdeasoftSaving] = useState(false)
  const [openaiSaving, setOpenaiSaving] = useState(false)
  const [okmSaving, setOkmSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [ideasoftTesting, setIdeasoftTesting] = useState(false)
  const [okmTesting, setOkmTesting] = useState(false)
  const [okmDatabases, setOkmDatabases] = useState<string[]>([])
  const [okmTables, setOkmTables] = useState<string[]>([])
  const [okmLoadingDbs, setOkmLoadingDbs] = useState(false)
  const [okmLoadingTables, setOkmLoadingTables] = useState(false)
  const [ideasoftExchanging, setIdeasoftExchanging] = useState(false)
  const [authCodeInput, setAuthCodeInput] = useState('')
  const lastOAuthState = useRef<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [parasutData, ideasoftData, openaiData, okmData] = await Promise.all([
        fetchParasutSettings(),
        fetchIdeasoftSettings().catch(() => ({}) as IdeasoftSettings),
        fetchOpenAISettings().catch(() => ({})),
        fetchOkmMysqlSettings().catch((): OkmMysqlSettings => ({})),
      ])
      setParasutSettings(parasutData)
      setIdeasoftSettings(ideasoftData)
      setOpenaiSettings(openaiData)
      setOkmSettings(okmData)
      setOkmDatabases([])
      setOkmTables([])
      try {
        const dbs = await postOkmMysqlDatabases(okmData)
        setOkmDatabases(dbs)
        const db = (okmData.database || '').trim()
        if (db) {
          const tbl = await postOkmMysqlTables(okmData, db)
          setOkmTables(tbl)
        }
      } catch {
        setOkmDatabases([])
        setOkmTables([])
      }
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

  async function saveOkmMysql() {
    setOkmSaving(true)
    try {
      await saveOkmMysqlSettings(okmSettings)
      toastSuccess(
        'Kaydedildi',
        'OKM ayarları kaydedildi. Veritabanı ve blog tablosunu seçtikten sonra tekrar kaydederek blog listesini tamamlayın.',
      )
      await loadSettings()
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setOkmSaving(false)
    }
  }

  async function handleOkmMysqlDatabasesRefresh() {
    setOkmLoadingDbs(true)
    try {
      const dbs = await postOkmMysqlDatabases(okmSettings)
      setOkmDatabases(dbs)
      const prevDb = (okmSettings.database || '').trim()
      if (prevDb && !dbs.includes(prevDb)) {
        setOkmSettings((s) => ({ ...s, database: '', blog_table: '' }))
        setOkmTables([])
      } else if (prevDb && dbs.includes(prevDb)) {
        const tbl = await postOkmMysqlTables(okmSettings, prevDb)
        setOkmTables(tbl)
      } else {
        setOkmTables([])
      }
      toastSuccess('Tamam', `${dbs.length} veritabanı listelendi.`)
    } catch (err) {
      toastError('Liste hatası', err instanceof Error ? err.message : 'Alınamadı')
      setOkmDatabases([])
      setOkmTables([])
    } finally {
      setOkmLoadingDbs(false)
    }
  }

  async function handleOkmMysqlTablesForDatabase(database: string) {
    if (!database.trim()) {
      setOkmTables([])
      return
    }
    setOkmLoadingTables(true)
    try {
      const tbl = await postOkmMysqlTables(okmSettings, database.trim())
      setOkmTables(tbl)
    } catch (err) {
      toastError('Tablolar', err instanceof Error ? err.message : 'Alınamadı')
      setOkmTables([])
    } finally {
      setOkmLoadingTables(false)
    }
  }

  async function handleOkmMysqlTest() {
    setOkmTesting(true)
    try {
      const res = await fetch(`${API_URL}/api/integrations/test/okm-mysql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: okmSettings.host,
          port: okmSettings.port,
          user: okmSettings.user,
          password: okmSettings.password,
          /** Veritabanı ve blog tablosu seçilmeden yalnızca sunucu + kimlik doğrulama */
          connection_only: true,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      if (data.ok) toastSuccess('Bağlantı başarılı', data.message || 'MySQL sunucusu yanıt verdi.')
      else toastError('Bağlantı hatası', data.error || 'Test başarısız')
    } catch (err) {
      toastError('Test hatası', err instanceof Error ? err.message : 'Test edilemedi')
    } finally {
      setOkmTesting(false)
    }
  }

  useEffect(() => {
    const resolveIcons = (items: { label: string; iconPath?: string }[]) => {
      setParasutIconPath(findIntegrationIconPath(items, ['paraşüt', 'parasut']))
      setIdeasoftIconPath(findIntegrationIconPath(items, ['ideasoft', 'ideashop', 'idea soft']))
      setOkmIconPath(findIntegrationIconPath(items, ['okm', 'otomatik', 'kapım']))
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
        ) : activeTab === 'okm' ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleOkmMysqlTest} disabled={okmTesting}>
              {okmTesting ? 'Test ediliyor...' : 'MySQL test'}
            </Button>
            <Button variant="save" onClick={saveOkmMysql} disabled={okmSaving}>
              {okmSaving ? 'Kaydediliyor...' : 'Kaydet'}
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
        <TabsList className="grid w-full max-w-4xl grid-cols-2 sm:grid-cols-4 gap-1">
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
          <TabsTrigger value="okm" className="flex items-center gap-2">
            <TabIcon iconPath={okmIconPath} fallback={Database} alt="OKM" className="h-4 w-4" />
            OKM
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
                      platform.openai.com adresinden API anahtarı alın. Ürün modalı E-Ticaret sekmesindeki &quot;AI&quot; ile tam metin
                      paketi ve isteğe bağlı &quot;Kurallar&quot; özelliği bu anahtarı kullanır.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="okm" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>OKM — Eski site (Otomatik Kapım Marketim) MySQL</CardTitle>
              <CardDescription>
                <strong>Kaydet</strong> ile önce sunucu bağlantı bilgilerini saklayabilirsiniz; veritabanı ve blog tablosu
                zorunlu değildir. Alttaki <strong>MySQL test</strong> yalnızca sunucu + kullanıcı doğrulaması yapar (veritabanı
                veya blog tablosu seçmeniz gerekmez). Listeler için <strong>Veritabanlarını getir</strong> kullanın, ardından
                veritabanı ve tabloyu seçip isteğe bağlı tekrar kaydedin. Sunucu Worker ortamından erişilebilir olmalıdır
                (localhost kullanmayın).
                Yalnızca{' '}
                <Link className="underline font-medium text-foreground" to="/ayarlar/veri-aktarimi">
                  Veri aktarımı
                </Link>{' '}
                MySQL kullanıyorsanız host/kullanıcı burada boş bırakılıp liste yine getirilebilir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
              ) : (
                <>
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-foreground">Sunucu bağlantısı</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-host">Sunucu (host)</Label>
                        <Input
                          id="okm-host"
                          placeholder="mysql.ornekhosting.com"
                          value={okmSettings.host ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, host: e.target.value }))}
                          autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">Uzak MySQL hostname veya IP (Veri aktarımı MySQL kullanıyorsanız boş bırakılabilir).</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="okm-port">Port</Label>
                        <Input
                          id="okm-port"
                          placeholder="3306"
                          value={okmSettings.port ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, port: e.target.value }))}
                          inputMode="numeric"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="okm-user">Kullanıcı</Label>
                        <Input
                          id="okm-user"
                          placeholder="mysql_kullanici"
                          value={okmSettings.user ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, user: e.target.value }))}
                          autoComplete="username"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-password">Şifre</Label>
                        <Input
                          id="okm-password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={okmSettings.password ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, password: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleOkmMysqlDatabasesRefresh()}
                        disabled={okmLoadingDbs}
                      >
                        {okmLoadingDbs ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Yükleniyor…
                          </>
                        ) : (
                          'Veritabanlarını getir'
                        )}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Bağlantı bilgisi değiştiyse listeyi yeniden getirin.
                      </span>
                    </div>
                  </div>

                  <div className="border-t pt-6 space-y-4">
                    <p className="text-sm font-medium text-foreground">Veritabanı ve blog tablosu</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="okm-database-select">Veritabanı</Label>
                        <select
                          id="okm-database-select"
                          aria-label="OKM MySQL veritabanı seçimi"
                          className={okmMysqlSelectClass}
                          value={okmSettings.database ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            setOkmSettings((s) => ({ ...s, database: v, blog_table: '', product_table: '' }))
                            if (v) void handleOkmMysqlTablesForDatabase(v)
                            else setOkmTables([])
                          }}
                          disabled={okmDatabases.length === 0}
                        >
                          <option value="">— Önce listeyi getirin —</option>
                          {okmDatabases.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="okm-blog-table-select">Blog tablosu</Label>
                        <select
                          id="okm-blog-table-select"
                          aria-label="OKM blog tablosu seçimi"
                          className={okmMysqlSelectClass}
                          value={okmSettings.blog_table ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, blog_table: e.target.value }))}
                          disabled={!(okmSettings.database || '').trim() || okmLoadingTables}
                        >
                          <option value="">
                            {okmLoadingTables ? 'Tablolar yükleniyor…' : '— Tablo seçin —'}
                          </option>
                          {(() => {
                            const cur = (okmSettings.blog_table || '').trim()
                            const list = [...okmTables]
                            if (cur && !list.includes(cur)) list.unshift(cur)
                            return list.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))
                          })()}
                        </select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-blog_order_column">Sıralama sütunu</Label>
                        <Input
                          id="okm-blog_order_column"
                          placeholder="id"
                          value={okmSettings.blog_order_column ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, blog_order_column: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          OKM › Blog listesinde ORDER BY için kullanılır (ör. <code className="text-[11px] bg-muted px-1 rounded">id</code>,{' '}
                          <code className="text-[11px] bg-muted px-1 rounded">created_at</code>).
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-blog_source_id_column">Kaynak birincil anahtar sütunu</Label>
                        <Input
                          id="okm-blog_source_id_column"
                          placeholder="id"
                          value={okmSettings.blog_source_id_column ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, blog_source_id_column: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          IdeaSoft eşlemesi ve aktarım için satır kimliği (çoğu tabloda <code className="text-[11px] bg-muted px-1 rounded">id</code>).
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-ideasoft_blog_category_id">IdeaSoft blog kategori ID</Label>
                        <Input
                          id="okm-ideasoft_blog_category_id"
                          placeholder="ör. 3"
                          inputMode="numeric"
                          value={okmSettings.ideasoft_blog_category_id ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, ideasoft_blog_category_id: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Admin API <code className="text-[11px] bg-muted px-1 rounded">POST /admin-api/blogs</code> için kategori gerekir;{' '}
                          <Link className="underline font-medium text-foreground" to="/ideasoft/blog">
                            IdeaSoft › Blog sayfaları
                          </Link>{' '}
                          üzerinde varsayılan kategori tanımlıysa bu alan boş bırakılabilir. Aksi halde buraya sayısal kategori{' '}
                          <code className="text-[11px] bg-muted px-1 rounded">id</code> girin (BlogCategory LIST).
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-ideasoft_blog_id_column">Eski tabloda IdeaSoft blog ID sütunu</Label>
                        <Input
                          id="okm-ideasoft_blog_id_column"
                          placeholder="ör. ideasoft_blog_id"
                          value={okmSettings.ideasoft_blog_id_column ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, ideasoft_blog_id_column: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          OKM MySQL’de daha önce yazı başına IdeaSoft blog kimliği tutuluyorsa sütun adını girin; OKM › Blog sayfasından{' '}
                          <strong>D1’e eski eşlemeleri aktar</strong> ile <code className="text-[11px] bg-muted px-1 rounded">okm_blog_ideasoft_sync</code>{' '}
                          doldurulur (çift gönderim önlenir).
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-blog_image_base_url">Eski site kök URL (blog görselleri)</Label>
                        <Input
                          id="okm-blog_image_base_url"
                          placeholder="https://eski-siteniz.com"
                          value={okmSettings.blog_image_base_url ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, blog_image_base_url: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          İçerikteki <code className="text-[11px] bg-muted px-1 rounded">img src=&quot;/upload/...&quot;</code> gibi göreli yollar bu köke
                          eklenir. Kapak için tam veya göreli görsel adresi çözülür; Worker görseli indirip IdeaSoft’a{' '}
                          <code className="text-[11px] bg-muted px-1 rounded">image</code> veya{' '}
                          <code className="text-[11px] bg-muted px-1 rounded">POST …/blog_images</code> ile gönderir.
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-blog_image_column">Kapak görseli sütunu (isteğe bağlı)</Label>
                        <Input
                          id="okm-blog_image_column"
                          placeholder="Boş: image, resim, thumb, cover… otomatik"
                          value={okmSettings.blog_image_column ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, blog_image_column: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          MySQL’de kapak URL’si veya yolu tutan sütun adı. OAuth’da gerekirse{' '}
                          <code className="text-[11px] bg-muted px-1 rounded">blog_image_create</code> kapsamını ekleyin.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-6 space-y-4">
                    <p className="text-sm font-medium text-foreground">Ürün tablosu (eski site listesi)</p>
                    <p className="text-xs text-muted-foreground">
                      OKM ›{' '}
                      <Link className="underline font-medium text-foreground" to="/okm/products">
                        Ürünler (eski site)
                      </Link>{' '}
                      sayfası bu tablodan okur. SEF sütunu boş bırakılırsa <code className="text-[11px] bg-muted px-1 rounded">sef</code>,{' '}
                      <code className="text-[11px] bg-muted px-1 rounded">slug</code>, <code className="text-[11px] bg-muted px-1 rounded">seo_url</code>{' '}
                      gibi yaygın adlar denenir. Tahmini ürün linki için yukarıdaki <strong>Eski site kök URL</strong> ile{' '}
                      <strong>URL yol segmenti</strong> kullanılır (çoğu yapıda <code className="text-[11px] bg-muted px-1 rounded">urun</code>).
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-product-table-select">Ürün tablosu</Label>
                        <select
                          id="okm-product-table-select"
                          aria-label="OKM ürün tablosu seçimi"
                          className={okmMysqlSelectClass}
                          value={okmSettings.product_table ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, product_table: e.target.value }))}
                          disabled={!(okmSettings.database || '').trim() || okmLoadingTables}
                        >
                          <option value="">
                            {okmLoadingTables ? 'Tablolar yükleniyor…' : '— İsteğe bağlı tablo seçin —'}
                          </option>
                          {(() => {
                            const cur = (okmSettings.product_table || '').trim()
                            const list = [...okmTables]
                            if (cur && !list.includes(cur)) list.unshift(cur)
                            return list.map((t) => (
                              <option key={`p-${t}`} value={t}>
                                {t}
                              </option>
                            ))
                          })()}
                        </select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-product_order_column">Ürün sıralama sütunu</Label>
                        <Input
                          id="okm-product_order_column"
                          placeholder="id"
                          value={okmSettings.product_order_column ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, product_order_column: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Liste <code className="text-[11px] bg-muted px-1 rounded">ORDER BY … DESC</code> ile sıralanır (ör.{' '}
                          <code className="text-[11px] bg-muted px-1 rounded">id</code>,{' '}
                          <code className="text-[11px] bg-muted px-1 rounded">updated_at</code>).
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-product_sef_column">SEF / adres sütunu (isteğe bağlı)</Label>
                        <Input
                          id="okm-product_sef_column"
                          placeholder="Boş: sef, slug, seo_url… otomatik"
                          value={okmSettings.product_sef_column ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, product_sef_column: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="okm-product_url_path_segment">Ürün URL yol segmenti (tahmini link)</Label>
                        <Input
                          id="okm-product_url_path_segment"
                          placeholder="urun"
                          value={okmSettings.product_url_path_segment ?? ''}
                          onChange={(e) => setOkmSettings((s) => ({ ...s, product_url_path_segment: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Eski sitede ürün adresi <code className="text-[11px] bg-muted px-1 rounded">…/urun/ornek-sef</code> ise{' '}
                          <code className="text-[11px] bg-muted px-1 rounded">urun</code> yazın; kök URL yukarıdaki eski site adresidir.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
