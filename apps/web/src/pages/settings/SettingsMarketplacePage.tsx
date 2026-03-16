import { useState, useEffect, useCallback } from 'react'
import { Store, Play, List, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError } from '@/lib/toast'
import { MARKETPLACES } from '@/lib/marketplace-config'
import {
  fetchMarketplaceSettings,
  saveMarketplaceSettings,
  testMarketplaceConnection,
  fetchMarketplaceCategoryList,
  type MarketplaceSettings,
} from '@/lib/marketplace-settings'

export function SettingsMarketplacePage() {
  const [activeId, setActiveId] = useState<string>(MARKETPLACES[0].id)
  const [settingsByCategory, setSettingsByCategory] = useState<Record<string, MarketplaceSettings>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false)
  const [categoriesList, setCategoriesList] = useState<{ id: number; name: string; parentId: number | null }[]>([])
  const [categoriesError, setCategoriesError] = useState<string | null>(null)

  const active = MARKETPLACES.find((m) => m.id === activeId)
  const category = active?.category ?? ''
  const currentSettings = settingsByCategory[category] ?? {}
  const setCurrentSettings = (updater: (prev: MarketplaceSettings) => MarketplaceSettings) => {
    setSettingsByCategory((prev) => ({
      ...prev,
      [category]: updater(prev[category] ?? {}),
    }))
  }

  const loadSettings = useCallback(async (cat: string) => {
    try {
      const s = await fetchMarketplaceSettings(cat)
      setSettingsByCategory((prev) => ({ ...prev, [cat]: s }))
    } catch {
      setSettingsByCategory((prev) => ({ ...prev, [cat]: {} }))
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all(MARKETPLACES.map((m) => loadSettings(m.category)))
      setLoading(false)
    }
    load()
  }, [loadSettings])

  useEffect(() => {
    if (category && !(category in settingsByCategory)) loadSettings(category)
  }, [category, settingsByCategory, loadSettings])

  async function handleSave() {
    if (!category) return
    setSaving(true)
    try {
      const s = settingsByCategory[category] ?? {}
      await saveMarketplaceSettings(category, s)
      setSettingsByCategory((prev) => ({ ...prev, [category]: s }))
      toastSuccess('Kaydedildi', `${active?.label} ayarları güncellendi.`)
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  function getRequiredFields(): string[] {
    return active?.fields.filter((f) => f.required).map((f) => f.key) ?? []
  }

  function validateRequired(): boolean {
    const required = getRequiredFields()
    for (const k of required) {
      if (!(currentSettings[k] ?? '').toString().trim()) {
        toastError('Eksik bilgi', `${active?.fields.find((f) => f.key === k)?.label ?? k} gerekli.`)
        return false
      }
    }
    return true
  }

  async function handleTest() {
    if (!validateRequired()) return
    setTesting(true)
    try {
      const result = await testMarketplaceConnection(category, currentSettings)
      if (result.ok) toastSuccess('Bağlantı başarılı', 'API bağlantısı doğrulandı.')
      else toastError('Bağlantı hatası', result.error ?? 'Test başarısız')
    } catch (err) {
      toastError('Test hatası', err instanceof Error ? err.message : 'Bağlantı test edilemedi')
    } finally {
      setTesting(false)
    }
  }

  async function handleCategoriesList() {
    if (!validateRequired()) return
    setCategoriesModalOpen(true)
    setCategoriesLoading(true)
    setCategoriesList([])
    setCategoriesError(null)
    try {
      const list = await fetchMarketplaceCategoryList(category, currentSettings)
      setCategoriesList(list)
      if (list.length > 0) toastSuccess('Kategoriler', `${list.length} kategori yüklendi.`)
      else toastSuccess('Kategoriler', 'Kategori bulunamadı veya API desteklenmiyor.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kategoriler alınamadı'
      setCategoriesError(msg)
      toastError('Yükleme hatası', msg)
    } finally {
      setCategoriesLoading(false)
    }
  }

  return (
    <PageLayout
      title="Marketplace"
      description="Pazaryeri API entegrasyon ayarları"
      backTo="/ayarlar"
      footerActions={
        <Button variant="save" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Pazaryeri Entegrasyonları
          </CardTitle>
          <CardDescription>
            Her pazaryeri için API bilgilerini girin. Kaydet, Test ve Kategori Listesi ile doğrulayın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8">Yükleniyor...</p>
          ) : (
            <Tabs value={activeId} onValueChange={setActiveId}>
              <TabsList className="flex-wrap h-auto gap-1">
                {MARKETPLACES.map((m) => (
                  <TabsTrigger key={m.id} value={m.id}>
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={activeId} className="mt-4">
                {active && (
                  <div className="space-y-4 max-w-xl">
                    {active.id === 'trendyol' && (
                      <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                        Trendyol API bilgileri <strong>Hesap Bilgilerim → Entegrasyon Bilgileri</strong> sayfasından alınır.
                        Basic Auth: API KEY ve API SECRET. User-Agent zorunludur (SelfIntegration veya entegratör firma adı, max 30 karakter).
                        <a href="https://developers.trendyol.com/docs/2-authorization" target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline">Döküman →</a>
                      </p>
                    )}
                    <div className="grid gap-2">
                      <Label>API URL (opsiyonel)</Label>
                      <Input
                        value={currentSettings.api_url ?? ''}
                        onChange={(e) => setCurrentSettings((p) => ({ ...p, api_url: e.target.value }))}
                        placeholder={active.baseUrl || 'https://api.example.com'}
                      />
                    </div>
                    {active.fields.map((field) => (
                      <div key={field.key} className="grid gap-2">
                        <Label htmlFor={field.key}>
                          {field.label}
                          {field.required && <span className="text-destructive ml-0.5">*</span>}
                        </Label>
                        {'options' in field && Array.isArray(field.options) && field.options.length > 0 ? (
                          <select
                            id={field.key}
                            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                            value={(currentSettings[field.key] || field.options[0].value) as string}
                            onChange={(e) => setCurrentSettings((p) => ({ ...p, [field.key]: e.target.value }))}
                          >
                            {field.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            id={field.key}
                            type={field.type}
                            value={currentSettings[field.key] ?? ''}
                            onChange={(e) => setCurrentSettings((p) => ({ ...p, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                          />
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2 pt-4 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTest}
                        disabled={testing}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {testing ? 'Test ediliyor...' : 'Test Et'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCategoriesList}
                        disabled={categoriesLoading}
                      >
                        <List className="h-4 w-4 mr-1" />
                        {categoriesLoading ? 'Yükleniyor...' : 'Kategori Listesi'}
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Dialog open={categoriesModalOpen} onOpenChange={(open) => { setCategoriesModalOpen(open); if (!open) setCategoriesError(null) }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Kategori Listesi</DialogTitle>
            <DialogDescription>
              {active?.label} - Pazaryeri kategorileri
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {categoriesLoading ? (
              <p className="text-sm text-muted-foreground py-8">Yükleniyor...</p>
            ) : categoriesError ? (
              <div className="space-y-2 py-4">
                <p className="text-sm font-medium text-destructive">Hata</p>
                <pre className="text-xs bg-muted p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap break-words">{categoriesError}</pre>
              </div>
            ) : categoriesList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8">Kategori bulunamadı.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {categoriesList.map((cat) => (
                  <li key={cat.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50">
                    <span className="font-mono text-muted-foreground w-8">{cat.id}</span>
                    <span>{cat.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
