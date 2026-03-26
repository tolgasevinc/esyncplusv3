import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Umbrella, Sparkles } from 'lucide-react'
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

const INT_TABS = ['parasut', 'openai'] as const
type IntTab = (typeof INT_TABS)[number]

function parseIntTab(raw: string | null): IntTab {
  if (raw === 'openai' || raw === 'parasut') return raw
  return 'parasut'
}

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
  const [parasutSettings, setParasutSettings] = useState<ParasutSettings>({})
  const [openaiSettings, setOpenaiSettings] = useState<OpenAISettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openaiSaving, setOpenaiSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [parasutData, openaiData] = await Promise.all([
        fetchParasutSettings(),
        fetchOpenAISettings().catch(() => ({})),
      ])
      setParasutSettings(parasutData)
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
        ) : (
          <Button variant="save" onClick={saveOpenAI} disabled={openaiSaving}>
            {openaiSaving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        )
      }
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="parasut" className="flex items-center gap-2">
            <TabIcon
              iconPath={parasutIconPath}
              fallback={Umbrella}
              alt="Paraşüt"
              className="h-4 w-4"
            />
            Paraşüt
          </TabsTrigger>
          <TabsTrigger value="openai" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            OpenAI / ChatGPT
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
                      platform.openai.com adresinden API anahtarı alın. Ürün modalında E-Ticaret sekmesindeki &quot;ChatGPT ile Oluştur&quot; butonu bu anahtarı kullanır.
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
