import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, Save, X } from 'lucide-react'
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

/** Store API Currency (GET/PUT gövdesi — dökümanla uyumlu) */
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
  isExtra: number
}

export type IdeasoftStatusFilter = 'all' | 'active' | 'inactive'

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
  statusFilter: 'active' as IdeasoftStatusFilter,
}

function extractCurrenciesList(json: unknown): { items: IdeasoftCurrency[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftCurrency[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftCurrency[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftCurrency[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
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
    isExtra: 0,
  }
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
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/currencies?${params}`)
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

  const openEdit = async (row: IdeasoftCurrency) => {
    setEditId(row.id)
    setModalOpen(true)
    setLoadDetailPending(true)
    setForm(emptyCurrency())
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/currencies/${row.id}`)
      const data = await parseJsonResponse<IdeasoftCurrency & { error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Kayıt yüklenemedi')
      setForm({
        id: data.id,
        label: data.label ?? '',
        buyingPrice: Number(data.buyingPrice) || 0,
        sellingPrice: Number(data.sellingPrice) || 0,
        abbr: data.abbr ?? '',
        updatedAt: data.updatedAt,
        status: data.status ?? 0,
        permissionStatus: data.permissionStatus ?? 0,
        isPrimary: data.isPrimary ?? 0,
        isEffective: data.isEffective ?? 0,
        isExtra: data.isExtra ?? 0,
      })
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

      const res = await fetch(`${API_URL}/api/ideasoft/store-api/currencies/${editId}`, {
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
      description="Store API: GET /api/currencies (liste), GET/PUT /api/currencies/{id}"
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={fetchList}
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
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
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
    </PageLayout>
  )
}
