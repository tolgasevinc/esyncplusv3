import { useState, useEffect, useCallback } from 'react'
import { Tag, RefreshCw, Link2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

interface ParasutManufacturer {
  id: string
  name?: string
}

export function ParasutBrandsPage() {
  const [masterBrands, setMasterBrands] = useState<MasterBrand[]>([])
  const [parasutManufacturers, setParasutManufacturers] = useState<ParasutManufacturer[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [masterLoading, setMasterLoading] = useState(true)
  const [parasutLoading, setParasutLoading] = useState(true)
  const [mappingsLoading, setMappingsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | number | null>(null)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerForMasterId, setPickerForMasterId] = useState<number | null>(null)

  const parasutById = new Map(parasutManufacturers.map((m) => [m.id, m]))
  const matchedParasutIds = new Set(Object.values(mappings))

  const openPicker = useCallback((masterId: number) => {
    setPickerForMasterId(masterId)
    setPickerOpen(true)
  }, [])

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setPickerForMasterId(null)
  }, [])

  const fetchMaster = useCallback(async () => {
    setMasterLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/product-brands?limit=9999`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Master markalar yüklenemedi')
      setMasterBrands((data.data ?? []).map((x: { id: number; name: string; code?: string }) => ({
        id: x.id,
        name: x.name,
        code: x.code,
      })))
    } catch {
      setMasterBrands([])
    } finally {
      setMasterLoading(false)
    }
  }, [])

  const fetchParasut = useCallback(async () => {
    setParasutLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/parasut/manufacturers`)
      const data = await res.json()
      if (!res.ok) {
        if (data.error) setError(data.error)
        setParasutManufacturers([])
        return
      }
      setParasutManufacturers(data.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setParasutManufacturers([])
    } finally {
      setParasutLoading(false)
    }
  }, [])

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/parasut/brand-mappings`)
      const data = await res.json()
      setMappings(data.mappings ?? {})
    } catch {
      setMappings({})
    } finally {
      setMappingsLoading(false)
    }
  }, [])

  const saveMapping = useCallback(
    async (masterId: number, parasutId: string) => {
      setSavingId(masterId)
      try {
        const next = { ...mappings, [String(masterId)]: parasutId }
        const res = await fetch(`${API_URL}/api/parasut/brand-mappings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: next }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
        setMappings(next)
        setSelections((p) => ({ ...p, [String(masterId)]: '' }))
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

  const removeMapping = useCallback(
    async (masterId: number) => {
      const key = String(masterId)
      const next = { ...mappings }
      delete next[key]
      setSavingId(masterId)
      try {
        const res = await fetch(`${API_URL}/api/parasut/brand-mappings`, {
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

  useEffect(() => {
    fetchMaster()
  }, [fetchMaster])

  useEffect(() => {
    fetchParasut()
  }, [fetchParasut])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  const isLoading = masterLoading || parasutLoading || mappingsLoading

  return (
    <PageLayout
      title="Paraşüt Marka Eşleştirme"
      description="Master markaları Paraşüt e-ticaret markalarıyla eşleştirin"
      backTo="/parasut"
      contentOverflow="hidden"
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Marka Eşleştirme
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchMaster()
                fetchParasut()
                fetchMappings()
              }}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
              Yenile
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {error && (
            <div className="flex items-center gap-2 p-4 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 mx-4 rounded-lg shrink-0">
              <span>{error}</span>
              <span className="text-sm">— Paraşüt marka listesi boş olabilir (ecommerce_manufacturers endpoint).</span>
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
                <div className="grid grid-cols-[1fr_320px] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                  <div>Master marka</div>
                  <div>Paraşüt eşleşmesi</div>
                </div>
                {masterBrands.map((brand) => {
                  const key = String(brand.id)
                  const parasutId = mappings[key]
                  const isMatched = !!parasutId
                  const matchedParasut = parasutId ? parasutById.get(parasutId) : null
                  const sel = selections[key]

                  return (
                    <div
                      key={brand.id}
                      className={cn(
                        'grid grid-cols-[1fr_320px] gap-4 items-center border-b px-4 py-2.5 text-sm',
                        isMatched ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'hover:bg-muted/30'
                      )}
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-medium truncate">{brand.name}</span>
                        {brand.code && (
                          <span className="text-xs text-muted-foreground shrink-0">[{brand.code}]</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isMatched ? (
                          <>
                            <span className="flex-1 truncate text-muted-foreground">
                              {matchedParasut?.name ?? parasutId ?? ''}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                              onClick={() => removeMapping(brand.id)}
                              disabled={savingId === brand.id}
                            >
                              Kaldır
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs shrink-0"
                              onClick={() => openPicker(brand.id)}
                              disabled={parasutLoading}
                            >
                              Marka seç
                            </Button>
                            {sel && (
                              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {parasutById.get(sel)?.name ?? sel}
                              </span>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs shrink-0"
                              onClick={() => sel && saveMapping(brand.id, sel)}
                              disabled={savingId === brand.id || !sel}
                            >
                              {savingId === brand.id ? '...' : <><Link2 className="h-3.5 w-3 mr-1" />Eşleştir</>}
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
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Paraşüt Markası Seç</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {parasutManufacturers.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Paraşüt marka listesi boş. E-ticaret modülünde markalar tanımlı olmalı.
              </div>
            ) : (
              <div className="space-y-0.5">
                {parasutManufacturers.map((m) => {
                  const isDisabled = matchedParasutIds.has(m.id)
                  const isSelected = pickerForMasterId && selections[String(pickerForMasterId)] === m.id

                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return
                        if (pickerForMasterId) {
                          setSelections((p) => ({ ...p, [String(pickerForMasterId)]: m.id }))
                        }
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-md text-sm truncate',
                        isDisabled && 'opacity-50',
                        isSelected && 'bg-primary/10',
                        !isDisabled && 'hover:bg-muted/50'
                      )}
                    >
                      {m.name ?? m.id}
                      {isDisabled && ' ✓'}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            {pickerForMasterId && (
              <>
                <span className="text-sm text-muted-foreground mr-auto">
                  {selections[String(pickerForMasterId)]
                    ? (() => {
                        const m = parasutById.get(selections[String(pickerForMasterId)]!)
                        return m ? `Seçilen: ${m.name ?? m.id}` : 'Seçildi'
                      })()
                    : 'Marka seçin'}
                </span>
                <Button variant="outline" onClick={closePicker}>
                  İptal
                </Button>
                <DialogClose asChild>
                  <Button
                    type="button"
                    onClick={() => {
                      const sel = selections[String(pickerForMasterId)]
                      if (sel) saveMapping(pickerForMasterId, sel)
                    }}
                    disabled={
                      !selections[String(pickerForMasterId)] ||
                      savingId === pickerForMasterId
                    }
                  >
                    {savingId === pickerForMasterId ? '...' : 'Eşleştir'}
                  </Button>
                </DialogClose>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground mt-4 px-1">
        Master markaları Paraşüt e-ticaret markalarıyla eşleştirin. Ürün çekme/gönderme sırasında bu eşleştirmeler kullanılır.
      </p>
    </PageLayout>
  )
}
