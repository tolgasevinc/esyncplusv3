import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Tag, RefreshCw, Pencil, Plus, Trash2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
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
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toastSuccess, toastError } from '@/lib/toast'
import { usePersistedListState } from '@/hooks/usePersistedListState'

/** Store API Brand — Brand GET / POST / PUT yanıt gövdesi (döküman) */
export interface IdeasoftBrand {
  id?: number
  name: string
  slug?: string
  sortOrder: number
  status: number
  distributorCode?: string
  distributor?: string
  imageFile?: string
  showcaseContent?: string
  displayShowcaseContent: number
  showcaseFooterContent?: string
  displayShowcaseFooterContent: number
  metaKeywords?: string
  metaDescription?: string
  canonicalUrl?: string
  pageTitle?: string
  attachment?: string
  isSearchable?: number
  createdAt?: string
  updatedAt?: string
}

const DEFAULT_STATUS_FILTER = '1' as const

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 20 as PageSizeValue,
  fitLimit: 20,
  statusFilter: DEFAULT_STATUS_FILTER as '' | '0' | '1',
}

function emptyBrand(): IdeasoftBrand {
  return {
    name: '',
    slug: '',
    sortOrder: 1,
    status: 1,
    distributorCode: '',
    distributor: '',
    imageFile: '',
    showcaseContent: '',
    displayShowcaseContent: 0,
    showcaseFooterContent: '',
    displayShowcaseFooterContent: 0,
    metaKeywords: '',
    metaDescription: '',
    canonicalUrl: '',
    pageTitle: '',
    attachment: '',
    isSearchable: 0,
  }
}

function extractBrandsList(json: unknown): { items: IdeasoftBrand[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftBrand[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydraMember = o['hydra:member']
    if (Array.isArray(hydraMember)) {
      const total = typeof o['hydra:totalItems'] === 'number' ? o['hydra:totalItems'] : hydraMember.length
      return { items: hydraMember as IdeasoftBrand[], total }
    }
    if (Array.isArray(o.data)) {
      const total = typeof o.total === 'number' ? o.total : o.data.length
      return { items: o.data as IdeasoftBrand[], total }
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

function buildPayload(form: IdeasoftBrand, idForPut: number | null): Record<string, unknown> {
  const o: Record<string, unknown> = {
    name: (form.name ?? '').slice(0, 255),
    slug: form.slug ? String(form.slug).slice(0, 255) : '',
    sortOrder: Math.min(999, Math.max(1, Number(form.sortOrder) || 1)),
    status: form.status === 1 ? 1 : 0,
    distributorCode: form.distributorCode ? String(form.distributorCode).slice(0, 255) : '',
    distributor: form.distributor ? String(form.distributor).slice(0, 255) : '',
    imageFile: form.imageFile ? String(form.imageFile).slice(0, 255) : '',
    showcaseContent: form.showcaseContent != null ? String(form.showcaseContent).slice(0, 65535) : '',
    displayShowcaseContent: form.displayShowcaseContent === 1 ? 1 : 0,
    showcaseFooterContent: form.showcaseFooterContent != null ? String(form.showcaseFooterContent).slice(0, 65535) : '',
    displayShowcaseFooterContent: form.displayShowcaseFooterContent === 1 ? 1 : 0,
    metaKeywords: form.metaKeywords != null ? String(form.metaKeywords).slice(0, 65535) : '',
    metaDescription: form.metaDescription != null ? String(form.metaDescription).slice(0, 65535) : '',
    canonicalUrl: form.canonicalUrl ? String(form.canonicalUrl).slice(0, 255) : '',
    pageTitle: form.pageTitle ? String(form.pageTitle).slice(0, 255) : '',
    isSearchable: form.isSearchable === 1 ? 1 : 0,
  }
  const att = (form.attachment ?? '').trim()
  if (att) o.attachment = att
  if (idForPut != null) o.id = idForPut
  return o
}

export function IdeasoftBrandsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-brands-v1', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const limit = pageSize === 'fit' ? fitLimit : Number(pageSize) || 20

  const [items, setItems] = useState<IdeasoftBrand[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<IdeasoftBrand>(emptyBrand())

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<IdeasoftBrand | null>(null)
  const [deleting, setDeleting] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0 || statusFilter !== DEFAULT_STATUS_FILTER

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(Math.min(100, Math.max(1, limit))),
        sort: 'sortOrder',
      })
      const name = search.trim()
      if (name) params.set('name', name)
      if (statusFilter === '0' || statusFilter === '1') params.set('status', statusFilter)

      const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        const err = (data as { error?: string }).error || 'Liste alınamadı'
        setListError(err)
        setItems([])
        setTotal(0)
        return
      }
      const { items: rows, total: t } = extractBrandsList(data)
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

  const openCreate = useCallback(() => {
    setEditId(null)
    setForm(emptyBrand())
    setEditOpen(true)
    setEditLoading(false)
  }, [])

  const openEdit = useCallback(async (id: number) => {
    setEditId(id)
    setEditOpen(true)
    setEditLoading(true)
    setForm(emptyBrand())
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands/${id}`)
      const data = await parseJsonResponse<IdeasoftBrand & { error?: string }>(res)
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Kayıt yüklenemedi')
      setForm({
        ...emptyBrand(),
        ...data,
        sortOrder: data.sortOrder ?? 1,
        status: data.status === 0 ? 0 : 1,
        displayShowcaseContent: data.displayShowcaseContent === 1 ? 1 : 0,
        displayShowcaseFooterContent: data.displayShowcaseFooterContent === 1 ? 1 : 0,
        isSearchable: data.isSearchable === 1 ? 1 : 0,
      })
    } catch (e) {
      toastError('Hata', e instanceof Error ? e.message : 'Yüklenemedi')
      setEditOpen(false)
      setEditId(null)
    } finally {
      setEditLoading(false)
    }
  }, [])

  const saveEdit = useCallback(async () => {
    const name = (form.name ?? '').trim()
    if (!name) {
      toastError('Eksik bilgi', 'Marka adı (name) zorunludur.')
      return
    }
    setSaving(true)
    try {
      if (editId == null) {
        const payload = buildPayload(form, null)
        const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await parseJsonResponse<{ error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Oluşturulamadı')
        toastSuccess('Oluşturuldu', 'Marka eklendi.')
      } else {
        const payload = buildPayload(form, editId)
        const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await parseJsonResponse<{ error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Güncellenemedi')
        toastSuccess('Güncellendi', 'Marka kaydedildi.')
      }
      setEditOpen(false)
      setEditId(null)
      void fetchList()
    } catch (e) {
      toastError('Hata', e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }, [editId, form, fetchList])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (res.status === 204) {
        toastSuccess('Silindi', 'Marka silindi.')
        setDeleteOpen(false)
        setDeleteTarget(null)
        void fetchList()
        return
      }
      const data = await parseJsonResponse<{ error?: string }>(res).catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      toastSuccess('Silindi', 'Marka silindi.')
      setDeleteOpen(false)
      setDeleteTarget(null)
      void fetchList()
    } catch (e) {
      toastError('Hata', e instanceof Error ? e.message : 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, fetchList])

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
      title="Markalar"
      description="IdeaSoft mağaza Store API — Brand LIST / GET / POST / PUT / DELETE"
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
    >
      <Card className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0 space-y-4 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-primary" />
              Mağaza markaları
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Marka adı (name)…"
                value={search}
                onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                className="h-9 w-48"
              />
              <select
                aria-label="Durum filtresi"
                title="Durum filtresi (status)"
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
              <Button type="button" variant="default" size="sm" className="gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Yeni (POST)
              </Button>
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
                  <th className="min-w-[120px] p-2 font-medium">Ad (name)</th>
                  <th className="whitespace-nowrap p-2 font-medium">Slug</th>
                  <th className="whitespace-nowrap p-2 font-medium text-center">Sıra</th>
                  <th className="whitespace-nowrap p-2 font-medium text-center">Durum</th>
                  <th className="whitespace-nowrap p-2 font-medium">Ted. kodu</th>
                  <th className="min-w-[100px] p-2 font-medium">Tedarikçi</th>
                  <th className="whitespace-nowrap p-2 font-medium">Görsel dosya</th>
                  <th className="whitespace-nowrap p-2 font-medium">Güncelleme</th>
                  <th className="whitespace-nowrap p-2 font-medium w-28 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      Kayıt yok veya bağlantı kurulamadı.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id ?? row.name} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{row.id ?? '—'}</td>
                      <td className="p-2">{row.name}</td>
                      <td className="p-2 text-muted-foreground">{row.slug ?? '—'}</td>
                      <td className="p-2 text-center font-mono text-xs">{row.sortOrder ?? '—'}</td>
                      <td className="p-2 text-center">
                        <Badge01 v={row.status === 1 ? 1 : 0} activeLabel="Aktif" />
                      </td>
                      <td className="p-2 font-mono text-xs">{row.distributorCode ?? '—'}</td>
                      <td className="p-2 max-w-[140px] truncate" title={row.distributor}>
                        {row.distributor ?? '—'}
                      </td>
                      <td className="p-2 text-xs max-w-[100px] truncate" title={row.imageFile}>
                        {row.imageFile ?? '—'}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.updatedAt)}</td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={row.id == null}
                                onClick={() => row.id != null && void openEdit(row.id)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Düzenle (PUT)</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                disabled={row.id == null}
                                onClick={() => {
                                  if (row.id == null) return
                                  setDeleteTarget(row)
                                  setDeleteOpen(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Sil (DELETE)</TooltipContent>
                          </Tooltip>
                        </div>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId == null ? 'Yeni marka (POST)' : 'Markayı düzenle (PUT)'}</DialogTitle>
          </DialogHeader>
          {editLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Yükleniyor…</p>
          ) : (
            <div className="grid gap-4 py-2">
              {editId != null && (
                <div className="grid gap-2">
                  <Label>id</Label>
                  <Input value={String(editId)} disabled className="font-mono" />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="br-name">name * (≤255)</Label>
                <Input
                  id="br-name"
                  value={form.name}
                  maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-slug">slug (≤255)</Label>
                <Input
                  id="br-slug"
                  value={form.slug ?? ''}
                  maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="br-sort">sortOrder * (1–999)</Label>
                  <Input
                    id="br-sort"
                    type="number"
                    min={1}
                    max={999}
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 1 }))}
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Switch
                    id="br-status"
                    checked={form.status === 1}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="br-status" className="cursor-pointer">
                    status (aktif)
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="br-dc">distributorCode (≤255)</Label>
                  <Input
                    id="br-dc"
                    value={form.distributorCode ?? ''}
                    maxLength={255}
                    onChange={(e) => setForm((f) => ({ ...f, distributorCode: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="br-dist">distributor (≤255)</Label>
                  <Input
                    id="br-dist"
                    value={form.distributor ?? ''}
                    maxLength={255}
                    onChange={(e) => setForm((f) => ({ ...f, distributor: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-img">imageFile (≤255)</Label>
                <Input
                  id="br-img"
                  value={form.imageFile ?? ''}
                  maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, imageFile: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-sc">showcaseContent (≤65535)</Label>
                <Textarea
                  id="br-sc"
                  value={form.showcaseContent ?? ''}
                  maxLength={65535}
                  rows={3}
                  onChange={(e) => setForm((f) => ({ ...f, showcaseContent: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="br-dsc"
                  checked={form.displayShowcaseContent === 1}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, displayShowcaseContent: v ? 1 : 0 }))}
                />
                <Label htmlFor="br-dsc" className="cursor-pointer">
                  displayShowcaseContent *
                </Label>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-sfc">showcaseFooterContent (≤65535)</Label>
                <Textarea
                  id="br-sfc"
                  value={form.showcaseFooterContent ?? ''}
                  maxLength={65535}
                  rows={3}
                  onChange={(e) => setForm((f) => ({ ...f, showcaseFooterContent: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="br-dsfc"
                  checked={form.displayShowcaseFooterContent === 1}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, displayShowcaseFooterContent: v ? 1 : 0 }))}
                />
                <Label htmlFor="br-dsfc" className="cursor-pointer">
                  displayShowcaseFooterContent *
                </Label>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-mk">metaKeywords (≤65535)</Label>
                <Textarea
                  id="br-mk"
                  value={form.metaKeywords ?? ''}
                  maxLength={65535}
                  rows={2}
                  onChange={(e) => setForm((f) => ({ ...f, metaKeywords: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-md">metaDescription (≤65535)</Label>
                <Textarea
                  id="br-md"
                  value={form.metaDescription ?? ''}
                  maxLength={65535}
                  rows={2}
                  onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-can">canonicalUrl (≤255, ^[a-z0-9-/]+$)</Label>
                <Input
                  id="br-can"
                  value={form.canonicalUrl ?? ''}
                  maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, canonicalUrl: e.target.value }))}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-pt">pageTitle (≤255)</Label>
                <Input
                  id="br-pt"
                  value={form.pageTitle ?? ''}
                  maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, pageTitle: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-att">attachment (data:image/…;base64,)</Label>
                <Textarea
                  id="br-att"
                  value={form.attachment ?? ''}
                  rows={2}
                  placeholder="data:image/jpeg;base64,..."
                  className="font-mono text-xs"
                  onChange={(e) => setForm((f) => ({ ...f, attachment: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="br-search"
                  checked={form.isSearchable === 1}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isSearchable: v ? 1 : 0 }))}
                />
                <Label htmlFor="br-search" className="cursor-pointer">
                  isSearchable
                </Label>
              </div>
              {(form.createdAt || form.updatedAt) && (
                <p className="text-xs text-muted-foreground border-t pt-2">
                  {form.createdAt && <span>createdAt: {form.createdAt} </span>}
                  {form.updatedAt && <span>updatedAt: {form.updatedAt}</span>}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditOpen(false)}>
              İptal
            </Button>
            <Button type="button" disabled={saving || editLoading} onClick={() => void saveEdit()}>
              {saving ? 'Kaydediliyor…' : editId == null ? 'Oluştur' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
          setDeleteOpen(o)
        }}
        title="Markayı sil (DELETE)"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" (id: ${deleteTarget.id}) kalıcı olarak silinecek. Store API 204 dönebilir.`
            : ''
        }
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </PageLayout>
  )
}
