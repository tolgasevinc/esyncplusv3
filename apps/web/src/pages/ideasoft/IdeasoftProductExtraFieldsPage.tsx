import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { ChevronDown, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { toastSuccess, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type {
  IdeasoftProductListRow,
  IdeasoftProductStatusFilter,
} from '@/pages/ideasoft/IdeasoftProductsPage'

/**
 * ProductExtraField — Admin API PDF: id, product, varKey (≤255), varValue.
 * LIST: GET …/admin-api/product_extra_fields?product=…
 */
export interface IdeasoftProductExtraFieldRow {
  id: number
  varKey?: string
  varValue?: string
  product?: Record<string, unknown>
}

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
  statusFilter: 'active' as IdeasoftProductStatusFilter,
}

function extractProductsList(json: unknown): { items: IdeasoftProductListRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftProductListRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftProductListRow[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as IdeasoftProductListRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftProductListRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as IdeasoftProductListRow[]
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function extractExtraFieldsList(json: unknown): { items: IdeasoftProductExtraFieldRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftProductExtraFieldRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftProductExtraFieldRow[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as IdeasoftProductExtraFieldRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftProductExtraFieldRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as IdeasoftProductExtraFieldRow[]
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function parseCount(json: unknown): number | null {
  if (typeof json === 'number' && Number.isFinite(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.total === 'number') return o.total
    if (typeof o.count === 'number') return o.count
    if (typeof o['hydra:totalItems'] === 'number') return o['hydra:totalItems'] as number
  }
  return null
}

function parseProductCount(json: unknown): number | null {
  return parseCount(json)
}

function productLine(p: IdeasoftProductListRow): string {
  const t = (p.fullName || p.name || '').trim() || `Ürün #${p.id}`
  const sku = (p.sku || '').trim()
  return sku ? `${t} (${sku})` : t
}

type ExtraDialogMode = 'list' | 'create' | 'edit'

const EXTRA_PAGE_SIZE = 50

export function IdeasoftProductExtraFieldsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-product-extra-fields-v1', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const [items, setItems] = useState<IdeasoftProductListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [docOpen, setDocOpen] = useState(false)

  const [extrasOpen, setExtrasOpen] = useState(false)
  const [extrasKey, setExtrasKey] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState<IdeasoftProductListRow | null>(null)
  const [extraMode, setExtraMode] = useState<ExtraDialogMode>('list')
  const [extraPage, setExtraPage] = useState(1)
  const [extraItems, setExtraItems] = useState<IdeasoftProductExtraFieldRow[]>([])
  const [extraTotal, setExtraTotal] = useState(0)
  const [extraLoading, setExtraLoading] = useState(false)
  const [extraError, setExtraError] = useState<string | null>(null)

  const [formVarKey, setFormVarKey] = useState('')
  const [formVarValue, setFormVarValue] = useState('')
  const [editPayload, setEditPayload] = useState<Record<string, unknown> | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const hasFilter = search.length > 0 || statusFilter !== 'active'

  const buildProductParams = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: 'id',
    })
    if (search.trim()) params.set('s', search.trim())
    if (statusFilter === 'active') params.set('status', '1')
    else if (statusFilter === 'inactive') params.set('status', '0')
    return params
  }, [page, limit, search, statusFilter])

  const fetchProductList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = buildProductParams()
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/products?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Ürün listesi alınamadı'
        )
        setItems([])
        setTotal(0)
        return
      }
      let { items: rows, total: t } = extractProductsList(data)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(`${API_URL}/api/ideasoft/admin-api/products/count?${countParams}`)
      if (resCount.ok) {
        try {
          const countData = await parseJsonResponse<unknown>(resCount)
          const c = parseProductCount(countData)
          if (c != null) t = c
        } catch {
          /* */
        }
      }
      setTotal(t)
      setItems(rows)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [buildProductParams])

  useEffect(() => {
    void fetchProductList()
  }, [fetchProductList])

  const fetchExtraFieldsForProduct = useCallback(async (productId: number, ep: number) => {
    setExtraLoading(true)
    setExtraError(null)
    try {
      const params = new URLSearchParams({
        product: String(productId),
        page: String(ep),
        limit: String(EXTRA_PAGE_SIZE),
        sort: 'id',
      })
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setExtraError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) ||
            'Ekstra alanlar alınamadı'
        )
        setExtraItems([])
        setExtraTotal(0)
        return
      }
      let { items: rows, total: t } = extractExtraFieldsList(data)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/count?${countParams}`)
      if (resCount.ok) {
        try {
          const countData = await parseJsonResponse<unknown>(resCount)
          const c = parseCount(countData)
          if (c != null) t = c
        } catch {
          /* */
        }
      }
      setExtraTotal(t)
      setExtraItems(rows)
    } catch (err) {
      setExtraError(err instanceof Error ? err.message : 'Ekstra alanlar alınamadı')
      setExtraItems([])
      setExtraTotal(0)
    } finally {
      setExtraLoading(false)
    }
  }, [])

  const openExtras = useCallback((row: IdeasoftProductListRow) => {
    setSelectedProduct(row)
    setExtraMode('list')
    setExtraPage(1)
    setExtrasKey((k) => k + 1)
    setExtrasOpen(true)
    setEditPayload(null)
    setFormVarKey('')
    setFormVarValue('')
  }, [])

  const closeExtras = useCallback(() => {
    setExtrasOpen(false)
    setSelectedProduct(null)
    setExtraMode('list')
    setEditPayload(null)
  }, [])

  useEffect(() => {
    if (!extrasOpen || !selectedProduct || extraMode !== 'list') return
    void fetchExtraFieldsForProduct(selectedProduct.id, extraPage)
  }, [extrasOpen, extrasKey, selectedProduct?.id, extraPage, extraMode, fetchExtraFieldsForProduct])

  const startCreate = () => {
    setExtraMode('create')
    setFormVarKey('')
    setFormVarValue('')
    setEditPayload(null)
  }

  const openEditField = useCallback(
    async (fieldId: number) => {
      setEditLoading(true)
      setExtraMode('edit')
      setEditPayload(null)
      try {
        const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/${fieldId}`)
        const data = await parseJsonResponse<unknown>(res)
        if (!res.ok) {
          toastError(
            'Detay',
            formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Kayıt alınamadı'
          )
          setExtraMode('list')
          return
        }
        const rec = data as Record<string, unknown>
        setEditPayload(rec)
        setFormVarKey(typeof rec.varKey === 'string' ? rec.varKey : '')
        setFormVarValue(typeof rec.varValue === 'string' ? rec.varValue : '')
      } catch (e) {
        toastError('Detay', e instanceof Error ? e.message : 'Kayıt alınamadı')
        setExtraMode('list')
      } finally {
        setEditLoading(false)
      }
    },
    []
  )

  const submitCreate = async () => {
    if (!selectedProduct) return
    const key = formVarKey.trim()
    if (!key || key.length > 255) {
      toastError('Doğrulama', 'varKey zorunlu, en fazla 255 karakter (PDF).')
      return
    }
    setSaving(true)
    try {
      const pres = await fetch(`${API_URL}/api/ideasoft/admin-api/products/${selectedProduct.id}`)
      const pdata = await parseJsonResponse<unknown>(pres)
      if (!pres.ok) {
        toastError(
          'Ürün',
          formatIdeasoftProxyErrorForUi(pdata as { error?: string; hint?: string }) || 'Ürün GET başarısız'
        )
        return
      }
      if (!pdata || typeof pdata !== 'object') {
        toastError('Ürün', 'Geçersiz ürün yanıtı')
        return
      }
      const body = {
        id: 0,
        product: pdata as Record<string, unknown>,
        varKey: key,
        varValue: formVarValue,
      }
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Oluştur',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'POST başarısız'
        )
        return
      }
      toastSuccess('Ekstra alan oluşturuldu (POST, 201).')
      setExtraMode('list')
      void fetchExtraFieldsForProduct(selectedProduct.id, extraPage)
      void fetchProductList()
    } catch (e) {
      toastError('Oluştur', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setSaving(false)
    }
  }

  const submitEdit = async () => {
    if (!editPayload || typeof editPayload.id !== 'number') return
    const key = formVarKey.trim()
    if (!key || key.length > 255) {
      toastError('Doğrulama', 'varKey zorunlu, en fazla 255 karakter (PDF).')
      return
    }
    const id = editPayload.id
    const body = {
      ...editPayload,
      varKey: key,
      varValue: formVarValue,
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/${id}`, {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Kaydet',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'PUT başarısız'
        )
        return
      }
      toastSuccess('Güncellendi (PUT).')
      setExtraMode('list')
      setEditPayload(null)
      if (selectedProduct) void fetchExtraFieldsForProduct(selectedProduct.id, extraPage)
    } catch (e) {
      toastError('Kaydet', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteField = async () => {
    if (!editPayload || typeof editPayload.id !== 'number') return
    const id = editPayload.id
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res).catch(() => ({}))
        toastError('Sil', formatIdeasoftProxyErrorForUi(data) || `HTTP ${res.status}`)
        return
      }
      toastSuccess('Silindi (DELETE, 204).')
      setDeleteOpen(false)
      setExtraMode('list')
      setEditPayload(null)
      if (selectedProduct) void fetchExtraFieldsForProduct(selectedProduct.id, extraPage)
    } catch (e) {
      toastError('Sil', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setDeleting(false)
    }
  }

  const extraTotalPages = Math.max(1, Math.ceil(extraTotal / EXTRA_PAGE_SIZE))

  return (
    <PageLayout
      title="IdeaSoft — Ekstra özellikler"
      description="Ürün listesi Product LIST (PDF); satıra tıklanınca ProductExtraField LIST product=? ile o ürünün varKey / varValue kayıtları."
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => void fetchProductList()}
      headerActions={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ürün ara (s)…"
                value={search}
                onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                className="pl-8 w-52 h-9 rounded-r-none border-r-0"
              />
            </div>
            <div
              role="group"
              aria-label="Ürün durumu"
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
              <TooltipContent>Filtreyi sıfırla</TooltipContent>
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
      <Collapsible open={docOpen} onOpenChange={setDocOpen} className="shrink-0 border-b border-border pb-3 mb-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 px-2 -ml-2 text-muted-foreground">
            <ChevronDown className={cn('h-4 w-4 transition-transform', docOpen && 'rotate-180')} />
            API özeti (PDF)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2 bg-muted/30">
            <CardContent className="pt-4 text-sm text-muted-foreground space-y-3">
              <p>
                <strong className="text-foreground">Ürün listesi</strong> —{' '}
                <code className="text-xs">GET …/admin-api/products</code> (Product LIST PDF):{' '}
                <code>s</code>, <code>status</code>, <code>page</code>, <code>limit</code>, <code>sort</code>.
              </p>
              <p>
                <strong className="text-foreground">ProductExtraField</strong> — kaynak{' '}
                <code className="text-xs">…/admin-api/product_extra_fields</code>. Kayıt alanları:{' '}
                <code>id</code>, <code>product</code> (nesne), <code>varKey</code> (≤255, zorunlu),{' '}
                <code>varValue</code> (dize).
              </p>
              <p>
                <strong className="text-foreground">LIST</strong> — sorgu: <code>id</code>, <code>ids</code>,{' '}
                <code>product</code> (ürün id), <code>limit</code> (1–100), <code>page</code>, <code>q</code>,{' '}
                <code>sinceId</code>, <code>sort</code>. Yetki: <code>product_read</code>.
              </p>
              <p>
                <strong className="text-foreground">COUNT</strong> — <code>GET …/product_extra_fields/count</code>.
              </p>
              <p>
                <strong className="text-foreground">GET</strong> — <code>GET …/product_extra_fields/{"{id}"}</code>.
              </p>
              <p>
                <strong className="text-foreground">POST</strong> — gövde: <code>id</code> (ör. 0),{' '}
                <code>product</code>, <code>varKey</code>, <code>varValue</code>. Yanıt <code>201</code>. Yetki:{' '}
                <code>product_create</code>.
              </p>
              <p>
                <strong className="text-foreground">PUT</strong> — <code>PUT …/product_extra_fields/{"{id}"}</code>.
                Yetki: <code>product_update</code>.
              </p>
              <p>
                <strong className="text-foreground">DELETE</strong> —{' '}
                <code>DELETE …/product_extra_fields/{"{id}"}</code>, <code>204</code>. Yetki:{' '}
                <code>product_delete</code>.
              </p>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

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
                  <th className="text-left p-2 font-medium w-20">ID</th>
                  <th className="text-left p-2 font-medium min-w-[200px]">Ad</th>
                  <th className="text-left p-2 font-medium w-36">SKU</th>
                  <th className="text-center p-2 font-medium w-24">Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      Ürün yok. Satıra tıklayınca o ürünün ekstra alanları açılır.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const title = (row.fullName || row.name || '—').trim() || '—'
                    return (
                      <tr
                        key={row.id}
                        tabIndex={0}
                        className="border-b border-border/60 hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        onClick={() => openExtras(row)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openExtras(row)
                          }
                        }}
                      >
                        <td className="p-2 tabular-nums">{row.id}</td>
                        <td className="p-2 max-w-md truncate" title={title}>
                          {title}
                        </td>
                        <td className="p-2 font-mono text-xs">{row.sku?.trim() || '—'}</td>
                        <td className="p-2 text-center">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                              row.status === 1
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {row.status === 1 ? 'Aktif' : row.status === 0 ? 'Pasif' : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={extrasOpen}
        onOpenChange={(o) => {
          if (!o) closeExtras()
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="pr-8">
              Ekstra alanlar (product_extra_fields)
              {selectedProduct ? (
                <span className="block text-sm font-normal text-muted-foreground mt-1 truncate">
                  {productLine(selectedProduct)} — ürün #{selectedProduct.id}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {extraMode === 'list' && (
            <>
              {extraError && (
                <div className="text-sm text-destructive whitespace-pre-wrap shrink-0">{extraError}</div>
              )}
              <div className="flex items-center justify-between gap-2 shrink-0">
                <p className="text-xs text-muted-foreground">
                  Toplam {extraTotal} kayıt · sayfa {extraPage}/{extraTotalPages}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={startCreate}>
                  <Plus className="h-4 w-4 mr-1" />
                  Yeni (POST)
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/95 z-[1]">
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium w-20">id</th>
                      <th className="text-left p-2 font-medium">varKey</th>
                      <th className="text-left p-2 font-medium min-w-[200px]">varValue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraLoading ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-muted-foreground">
                          Yükleniyor...
                        </td>
                      </tr>
                    ) : extraItems.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-muted-foreground">
                          Bu ürün için ekstra alan yok. Yeni eklemek için &quot;Yeni (POST)&quot; kullanın.
                        </td>
                      </tr>
                    ) : (
                      extraItems.map((ex) => (
                        <tr
                          key={ex.id}
                          tabIndex={0}
                          className="border-b border-border/60 hover:bg-muted/40 cursor-pointer"
                          onClick={() => void openEditField(ex.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              void openEditField(ex.id)
                            }
                          }}
                        >
                          <td className="p-2 tabular-nums">{ex.id}</td>
                          <td className="p-2 font-mono text-xs break-all">{ex.varKey ?? '—'}</td>
                          <td className="p-2 break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
                            {ex.varValue ?? '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <DialogFooter className="shrink-0 flex-row justify-between gap-2 sm:justify-between">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={extraPage <= 1 || extraLoading}
                    onClick={() => setExtraPage((p) => Math.max(1, p - 1))}
                  >
                    Önceki
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={extraPage >= extraTotalPages || extraLoading}
                    onClick={() => setExtraPage((p) => p + 1)}
                  >
                    Sonraki
                  </Button>
                </div>
                <Button type="button" variant="outline" onClick={closeExtras}>
                  Kapat
                </Button>
              </DialogFooter>
            </>
          )}

          {extraMode === 'create' && (
            <>
              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <Label htmlFor="pef-key">varKey</Label>
                  <Input
                    id="pef-key"
                    value={formVarKey}
                    onChange={(e) => setFormVarKey(e.target.value)}
                    maxLength={255}
                    placeholder="Anahtar (zorunlu)"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pef-val">varValue</Label>
                  <Textarea
                    id="pef-val"
                    value={formVarValue}
                    onChange={(e) => setFormVarValue(e.target.value)}
                    rows={4}
                    className="resize-y min-h-[80px]"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Ürün gövdesi <code>GET …/products/{"{id}"}</code> ile alınır (POST PDF).
                </p>
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setExtraMode('list')}>
                  İptal
                </Button>
                <Button type="button" variant="save" disabled={saving} onClick={() => void submitCreate()}>
                  {saving ? 'Gönderiliyor...' : 'Oluştur'}
                </Button>
              </DialogFooter>
            </>
          )}

          {extraMode === 'edit' && (
            <>
              {editLoading ? (
                <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Kayıt id: {typeof editPayload?.id === 'number' ? editPayload.id : '—'}
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="pef-e-key">varKey</Label>
                    <Input
                      id="pef-e-key"
                      value={formVarKey}
                      onChange={(e) => setFormVarKey(e.target.value)}
                      maxLength={255}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pef-e-val">varValue</Label>
                    <Textarea
                      id="pef-e-val"
                      value={formVarValue}
                      onChange={(e) => setFormVarValue(e.target.value)}
                      rows={4}
                      className="resize-y min-h-[80px]"
                    />
                  </div>
                </div>
              )}
              <DialogFooter className="shrink-0 flex-row justify-between gap-2">
                <Button
                  type="button"
                  variant="delete"
                  size="icon"
                  disabled={editLoading || !editPayload}
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Sil"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setExtraMode('list')}>
                    Listeye dön
                  </Button>
                  <Button
                    type="button"
                    variant="save"
                    disabled={editLoading || !editPayload || saving}
                    onClick={() => void submitEdit()}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Ekstra alanı sil"
        description={`Kayıt #${typeof editPayload?.id === 'number' ? editPayload.id : '—'} silinecek (DELETE …/product_extra_fields/{id}, 204).`}
        onConfirm={() => void handleDeleteField()}
        loading={deleting}
      />
    </PageLayout>
  )
}
