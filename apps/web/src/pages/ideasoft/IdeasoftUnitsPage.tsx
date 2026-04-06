import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link2, Search, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import { IDEASOFT_STOCK_TYPE_LABELS } from '@/lib/ideasoft-stock-type-labels'

/**
 * IdeaSoft’ta `/admin-api/units` yok. Ürün stok birimi `stockTypeLabel` ile bu sabit değerlerden biri seçilir (Product PDF).
 * Eşleştirme anahtarı: `stockTypeLabel` dizesi (örn. "Piece", "kg") → master `product_unit.id`.
 */
export interface IdeasoftStockTypeRow {
  stockTypeLabel: string
}

interface MasterUnit {
  id: number
  name: string
  code?: string
}

function applyIdeasoftUnitMapping(
  prev: Record<string, string>,
  stockTypeLabelKey: string,
  masterUnitId: string
): Record<string, string> {
  const next = { ...prev }
  for (const [k, v] of Object.entries(next)) {
    if (v === masterUnitId && k !== stockTypeLabelKey) delete next[k]
  }
  next[stockTypeLabelKey] = masterUnitId
  return next
}

function removeIdeasoftUnitMappingKey(
  prev: Record<string, string>,
  stockTypeLabelKey: string
): Record<string, string> {
  const next = { ...prev }
  delete next[stockTypeLabelKey]
  return next
}

const LABEL_HINTS: Record<string, string> = {
  Piece: 'Adet (parça)',
  cm: 'Santimetre',
  Dozen: 'Düzine',
  gram: 'Gram',
  kg: 'Kilogram',
  Person: 'Kişi',
  Package: 'Paket',
  metre: 'Metre',
  m2: 'Metrekare',
  pair: 'Çift',
}

export function IdeasoftUnitsPage() {
  const [search, setSearch] = useState('')
  const [masterUnits, setMasterUnits] = useState<MasterUnit[]>([])
  const [masterLoading, setMasterLoading] = useState(false)
  const [unitMappings, setUnitMappings] = useState<Record<string, string>>({})
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [matchPickerRow, setMatchPickerRow] = useState<IdeasoftStockTypeRow | null>(null)
  const [matchPickerSearch, setMatchPickerSearch] = useState('')
  const [matchPickerSelectedMasterId, setMatchPickerSelectedMasterId] = useState<number | null>(null)
  const [savingMapping, setSavingMapping] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0

  const allRows: IdeasoftStockTypeRow[] = useMemo(
    () => IDEASOFT_STOCK_TYPE_LABELS.map((stockTypeLabel) => ({ stockTypeLabel })),
    []
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter((r) => {
      const label = r.stockTypeLabel.toLowerCase()
      const hint = (LABEL_HINTS[r.stockTypeLabel] ?? '').toLowerCase()
      return label.includes(q) || hint.includes(q)
    })
  }, [allRows, search])

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/unit-mappings`)
      const data = await parseJsonResponse<{ mappings?: Record<string, string> }>(res)
      setUnitMappings(data.mappings && typeof data.mappings === 'object' ? data.mappings : {})
    } catch {
      setUnitMappings({})
    } finally {
      setMappingsLoading(false)
    }
  }, [])

  const fetchMasterUnits = useCallback(async () => {
    setMasterLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/product-units?limit=9999`)
      const data = await parseJsonResponse<{
        data?: { id: number; name: string; code?: string }[]
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Master birimler yüklenemedi')
      setMasterUnits(
        (data.data ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          code: x.code,
        }))
      )
    } catch {
      setMasterUnits([])
    } finally {
      setMasterLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMappings()
    void fetchMasterUnits()
  }, [fetchMappings, fetchMasterUnits])

  const masterById = useMemo(() => new Map(masterUnits.map((u) => [u.id, u])), [masterUnits])

  const matchPickerFilteredUnits = useMemo(() => {
    const q = matchPickerSearch.trim().toLowerCase()
    if (!q) return masterUnits
    return masterUnits.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.code && u.code.toLowerCase().includes(q)) ||
        String(u.id).includes(q)
    )
  }, [masterUnits, matchPickerSearch])

  const mappingKey = (row: IdeasoftStockTypeRow) => row.stockTypeLabel

  const openMatchPicker = (row: IdeasoftStockTypeRow, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMatchPickerRow(row)
    setMatchPickerSearch('')
    const cur = unitMappings[mappingKey(row)]
    setMatchPickerSelectedMasterId(cur ? parseInt(cur, 10) || null : null)
  }

  const closeMatchPicker = () => {
    setMatchPickerRow(null)
    setMatchPickerSearch('')
    setMatchPickerSelectedMasterId(null)
  }

  const saveUnitMapping = async () => {
    if (!matchPickerRow || matchPickerSelectedMasterId == null) return
    const key = mappingKey(matchPickerRow)
    const masterKey = String(matchPickerSelectedMasterId)
    setSavingMapping(true)
    try {
      const next = applyIdeasoftUnitMapping(unitMappings, key, masterKey)
      const res = await fetch(`${API_URL}/api/ideasoft/unit-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setUnitMappings(next)
      toastSuccess('Eşleştirildi', `${key} → master birim bağlandı.`)
      closeMatchPicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const clearUnitMapping = async () => {
    if (!matchPickerRow) return
    const key = mappingKey(matchPickerRow)
    setSavingMapping(true)
    try {
      const next = removeIdeasoftUnitMappingKey(unitMappings, key)
      const res = await fetch(`${API_URL}/api/ideasoft/unit-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setUnitMappings(next)
      toastSuccess('Kaldırıldı', 'Eşleştirme silindi.')
      closeMatchPicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const clearUnitMappingInline = async (row: IdeasoftStockTypeRow, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const key = mappingKey(row)
    if (!unitMappings[key]) return
    setSavingMapping(true)
    try {
      const next = removeIdeasoftUnitMappingKey(unitMappings, key)
      const res = await fetch(`${API_URL}/api/ideasoft/unit-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setUnitMappings(next)
      toastSuccess('Kaldırıldı', 'Eşleştirme kaldırıldı.')
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  return (
    <PageLayout
      title="IdeaSoft — Birimler (stockTypeLabel)"
      description="IdeaSoft’ta ayrı birim listesi API’si yok. Ürün stok birimi Product API’deki stockTypeLabel sabitleridir; burada her kodu master Parametreler › Birimler ile eşleştirirsiniz."
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => {
        void fetchMappings()
        void fetchMasterUnits()
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Kod veya açıklamada ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-56 h-9"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearch('')}
                className={`h-9 w-9 shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Aramayı sıfırla</TooltipContent>
          </Tooltip>
        </div>
      }
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">stockTypeLabel</th>
                  <th className="text-left p-2 font-medium">Açıklama</th>
                  <th className="text-left p-2 font-medium min-w-[120px]">Master</th>
                  <th className="text-center p-2 font-medium w-[200px]">Eşleştir / Kaldır</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.stockTypeLabel} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="p-2 font-mono text-xs font-medium">{row.stockTypeLabel}</td>
                    <td className="p-2 text-muted-foreground">{LABEL_HINTS[row.stockTypeLabel] ?? '—'}</td>
                    <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                      {(() => {
                        const mid = unitMappings[mappingKey(row)]
                        if (!mid) return mappingsLoading ? '…' : '—'
                        const mu = masterById.get(parseInt(mid, 10))
                        if (!mu) return <span className="tabular-nums">#{mid}</span>
                        return (
                          <span className="text-foreground" title={mu.code ? `${mu.name} [${mu.code}]` : mu.name}>
                            <span className="truncate">{mu.name}</span>
                            {mu.code && (
                              <span className="text-xs text-muted-foreground ml-1 shrink-0">[{mu.code}]</span>
                            )}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs gap-1"
                              onClick={(e) => openMatchPicker(row, e)}
                              disabled={masterLoading}
                            >
                              <Link2 className="h-3.5 w-3.5 shrink-0" />
                              Eşleştir
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Master birim seç</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={(e) => void clearUnitMappingInline(row, e)}
                              disabled={
                                !unitMappings[mappingKey(row)] || savingMapping || mappingsLoading
                              }
                            >
                              Kaldır
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Master eşleştirmesini kaldır</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!matchPickerRow} onOpenChange={(open) => !open && closeMatchPicker()}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Master birim eşleştir
              {matchPickerRow && (
                <span className="block text-sm font-normal text-muted-foreground mt-1 font-mono">
                  stockTypeLabel: {matchPickerRow.stockTypeLabel}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {matchPickerRow && (
            <>
              {unitMappings[mappingKey(matchPickerRow)] && (
                <p className="text-sm text-muted-foreground">
                  Mevcut:{' '}
                  <span className="text-foreground font-medium">
                    {(() => {
                      const id = parseInt(unitMappings[mappingKey(matchPickerRow)]!, 10)
                      const u = masterById.get(id)
                      return u ? `${u.name}${u.code ? ` [${u.code}]` : ''}` : `#${unitMappings[mappingKey(matchPickerRow)]}`
                    })()}
                  </span>
                </p>
              )}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Master birim ara (ad, kod, id)..."
                  value={matchPickerSearch}
                  onChange={(e) => setMatchPickerSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-md border">
                {masterLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master birimler yükleniyor…
                  </div>
                ) : masterUnits.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master birim yok. Önce Parametreler › Birimler üzerinden ekleyin.
                  </div>
                ) : matchPickerFilteredUnits.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Sonuç yok.</div>
                ) : (
                  <div className="p-1 space-y-0.5">
                    {matchPickerFilteredUnits.map((u) => {
                      const selected = matchPickerSelectedMasterId === u.id
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setMatchPickerSelectedMasterId(u.id)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 min-w-0',
                            selected ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/60'
                          )}
                        >
                          <span className="font-medium truncate min-w-0">{u.name}</span>
                          {u.code && (
                            <span className="text-xs text-muted-foreground shrink-0">[{u.code}]</span>
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-auto">
                            #{u.id}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:gap-0">
                <div className="flex gap-2 w-full sm:w-auto">
                  {unitMappings[mappingKey(matchPickerRow)] && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void clearUnitMapping()}
                      disabled={savingMapping}
                    >
                      Kaldır
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 justify-end w-full sm:w-auto">
                  <Button type="button" variant="outline" onClick={closeMatchPicker} disabled={savingMapping}>
                    İptal
                  </Button>
                  <Button
                    type="button"
                    variant="save"
                    disabled={savingMapping || matchPickerSelectedMasterId == null}
                    onClick={() => void saveUnitMapping()}
                  >
                    {savingMapping ? 'Kaydediliyor...' : 'Kaydet'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
