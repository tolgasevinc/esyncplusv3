import { useState, useEffect, useCallback } from 'react'
import { Save, Code, Eye } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError } from '@/lib/toast'
import {
  fetchTeklifAyarlariSettings,
  saveTeklifAyarlariSettings,
  type TeklifAyarlariSettings,
} from '@/lib/teklif-ayarlari-settings'

export function TeklifAyarlariPage() {
  const [settings, setSettings] = useState<TeklifAyarlariSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [coverEditMode, setCoverEditMode] = useState<'html' | 'preview'>('html')

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTeklifAyarlariSettings()
      setSettings(data)
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Ayarlar yüklenemedi')
      setSettings({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveTeklifAyarlariSettings(settings)
      toastSuccess('Kaydedildi', 'Teklif ayarları güncellendi.')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageLayout title="Teklif Ayarları" description="Teklif PDF ön sayfası ve genel ayarlar" backTo="/parametreler">
      <Card>
        <CardHeader>
          <CardTitle>Ön Sayfa</CardTitle>
          <CardDescription>
            PDF teklif dosyasına firma tanıtım sayfası eklenebilir. Bu sayfa teklifin başında gösterilir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-muted-foreground">Yükleniyor...</p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="cover-enabled">Ön sayfa ekle</Label>
                  <p className="text-sm text-muted-foreground">Teklif PDF'ine firma tanıtım sayfası eklenir</p>
                </div>
                <Switch
                  id="cover-enabled"
                  checked={settings.cover_page_enabled === '1'}
                  onCheckedChange={(c) => setSettings((s) => ({ ...s, cover_page_enabled: c ? '1' : '0' }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ön sayfa içeriği (HTML olarak düzenlenebilir)</Label>
                <Tabs value={coverEditMode} onValueChange={(v) => setCoverEditMode(v as 'html' | 'preview')}>
                  <TabsList>
                    <TabsTrigger value="html">
                      <Code className="h-4 w-4 mr-2" />
                      HTML Düzenle
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      <Eye className="h-4 w-4 mr-2" />
                      Önizleme
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="html" className="mt-2">
                    <Textarea
                      id="cover-content"
                      value={settings.cover_page_content ?? ''}
                      onChange={(e) => setSettings((s) => ({ ...s, cover_page_content: e.target.value }))}
                      placeholder="<h1>Firma Adı</h1><p>Firma tanıtım metni...</p>"
                      rows={14}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">HTML etiketleri kullanabilirsiniz: h1, h2, p, ul, li, strong, img vb.</p>
                  </TabsContent>
                  <TabsContent value="preview" className="mt-2">
                    <div
                      className="rounded-lg border p-4 min-h-[200px] bg-white dark:bg-zinc-900 text-sm [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_p]:my-2 [&_ul]:list-disc [&_ul]:ml-4"
                      dangerouslySetInnerHTML={{ __html: settings.cover_page_content || '<p class="text-muted-foreground">İçerik yok</p>' }}
                    />
                  </TabsContent>
                </Tabs>
              </div>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                Kaydet
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}
