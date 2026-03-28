import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Tag, RefreshCw, Link2, Bug, PlusCircle, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toastSuccess, toastError } from '@/lib/toast'

interface MasterBrand {
  id: number
  name: string
  code?: string
}

interface IdeasoftBrandRow {
  id: string
  name?: string
  slug?: string
}

function ideasoftBrandLabel(b: IdeasoftBrandRow): string {
  const raw = String(b.name ?? '').trim()
  const id = String(b.id)
  const looksLikeBareId = raw === id && /^\d+$/.test(raw)
  if (raw && !looksLikeBareId) return raw
  const s = b.slug?.trim()
  if (s) return s.replace(/-/g, ' ')
  return raw || id
}

export function IdeasoftBrandsPage() {
  const [masterBrands, setMasterBrands] = useState<MasterBrand[]>([])
  const [ideasoftBrands, setIdeasoftBrands] = useState<IdeasoftBrandRow[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [masterLoading, setMasterLoading] = useState(true)
  const [ideasoftLoading, setIdeasoftLoading] = useState(true)
  const [mappingsLoading, setMappingsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oauthReconnectHint, setOauthReconnectHint] = useState(false)
  const [savingId, setSavingId] = useState<string | number | null>(null)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerForMasterId, setPickerForMasterId] = useState<number | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugData, setDebugData] = useState<{
    storeBase?: string
    results?: { path: string; url: string; status: number; memberCount: number; rawPreview: string }[]
    error?: string
  } | null>(null)
  const [debugLoading, setDebugLoading] = useState(false)

  const [createMode, setCreateMode] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  const matchedIdeasoftIds = useMemo(() => new Set(Object.values(mappings)), [mappings])

  const ideasoftById = useMemo(() => {
    const m = new Map<string, IdeasoftBrandRow>()
    ideasoftBrands.forEach((b) => m.set(String(b.id), b))
    return m
  }, [ideasoftBrands])

  const openPicker = useCallback((masterId: number, masterName?: string) => {
    setPickerForMasterId(masterId)
    setPickerOpen(true)
    setCreateMode(false)
    setCreateName(masterName ?? '')
  }, [])

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setPickerForMasterId(null)
    setCreateMode(false)
    setCreateName('')
  }, [])

  const fetchMaster = useCallback(async () => {
    setMasterLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/product-brands?limit=9999`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Master markalar yüklenemedi')
      setMasterBrands(
        (data.data ?? []).map((x: { id: number; name: string; code?: string }) => ({
          id: x.id,
          name: x.name,
          code: x.code,
        }))
      )
    } catch {
      setMasterBrands([])
    } finally {
      setMasterLoading(false)
    }
  }, [])

  const fetchIdeasoft = useCallback(async () => {
    setIdeasoftLoading(true)
    setError(null)
    setOauthReconnectHint(false)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/brands`)
      const data = await res.json()
      if (!res.ok) {
        const msg = String(data.error || 'Ideasoft markaları yüklenemedi')
        setOauthReconnectHint(res.status === 401 || /oauth|yetkilendir|bağlantı/i.test(msg))
        throw new Error(msg)
      }
      const raw = (data.data ?? []) as { id: string; name: string; slug?: string }[]
      setIdeasoftBrands(raw.map((x) => ({ id: String(x.id), name: x.name, slug: x.slug })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setIdeasoftBrands([])
    } finally {
      setIdeasoftLoading(false)
    }
  }, [])

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/brand-mappings`)
      const data = await res.json()
      setMappings(data.mappings ?? {})
    } catch {
      setMappings({})
    } finally {
      setMappingsLoading(false)
    }
  }, [])

  const saveMapping = useCallback(
    async (masterId: number, ideasoftId: string) => {
      const key = String(masterId)
      setSavingId(masterId)
      try {
        const next = { ...mappings, [key]: ideasoftId }
        const res = await fetch(`${API_URL}/api/ideasoft/brand-mappings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: next }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
        setMappings(next)
        setSelections((p) => ({ ...p, [key]: '' }))
        closePicker()
        toastSuccess('Başarılı', 'Marka eşleştirmesi kaydedildi.')
      } catch (err) {
        toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
      } finally {
        setSavingId(null)
      }
    },
    [mappings, closePicker]
  )

  const handleMatch = useCallback(
    async (masterId: number, ideasoftId: string) => {
      if (!ideasoftId?.trim()) {
        toastError('Hata', 'Ideasoft markası seçin.')
        return
      }
      await saveMapping(masterId, ideasoftId)
      void fetchIdeasoft()
    },
    [saveMapping, fetchIdeasoft]
  )

  const removeMapping = useCallback(
    async (masterId: number) => {
      const key = String(masterId)
      const next = { ...mappings }
      delete next[key]
      setSavingId(masterId)
      try {
        const res = await fetch(`${API_URL}/api/ideasoft/brand-mappings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: next }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
        setMappings(next)
        toastSuccess('Başarılı', 'Eşleştirme kaldırıldı.')
      } catch (err) {
        toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
      } finally {
        setSavingId(null)
      }
    },
    [mappings]
  )

  const fetchDebug = useCallback(async () => {
    setDebugLoading(true)
    setDebugOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/debug/brands`)
      const data = await res.json()
      setDebugData(data as typeof debugData)
    } catch (err) {
      setDebugData({ error: err instanceof Error ? err.message : 'Tanı başarısız' })
    } finally {
      setDebugLoading(false)
    }
  }, [])

  const handleCreateBrand = useCallback(async () => {
    if (!createName.trim() || !pickerForMasterId) return
    setCreating(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim() }),
      })
      const data = await res.json() as { id?: string; name?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Oluşturulamadı')

      const newId = String(data.id!)
      const newName = data.name || createName.trim()

      setIdeasoftBrands((prev) => [...prev, { id: newId, name: newName }])

      const key = String(pickerForMasterId)
      const next = { ...mappings, [key]: newId }
      const mapRes = await fetch(`${API_URL}/api/ideasoft/brand-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const mapData = await mapRes.json() as { error?: string }
      if (!mapRes.ok) throw new Error(mapData.error || 'Eşleştirme kaydedilemedi')
      setMappings(next)

      toastSuccess('Başarılı', `"${newName}" Ideasoft'ta oluşturuldu ve eşleştirildi.`)
      closePicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setCreating(false)
    }
  }, [createName, pickerForMasterId, mappings, closePicker])

  useEffect(() => {
    fetchMaster()
  }, [fetchMaster])

  useEffect(() => {
    fetchIdeasoft()
  }, [fetchIdeasoft])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  const isLoading = masterLoading || ideasoftLoading || mappingsLoading

  const sortedIdeasoft = useMemo(
    () =>
      [...ideasoftBrands].sort((a, b) =>
        ideasoftBrandLabel(a).localeCompare(ideasoftBrandLabel(b), 'tr')
      ),
    [ideasoftBrands]
  )

  return (
    <PageLayout
      title="Ideasoft Markalar"
      description="Master markaları Ideasoft mağaza markalarıyla eşleştirin"
      backTo="/ideasoft"
      contentOverflow="auto"
      headerActions={
        <div className="flex flex-wrap items-center gap-2 justify-end max-w-[min(100%,42rem)]">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchMaster()
              fetchIdeasoft()
              fetchMappings()
            }}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Yenile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (debugOpen ? setDebugOpen(false) : fetchDebug())}
            disabled={debugLoading}
            title="Ideasoft API tanı — ham yanıtları göster"
          >
            <Bug className="h-4 w-4 mr-1" />
            {debugLoading ? 'Sorgulanıyor…' : 'Tanı'}
          </Button>
        </div>
      }
    >
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-5 w-5" />
            Marka eşleştirme
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
          {error && (
            <div className="flex flex-col gap-2 p-4 text-destructive bg-destructive/10 mx-4 rounded-lg shrink-0 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              {oauthReconnectHint && (
                <Link
                  to="/ayarlar/entegrasyonlar/ideasoft"
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-3 h-9 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  IdeaSoft ayarlarına git
                </Link>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>
            ) : masterBrands.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Master marka bulunamadı. Önce parametrelerden markalar ekleyin.
              </div>
            ) : (
              <div className="border-t">
                {!ideasoftLoading && ideasoftBrands.length === 0 && !error && (
                  <div className="px-4 py-3 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border-b space-y-1.5">
                    <p className="font-medium">Ideasoft marka listesi boş geldi.</p>
                    <p>
                      Olası nedenler: OAuth uygulamasında marka okuma izni yok; mağazada marka tanımlı değil; API yolu bu
                      mağazada farklı.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-amber-400"
                        onClick={() => fetchDebug()}
                      >
                        <Bug className="h-3 w-3 mr-1" />
                        Ham Ideasoft yanıtını göster (Tanı)
                      </Button>
                      <Link
                        to="/ayarlar/entegrasyonlar/ideasoft"
                        className="inline-flex items-center h-7 px-3 text-xs rounded-md border border-amber-400 bg-background hover:bg-accent"
                      >
                        OAuth ayarları
                      </Link>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,12rem)] gap-3 sm:gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                  <div>Master marka</div>
                  <div>Ideasoft eşleşmesi</div>
                  <div className="sm:text-right">Durum</div>
                </div>
                {masterBrands.map((brand) => {
                  const key = String(brand.id)
                  const ideasoftId = mappings[key]
                  const isMatched = !!ideasoftId
                  const matched = ideasoftId ? ideasoftById.get(ideasoftId) : null
                  const sel = selections[key]
                  const ideasoftColText = isMatched
                    ? matched
                      ? ideasoftBrandLabel(matched)
                      : String(ideasoftId ?? '')
                    : sel && ideasoftById.get(sel)
                      ? ideasoftBrandLabel(ideasoftById.get(sel)!)
                      : sel
                        ? sel
                        : null

                  return (
                    <div
                      key={brand.id}
                      className={cn(
                        'grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,12rem)] gap-3 sm:gap-4 items-start sm:items-center border-b px-4 py-2.5 text-sm',
                        isMatched ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'hover:bg-muted/30'
                      )}
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-medium truncate">{brand.name}</span>
                        {brand.code && (
                          <span className="text-xs text-muted-foreground shrink-0">[{brand.code}]</span>
                        )}
                      </div>
                      <div className="min-w-0 sm:pl-0 pl-0">
                        {ideasoftColText ? (
                          <p className="text-foreground break-words leading-snug">{ideasoftColText}</p>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:pl-0">
                        {isMatched ? (
                          <>
                            <Badge className="border-transparent bg-emerald-600/15 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100">
                              Eşleşti
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs shrink-0"
                              onClick={() => removeMapping(brand.id)}
                              disabled={savingId === brand.id}
                            >
                              Kaldır
                            </Button>
                          </>
                        ) : (
                          <>
                            {savingId === brand.id ? (
                              <Badge variant="secondary">Kaydediliyor…</Badge>
                            ) : sel ? (
                              <Badge variant="secondary">Kayda hazır</Badge>
                            ) : (
                              <Badge variant="outline" className="font-normal text-muted-foreground">
                                Eşleşmedi
                              </Badge>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs shrink-0"
                              onClick={() => openPicker(brand.id, brand.name)}
                              disabled={ideasoftLoading}
                            >
                              Marka seç
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 px-2 text-xs shrink-0"
                              onClick={() => sel && handleMatch(brand.id, sel)}
                              disabled={savingId === brand.id || !sel}
                            >
                              {savingId === brand.id ? (
                                '…'
                              ) : (
                                <>
                                  <Link2 className="h-3.5 w-3 mr-1" />
                                  Eşleştir
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={(open) => !open && closePicker()}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{createMode ? "Ideasoft'ta yeni marka oluştur" : 'Ideasoft markası seç'}</DialogTitle>
            <DialogDescription className="sr-only">
              {createMode
                ? 'Ideasoft mağazasında yeni marka oluşturup otomatik eşleştirin.'
                : 'Master marka ile eşleştirmek için Ideasoft mağaza markalarından birini seçin.'}
            </DialogDescription>
          </DialogHeader>

          {createMode ? (
            <div className="flex flex-col gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="create-brand-name">Marka adı</Label>
                <Input
                  id="create-brand-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Marka adı"
                  onKeyDown={(e) => e.key === 'Enter' && !creating && void handleCreateBrand()}
                />
                <p className="text-xs text-muted-foreground">Master marka adından dolduruldu; dilediğiniz gibi düzenleyin.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ideasoft-brand-select">Ideasoft markası</Label>
                <select
                  id="ideasoft-brand-select"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={ideasoftLoading || ideasoftBrands.length === 0}
                  value={pickerForMasterId ? (selections[String(pickerForMasterId)] ?? '') : ''}
                  onChange={(e) => {
                    const v = e.target.value
                    if (pickerForMasterId) {
                      setSelections((p) => ({ ...p, [String(pickerForMasterId)]: v }))
                    }
                  }}
                >
                  <option value="">— Marka seçin —</option>
                  {sortedIdeasoft.map((b) => {
                    const id = String(b.id)
                    const taken = matchedIdeasoftIds.has(id)
                    const label = `${ideasoftBrandLabel(b)}${taken ? ' (başka satırda eşleşmiş)' : ''}`
                    return (
                      <option key={id} value={id} disabled={taken}>
                        {label}
                      </option>
                    )
                  })}
                </select>
                {ideasoftLoading && (
                  <p className="text-xs text-muted-foreground">Ideasoft markaları yükleniyor…</p>
                )}
                {!ideasoftLoading && ideasoftBrands.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Ideasoft markası bulunamadı. &quot;Yeni marka oluştur&quot; ile ekleyebilir veya OAuth bağlantısını
                    kontrol edebilirsiniz.
                  </p>
                )}
              </div>
            </div>
          )}

          {!createMode && pickerForMasterId && selections[String(pickerForMasterId)] && (
            <div className="border-t px-4 py-2 text-sm text-muted-foreground truncate">
              <span className="font-medium text-foreground">Seçilen: </span>
              {(() => {
                const b = ideasoftById.get(selections[String(pickerForMasterId)]!)
                return b ? ideasoftBrandLabel(b) : 'Seçildi'
              })()}
            </div>
          )}

          <DialogFooter className={cn('gap-2', createMode && 'flex-col sm:flex-row')}>
            {createMode ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mr-auto"
                  onClick={() => setCreateMode(false)}
                  disabled={creating}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Geri
                </Button>
                <Button variant="outline" onClick={closePicker} disabled={creating}>
                  İptal
                </Button>
                <Button type="button" onClick={() => void handleCreateBrand()} disabled={!createName.trim() || creating}>
                  {creating ? 'Oluşturuluyor…' : 'Oluştur ve eşleştir'}
                </Button>
              </>
            ) : (
              pickerForMasterId && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mr-auto shrink-0"
                    onClick={() => setCreateMode(true)}
                  >
                    <PlusCircle className="h-4 w-4 mr-1" />
                    Yeni marka oluştur
                  </Button>
                  <Button variant="outline" onClick={closePicker}>
                    İptal
                  </Button>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      onClick={() => {
                        const s = selections[String(pickerForMasterId)]
                        if (s) void handleMatch(pickerForMasterId, s)
                      }}
                      disabled={!selections[String(pickerForMasterId)] || savingId === pickerForMasterId}
                    >
                      {savingId === pickerForMasterId ? '…' : 'Eşleştir'}
                    </Button>
                  </DialogClose>
                </>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground mt-4 px-1 shrink-0">
        Master markalar düz listedir. OAuth (Ayarlar → IdeaSoft) gerekir. &quot;Marka seç&quot; ile Ideasoft markası
        seçip &quot;Eşleştir&quot; ile kaydedin veya mağazada yeni marka oluşturun.
      </p>

      {debugOpen && (
        <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-xs font-mono space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm not-italic font-sans">Ideasoft API Tanı (Markalar)</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setDebugOpen(false)}>
              Kapat
            </Button>
          </div>
          {debugData?.error && <p className="text-destructive">{debugData.error}</p>}
          {debugData?.storeBase && (
            <p className="text-muted-foreground">
              Mağaza: <span className="text-foreground">{debugData.storeBase}</span>
            </p>
          )}
          {debugData?.results?.map((r, i) => (
            <div key={i} className="border rounded p-2 space-y-1 bg-background">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    r.status === 200 && r.memberCount > 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : r.status === 200
                        ? 'bg-amber-100 text-amber-800'
                        : r.status === 404
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-destructive/15 text-destructive'
                  )}
                >
                  {r.status}
                </span>
                <span className="truncate">{r.path}</span>
                <span className="text-muted-foreground shrink-0">üye: {r.memberCount}</span>
              </div>
              <pre className="whitespace-pre-wrap break-all text-[10px] max-h-32 overflow-y-auto">{r.rawPreview}</pre>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  )
}
