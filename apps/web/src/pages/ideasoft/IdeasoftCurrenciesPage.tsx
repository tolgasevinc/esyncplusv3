import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Coins, RefreshCw, Pencil, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { API_URL, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toastSuccess, toastError } from '@/lib/toast'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { DecimalInput } from '@/components/DecimalInput'

/** Store API Currency (GET/PUT gövdesi) */
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

/** Liste varsayılanı: yalnızca aktif kayıtlar (Store API status=1) */
const DEFAULT_STATUS_FILTER = '1' as const

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 20 as PageSizeValue,
  fitLimit: 20,
  statusFilter: DEFAULT_STATUS_FILTER as '' | '0' | '1',
}

function extractCurrenciesList(json: unknown): { items: IdeasoftCurrency[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftCurrency[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydraMember = o['hydra:member']
    if (Array.isArray(hydraMember)) {
      const total = typeof o['hydra:totalItems'] === 'number' ? o['hydra:totalItems'] : hydraMember.length
      return { items: hydraMember as IdeasoftCurrency[], total }
    }
    if (Array.isArray(o.data)) {
      const total = typeof o.total === 'number' ? o.total : o.data.length
      return { items: o.data as IdeasoftCurrency[], total }
    }
  }
  return { items: [], total: 0 }
}

function Badge01({ v, activeLabel }: { v: number; activeLabel: string }) {
  const on = v === 1
  return (
    <span
      className={cn(
        'inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium',
        on ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
      )}
    >
      {on ? activeLabel : 'Hayır'}
    </span>
  )
}

export function IdeasoftCurrenciesPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-currencies-v2', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const limit = pageSize === 'fit' ? fitLimit : Number(pageSize) || 20

  const [items, setItems] = useState<IdeasoftCurrency[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<IdeasoftCurrency>>({})

  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0 || statusFilter !== DEFAULT_STATUS_FILTER

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(Math.min(100, Math.max(1, limit))),
        sort: 'id',
      })
      const q = search.trim()
      if (q) params.set('q', q)
      if (statusFilter === '0' || statusFilter === '1') params.set('status', statusFilter)

      const res = await fetch(`${API_URL}/api/ideasoft/store-api/currencies?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        const err = (data as { error?: string }).error || 'Liste alınamadı'
        setListError(err)
        setItems([])
        setTotal(0)
        return
      }
      const { items: rows, total: t } = extractCurrenciesList(data)
      setItems(rows)
      setTotal(t || rows.length)
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const openEdit = useCallback(async (id: number) => {
    setEditId(id)
    setEditOpen(true)
    setEditLoading(true)
    setForm({})
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/currencies/${id}`)
      const data = await parseJsonResponse<IdeasoftCurrency & { error?: string }>(res)
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Kayıt yüklenemedi')
      setForm(data)
    } catch (e) {
      toastError('Hata', e instanceof Error ? e.message : 'Yüklenemedi')
      setEditOpen(false)
      setEditId(null)
    } finally {
      setEditLoading(false)
    }
  }, [])

  const saveEdit = useCallback(async () => {
    if (editId == null) return
    setSaving(true)
    try {
      const payload: IdeasoftCurrency = {
        id: form.id ?? editId,
        label: (form.label ?? '').slice(0, 50),
        buyingPrice: Number(form.buyingPrice ?? 0),
        sellingPrice: Number(form.sellingPrice ?? 0),
        abbr: (form.abbr ?? '').slice(0, 5),
        updatedAt: form.updatedAt,
        status: form.status === 1 ? 1 : 0,
        permissionStatus: form.permissionStatus === 1 ? 1 : 0,
        isPrimary: form.isPrimary === 1 ? 1 : 0,
        isEffective: form.isEffective === 1 ? 1 : 0,
        isExtra: form.isExtra === 1 ? 1 : 0,
      }
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/currencies/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Güncellenemedi')
      toastSuccess('Güncellendi', 'Para birimi mağazada kaydedildi.')
      setEditOpen(false)
      setEditId(null)
      void fetchList()
    } catch (e) {
      toastError('Hata', e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }, [editId, form, fetchList])

  const fmtDate = useMemo(
    () => (s?: string) => {
      if (!s) return '—'
      try {
        const d = new Date(s)
        if (Number.isNaN(d.getTime())) return s
        return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
      } catch {
        return s
      }
    },
    []
  )

  return (
    <PageLayout
      title="Para birimleri"
      description="IdeaSoft mağaza Store API — döviz listesi ve güncelleme"
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
    >
      <Card className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0 space-y-4 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-primary" />
              Mağaza para birimleri
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Ara (q)…"
                value={search}
                onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                className="h-9 w-48"
              />
              <select
                aria-label="Durum filtresi"
                title="Durum filtresi"
                value={statusFilter}
                onChange={(e) =>
                  setListState({ statusFilter: e.target.value as '' | '0' | '1', page: 1 })
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Tüm durumlar</option>
                <option value="1">Aktif</option>
                <option value="0">Pasif</option>
              </select>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void fetchList()}>
                <RefreshCw className="h-4 w-4" />
                Yenile
              </Button>
            </div>
          </div>
          {listError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{listError}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0 pt-0">
          <div ref={contentRef} className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b bg-muted/95 backdrop-blur">
                <tr className="text-left">
                  <th className="whitespace-nowrap p-2 font-medium">ID</th>
                  <th className="whitespace-nowrap p-2 font-medium">Kısaltma</th>
                  <th className="min-w-[140px] p-2 font-medium">Etiket</th>
                  <th className="whitespace-nowrap p-2 font-medium text-right">Alış</th>
                  <th className="whitespace-nowrap p-2 font-medium text-right">Satış</th>
                  <th className="whitespace-nowrap p-2 font-medium">Güncelleme</th>
                  <th className="whitespace-nowrap p-2 font-medium text-center">Durum</th>
                  <th className="whitespace-nowrap p-2 font-medium text-center">İzin</th>
                  <th className="whitespace-nowrap p-2 font-medium text-center">Birincil</th>
                  <th className="whitespace-nowrap p-2 font-medium text-center">Efektif</th>
                  <th className="whitespace-nowrap p-2 font-medium w-24 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      Kayıt yok veya bağlantı kurulamadı.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{row.id}</td>
                      <td className="p-2 font-mono">{row.abbr}</td>
                      <td className="p-2">{row.label}</td>
                      <td className="p-2 text-right font-mono text-xs">{row.buyingPrice}</td>
                      <td className="p-2 text-right font-mono text-xs">{row.sellingPrice}</td>
                      <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.updatedAt)}</td>
                      <td className="p-2 text-center">
                        <Badge01 v={row.status} activeLabel="Aktif" />
                      </td>
                      <td className="p-2 text-center">
                        <Badge01 v={row.permissionStatus} activeLabel="Açık" />
                      </td>
                      <td className="p-2 text-center">
                        <Badge01 v={row.isPrimary} activeLabel="Evet" />
                      </td>
                      <td className="p-2 text-center">
                        <Badge01 v={row.isEffective} activeLabel="Evet" />
                      </td>
                      <td className="p-2 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => void openEdit(row.id)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Düzenle (PUT)</TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePaginationFooter
            total={total}
            page={page}
            pageSize={pageSize}
            fitLimit={fitLimit}
            onPageChange={(p) => setListState({ page: p })}
            onPageSizeChange={(s) => setListState({ pageSize: s, page: 1 })}
            onFitLimitChange={(v) => setListState({ fitLimit: v })}
            tableContainerRef={contentRef}
            hasFilter={hasFilter}
          />
        </CardContent>
      </Card>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!o && !saving) {
            setEditOpen(false)
            setEditId(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Para birimini düzenle</DialogTitle>
          </DialogHeader>
          {editLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Yükleniyor…</p>
          ) : (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>ID</Label>
                <Input value={String(form.id ?? '')} disabled className="font-mono" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cur-label">Etiket (≤50)</Label>
                <Input
                  id="cur-label"
                  value={form.label ?? ''}
                  maxLength={50}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cur-abbr">Kısaltma (≤5)</Label>
                <Input
                  id="cur-abbr"
                  value={form.abbr ?? ''}
                  maxLength={5}
                  onChange={(e) => setForm((f) => ({ ...f, abbr: e.target.value }))}
                  className="font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Alış fiyatı</Label>
                  <DecimalInput
                    value={form.buyingPrice ?? 0}
                    onChange={(n) => setForm((f) => ({ ...f, buyingPrice: n ?? 0 }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Satış fiyatı</Label>
                  <DecimalInput
                    value={form.sellingPrice ?? 0}
                    onChange={(n) => setForm((f) => ({ ...f, sellingPrice: n ?? 0 }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="cur-status"
                    checked={form.status === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="cur-status" className="cursor-pointer">
                    Kur aktif
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="cur-perm"
                    checked={form.permissionStatus === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, permissionStatus: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="cur-perm" className="cursor-pointer">
                    Kullanım izni
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="cur-primary"
                    checked={form.isPrimary === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isPrimary: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="cur-primary" className="cursor-pointer">
                    Birincil kur
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="cur-eff"
                    checked={form.isEffective === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isEffective: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="cur-eff" className="cursor-pointer">
                    Efektif kur
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="cur-extra"
                    checked={form.isExtra === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isExtra: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="cur-extra" className="cursor-pointer">
                    Ekstra
                  </Label>
                </div>
              </div>
              {form.updatedAt && (
                <p className="text-xs text-muted-foreground">Son güncelleme (sunucu): {form.updatedAt}</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditOpen(false)}>
              İptal
            </Button>
            <Button type="button" disabled={saving || editLoading} onClick={() => void saveEdit()}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
