import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Link2, Search, Save, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Admin API Currency — GET /admin-api/currencies, GET/PUT /admin-api/currencies/:id (Bearer) */
export interface IdeasoftCurrency {
  id: number
  label: string
  buyingPrice: number
  sellingPrice: number
  abbr: string
  updatedAt?: string
  status: number
  permissionStatus: number
  isPrimary: number
  isEffective: number
  /** Bazı yanıtlarda olmayabilir */
  isExtra?: number
}

export type IdeasoftStatusFilter = 'all' | 'active' | 'inactive'

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
  statusFilter: 'active' as IdeasoftStatusFilter,
}

function normalizeCurrencyRow(raw: Record<string, unknown>): IdeasoftCurrency {
  const id = typeof raw.id === 'number' ? raw.id : parseInt(String(raw.id ?? ''), 10)
  return {
    id: Number.isFinite(id) ? id : 0,
    label: typeof raw.label === 'string' ? raw.label : '',
    abbr: typeof raw.abbr === 'string' ? raw.abbr : '',
    buyingPrice: Number(raw.buyingPrice) || 0,
    sellingPrice: Number(raw.sellingPrice) || 0,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    status: Number(raw.status) || 0,
    permissionStatus: Number(raw.permissionStatus) || 0,
    isPrimary: Number(raw.isPrimary) || 0,
    isEffective: Number(raw.isEffective) || 0,
    isExtra: raw.isExtra !== undefined ? Number(raw.isExtra) || 0 : undefined,
  }
}

function extractCurrenciesList(json: unknown): { items: IdeasoftCurrency[]; total: number } {
  if (Array.isArray(json)) {
    const items = json.map((x) =>
      x && typeof x === 'object' ? normalizeCurrencyRow(x as Record<string, unknown>) : emptyCurrency()
    )
    return { items, total: items.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const items = hydra.map((x) =>
        x && typeof x === 'object' ? normalizeCurrencyRow(x as Record<string, unknown>) : emptyCurrency()
      )
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : items.length
      return { items, total }
    }
    if (Array.isArray(o.data)) {
      const items = (o.data as unknown[]).map((x) =>
        x && typeof x === 'object' ? normalizeCurrencyRow(x as Record<string, unknown>) : emptyCurrency()
      )
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function emptyCurrency(): IdeasoftCurrency {
  return {
    id: 0,
    label: '',
    buyingPrice: 0,
    sellingPrice: 0,
    abbr: '',
    status: 1,
    permissionStatus: 1,
    isPrimary: 0,
    isEffective: 0,
    isExtra: undefined,
  }
}

interface MasterCurrency {
  id: number
  name: string
  code?: string
  symbol?: string
}

/** ideasoft_currency_id (string) → master product_currencies.id (string) */
function applyIdeasoftCurrencyMapping(
  prev: Record<string, string>,
  ideasoftCurrencyId: string,
  masterCurrencyId: string
): Record<string, string> {
  const next = { ...prev }
  for (const [k, v] of Object.entries(next)) {
    if (v === masterCurrencyId && k !== ideasoftCurrencyId) delete next[k]
  }
  next[ideasoftCurrencyId] = masterCurrencyId
  return next
}

function removeIdeasoftCurrencyMappingKey(
  prev: Record<string, string>,
  ideasoftCurrencyId: string
): Record<string, string> {
  const next = { ...prev }
  delete next[ideasoftCurrencyId]
  return next
}

export function IdeasoftCurrenciesPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-currencies-v2', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const [items, setItems] = useState<IdeasoftCurrency[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<IdeasoftCurrency>(emptyCurrency())
  const [saving, setSaving] = useState(false)
  const [loadDetailPending, setLoadDetailPending] = useState(false)
  const [masterCurrencies, setMasterCurrencies] = useState<MasterCurrency[]>([])
  const [masterLoading, setMasterLoading] = useState(false)
  const [currencyMappings, setCurrencyMappings] = useState<Record<string, string>>({})
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [matchPickerRow, setMatchPickerRow] = useState<IdeasoftCurrency | null>(null)
  const [matchPickerSearch, setMatchPickerSearch] = useState('')
  const [matchPickerSelectedMasterId, setMatchPickerSelectedMasterId] = useState<number | null>(null)
  const [savingMapping, setSavingMapping] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const hasFilter = search.length > 0 || statusFilter !== 'active'

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: 'id',
      })
      if (search.trim()) {
        params.set('q', search.trim())
      }
      if (statusFilter === 'active') {
        params.set('status', '1')
      } else if (statusFilter === 'inactive') {
        params.set('status', '0')
      }
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/currencies?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı')
        setItems([])
        setTotal(0)
        return
      }
      const { items: rows, total: t } = extractCurrenciesList(data)
      setItems(rows)
      setTotal(t)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/currency-mappings`)
      const data = await parseJsonResponse<{ mappings?: Record<string, string> }>(res)
      setCurrencyMappings(data.mappings && typeof data.mappings === 'object' ? data.mappings : {})
    } catch {
      setCurrencyMappings({})
    } finally {
      setMappingsLoading(false)
    }
  }, [])

  const fetchMasterCurrencies = useCallback(async () => {
    setMasterLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/product-currencies?limit=9999`)
      const data = await parseJsonResponse<{
        data?: { id: number; name: string; code?: string; symbol?: string }[]
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Master para birimleri yüklenemedi')
      setMasterCurrencies(
        (data.data ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          code: x.code,
          symbol: x.symbol,
        }))
      )
    } catch {
      setMasterCurrencies([])
    } finally {
      setMasterLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMappings()
    void fetchMasterCurrencies()
  }, [fetchMappings, fetchMasterCurrencies])

  const masterById = useMemo(() => new Map(masterCurrencies.map((c) => [c.id, c])), [masterCurrencies])

  const matchPickerFilteredCurrencies = useMemo(() => {
    const q = matchPickerSearch.trim().toLowerCase()
    if (!q) return masterCurrencies
    return masterCurrencies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.symbol && c.symbol.toLowerCase().includes(q)) ||
        String(c.id).includes(q)
    )
  }, [masterCurrencies, matchPickerSearch])

  const openMatchPicker = (row: IdeasoftCurrency, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMatchPickerRow(row)
    setMatchPickerSearch('')
    const cur = currencyMappings[String(row.id)]
    setMatchPickerSelectedMasterId(cur ? parseInt(cur, 10) || null : null)
  }

  const closeMatchPicker = () => {
    setMatchPickerRow(null)
    setMatchPickerSearch('')
    setMatchPickerSelectedMasterId(null)
  }

  const saveCurrencyMapping = async () => {
    if (!matchPickerRow || matchPickerSelectedMasterId == null) return
    const isKey = String(matchPickerRow.id)
    const masterKey = String(matchPickerSelectedMasterId)
    setSavingMapping(true)
    try {
      const next = applyIdeasoftCurrencyMapping(currencyMappings, isKey, masterKey)
      const res = await fetch(`${API_URL}/api/ideasoft/currency-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setCurrencyMappings(next)
      toastSuccess('Eşleştirildi', 'IdeaSoft para birimi master kayıt ile bağlandı.')
      closeMatchPicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const clearCurrencyMapping = async () => {
    if (!matchPickerRow) return
    const isKey = String(matchPickerRow.id)
    setSavingMapping(true)
    try {
      const next = removeIdeasoftCurrencyMappingKey(currencyMappings, isKey)
      const res = await fetch(`${API_URL}/api/ideasoft/currency-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setCurrencyMappings(next)
      toastSuccess('Kaldırıldı', 'Master para birimi eşleştirmesi silindi.')
      closeMatchPicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const clearCurrencyMappingInline = async (row: IdeasoftCurrency, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const isKey = String(row.id)
    if (!currencyMappings[isKey]) return
    setSavingMapping(true)
    try {
      const next = removeIdeasoftCurrencyMappingKey(currencyMappings, isKey)
      const res = await fetch(`${API_URL}/api/ideasoft/currency-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setCurrencyMappings(next)
      toastSuccess('Kaldırıldı', 'Eşleştirme kaldırıldı.')
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const openEdit = async (row: IdeasoftCurrency) => {
    setEditId(row.id)
    setModalOpen(true)
    setLoadDetailPending(true)
    setForm(emptyCurrency())
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/currencies/${row.id}`)
      const data = await parseJsonResponse<IdeasoftCurrency & { error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Kayıt yüklenemedi')
      setForm(
        normalizeCurrencyRow({
          ...data,
          id: data.id,
          label: data.label,
          buyingPrice: data.buyingPrice,
          sellingPrice: data.sellingPrice,
          abbr: data.abbr,
          updatedAt: data.updatedAt,
          status: data.status,
          permissionStatus: data.permissionStatus,
          isPrimary: data.isPrimary,
          isEffective: data.isEffective,
          isExtra: data.isExtra,
        } as Record<string, unknown>)
      )
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Yüklenemedi')
      setModalOpen(false)
      setEditId(null)
    } finally {
      setLoadDetailPending(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditId(null)
    setForm(emptyCurrency())
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (editId == null) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        id: form.id,
        label: form.label.slice(0, 50),
        buyingPrice: form.buyingPrice,
        sellingPrice: form.sellingPrice,
        abbr: form.abbr.slice(0, 5),
        status: form.status ? 1 : 0,
        permissionStatus: form.permissionStatus ? 1 : 0,
        isPrimary: form.isPrimary ? 1 : 0,
        isEffective: form.isEffective ? 1 : 0,
        isExtra: form.isExtra ? 1 : 0,
      }
      if (form.updatedAt) payload.updatedAt = form.updatedAt

      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/currencies/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await parseJsonResponse<{ error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Güncellenemedi')
      toastSuccess('Kaydedildi', 'Kur bilgileri güncellendi.')
      closeModal()
      fetchList()
    } catch (err) {
      toastError('Kayıt hatası', err instanceof Error ? err.message : 'Güncellenemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageLayout
      title="IdeaSoft — Para birimleri"
      description="Admin API GET /admin-api/currencies; master eşleştirme Parametreler › Para birimleri (product_currencies)."
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => {
        void fetchList()
        void fetchMappings()
        void fetchMasterCurrencies()
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ara (q)..."
                  value={search}
                  onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                  className="pl-8 w-56 h-9 rounded-r-none border-r-0"
                />
              </div>
              <div
                role="group"
                aria-label="Kayıt durumu"
                className="inline-flex rounded-r-md border border-l-0 border-input bg-muted/30 p-0.5 shrink-0"
              >
                {(
                  [
                    { key: 'all' as const, label: 'Tümü' },
                    { key: 'active' as const, label: 'Aktif' },
                    { key: 'inactive' as const, label: 'Pasif' },
                  ] as const
                ).map(({ key, label }) => {
                  const isActive = statusFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={label}
                      onClick={() => setListState({ statusFilter: key, page: 1 })}
                      className={cn(
                        'h-9 px-2.5 text-xs font-medium transition-colors first:rounded-l-none last:rounded-r-md cursor-pointer inline-flex items-center justify-center',
                        isActive
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setListState({ search: '', statusFilter: 'active', page: 1 })}
                  className={`h-9 w-9 shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Arama ve filtreyi sıfırla</TooltipContent>
            </Tooltip>
          </div>
        </div>
      }
      footerContent={
        <TablePaginationFooter
          total={total}
          page={page}
          pageSize={pageSize}
          fitLimit={fitLimit}
          onPageChange={(p) => setListState({ page: p })}
          onPageSizeChange={(s) => setListState({ pageSize: s, page: 1 })}
          onFitLimitChange={(fl) => setListState({ fitLimit: fl })}
          tableContainerRef={contentRef}
          hasFilter={hasFilter}
        />
      }
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {listError && (
            <div className="px-4 py-3 text-sm text-destructive border-b border-border whitespace-pre-wrap shrink-0">
              {listError}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">ID</th>
                  <th className="text-left p-2 font-medium">Kısaltma</th>
                  <th className="text-left p-2 font-medium">Etiket</th>
                  <th className="text-center p-2 font-medium w-24">Durum</th>
                  <th className="text-right p-2 font-medium">Alış</th>
                  <th className="text-right p-2 font-medium">Satış</th>
                  <th className="text-left p-2 font-medium min-w-[140px]">Master</th>
                  <th className="text-center p-2 font-medium w-[200px]">Eşleştir / Kaldır</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      Kayıt yok veya liste boş.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      aria-label={`${row.abbr} — ${row.label || 'Kur'} detayını aç`}
                      className={cn(
                        'border-b border-border/60 hover:bg-muted/40 cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                      )}
                      onClick={() => {
                        void openEdit(row)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          void openEdit(row)
                        }
                      }}
                    >
                      <td className="p-2 tabular-nums">{row.id}</td>
                      <td className="p-2 font-medium">{row.abbr}</td>
                      <td className="p-2">{row.label}</td>
                      <td className="p-2 text-center">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            row.status === 1
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {row.status === 1 ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{row.buyingPrice}</td>
                      <td className="p-2 text-right tabular-nums">{row.sellingPrice}</td>
                      <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                        {(() => {
                          const mid = currencyMappings[String(row.id)]
                          if (!mid) return mappingsLoading ? '…' : '—'
                          const mc = masterById.get(parseInt(mid, 10))
                          if (!mc) return <span className="tabular-nums">#{mid}</span>
                          const sym = mc.symbol ? ` ${mc.symbol}` : ''
                          return (
                            <span
                              className="text-foreground"
                              title={
                                mc.code
                                  ? `${mc.name} (${mc.code})${sym}`
                                  : `${mc.name}${sym}`
                              }
                            >
                              <span className="truncate">{mc.name}</span>
                              {mc.code && (
                                <span className="text-xs text-muted-foreground ml-1 shrink-0">
                                  ({mc.code})
                                </span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
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
                            <TooltipContent>Master para birimi seç</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={(e) => void clearCurrencyMappingInline(row, e)}
                                disabled={
                                  !currencyMappings[String(row.id)] ||
                                  savingMapping ||
                                  mappingsLoading
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kur düzenle #{editId}</DialogTitle>
          </DialogHeader>
          {loadDetailPending ? (
            <p className="text-sm text-muted-foreground py-6">Yükleniyor...</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="abbr">Kısaltma (abbr, max 5)</Label>
                  <Input
                    id="abbr"
                    maxLength={5}
                    value={form.abbr}
                    onChange={(e) => setForm((f) => ({ ...f, abbr: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Etiket (max 50)</Label>
                  <Input
                    id="label"
                    maxLength={50}
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="buy">Alış fiyatı (buyingPrice)</Label>
                  <Input
                    id="buy"
                    type="number"
                    min={0}
                    step="any"
                    value={form.buyingPrice}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, buyingPrice: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sell">Satış fiyatı (sellingPrice)</Label>
                  <Input
                    id="sell"
                    type="number"
                    min={0}
                    step="any"
                    value={form.sellingPrice}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sellingPrice: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <Label htmlFor="st">Durum (status)</Label>
                  <Switch
                    id="st"
                    checked={form.status === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <Label htmlFor="perm">İzin (permissionStatus)</Label>
                  <Switch
                    id="perm"
                    checked={form.permissionStatus === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, permissionStatus: v ? 1 : 0 }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <Label htmlFor="prim">Birincil (isPrimary)</Label>
                  <Switch
                    id="prim"
                    checked={form.isPrimary === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isPrimary: v ? 1 : 0 }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <Label htmlFor="eff">Efektif (isEffective)</Label>
                  <Switch
                    id="eff"
                    checked={form.isEffective === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isEffective: v ? 1 : 0 }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border p-3 col-span-2">
                  <Label htmlFor="ex">Ekstra (isExtra)</Label>
                  <Switch
                    id="ex"
                    checked={form.isExtra === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isExtra: v ? 1 : 0 }))}
                  />
                </div>
              </div>
              {form.updatedAt && (
                <p className="text-xs text-muted-foreground">Güncellenme: {form.updatedAt}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeModal}>
                  İptal
                </Button>
                <Button type="submit" variant="save" disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!matchPickerRow} onOpenChange={(open) => !open && closeMatchPicker()}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Master para birimi eşleştir
              {matchPickerRow && (
                <span className="block text-sm font-normal text-muted-foreground mt-1 truncate">
                  IdeaSoft: {matchPickerRow.abbr || matchPickerRow.label || `#${matchPickerRow.id}`}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {matchPickerRow && (
            <>
              {currencyMappings[String(matchPickerRow.id)] && (
                <p className="text-sm text-muted-foreground">
                  Mevcut:{' '}
                  <span className="text-foreground font-medium">
                    {(() => {
                      const id = parseInt(currencyMappings[String(matchPickerRow.id)]!, 10)
                      const c = masterById.get(id)
                      return c
                        ? `${c.name}${c.code ? ` (${c.code})` : ''}${c.symbol ? ` ${c.symbol}` : ''}`
                        : `#${currencyMappings[String(matchPickerRow.id)]}`
                    })()}
                  </span>
                </p>
              )}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Master para birimi ara (ad, kod, sembol, id)..."
                  value={matchPickerSearch}
                  onChange={(e) => setMatchPickerSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-md border">
                {masterLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master para birimleri yükleniyor…
                  </div>
                ) : masterCurrencies.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master kayıt yok. Önce Parametreler › Para birimleri üzerinden ekleyin.
                  </div>
                ) : matchPickerFilteredCurrencies.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Sonuç yok.</div>
                ) : (
                  <div className="p-1 space-y-0.5">
                    {matchPickerFilteredCurrencies.map((c) => {
                      const selected = matchPickerSelectedMasterId === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setMatchPickerSelectedMasterId(c.id)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 min-w-0',
                            selected ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/60'
                          )}
                        >
                          <span className="font-medium truncate min-w-0">{c.name}</span>
                          {c.code && (
                            <span className="text-xs text-muted-foreground shrink-0">({c.code})</span>
                          )}
                          {c.symbol && (
                            <span className="text-xs text-muted-foreground shrink-0">{c.symbol}</span>
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-auto">
                            #{c.id}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:gap-0">
                <div className="flex gap-2 w-full sm:w-auto">
                  {currencyMappings[String(matchPickerRow.id)] && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void clearCurrencyMapping()}
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
                    onClick={() => void saveCurrencyMapping()}
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
