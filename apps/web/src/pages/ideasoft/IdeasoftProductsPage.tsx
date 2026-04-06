import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Link2, Search, X } from 'lucide-react'
import { IdeasoftProductEditModal } from '@/pages/ideasoft/IdeasoftProductEditModal'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * Admin API Product — LIST yanıtındaki üye alanları (Product LIST _ Admin API.pdf, Product GET _ Admin API.pdf).
 */
export interface IdeasoftProductListRow {
  id: number
  name?: string
  fullName?: string
  sku?: string
  barcode?: string
  stockAmount?: number
  price1?: number
  currency?: { id?: number; label?: string; abbr?: string }
  status?: number
}

export type IdeasoftProductStatusFilter = 'all' | 'active' | 'inactive'

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

/** Product COUNT _ Admin API.pdf — yanıtta toplam sayısı */
function parseProductCount(json: unknown): number | null {
  if (typeof json === 'number' && Number.isFinite(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.total === 'number') return o.total
    if (typeof o.count === 'number') return o.count
    if (typeof o['hydra:totalItems'] === 'number') return o['hydra:totalItems'] as number
  }
  return null
}

function formatPrice(row: IdeasoftProductListRow): string {
  const p = row.price1
  if (p == null || !Number.isFinite(Number(p))) return '—'
  const abbr = row.currency?.abbr?.trim()
  const num = Number(p)
  const formatted = Number.isInteger(num) ? String(num) : num.toFixed(2)
  return abbr ? `${formatted} ${abbr}` : formatted
}

/** ideasoft ürün id (string) → master products.id (string) */
function applyIdeasoftProductMapping(
  prev: Record<string, string>,
  ideasoftProductId: string,
  masterProductId: string
): Record<string, string> {
  const next = { ...prev }
  for (const [k, v] of Object.entries(next)) {
    if (v === masterProductId && k !== ideasoftProductId) delete next[k]
  }
  next[ideasoftProductId] = masterProductId
  return next
}

export function IdeasoftProductsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-products-v1', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const [items, setItems] = useState<IdeasoftProductListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editProductId, setEditProductId] = useState<number | null>(null)
  const [productMappings, setProductMappings] = useState<Record<string, string>>({})
  const [masterProductLabelById, setMasterProductLabelById] = useState<Record<number, string>>({})
  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const hasFilter = search.length > 0 || statusFilter !== 'active'

  const buildListParams = useCallback(() => {
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

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = buildListParams()
      const [res, resMap] = await Promise.all([
        fetch(`${API_URL}/api/ideasoft/admin-api/products?${params}`),
        fetch(`${API_URL}/api/ideasoft/product-mappings`),
      ])
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı'
        )
        setItems([])
        setTotal(0)
        return
      }

      let mappings: Record<string, string> = {}
      try {
        const mapData = await parseJsonResponse<{ mappings?: Record<string, string> }>(resMap)
        if (resMap.ok && mapData.mappings && typeof mapData.mappings === 'object') mappings = mapData.mappings
      } catch {
        /* sunucu eşlemesi okunamazsa boştan devam */
      }

      let { items: rows, total: t } = extractProductsList(data)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(`${API_URL}/api/ideasoft/admin-api/products/count?${countParams}`)
      let countData: unknown = null
      if (resCount.ok) {
        try {
          countData = await parseJsonResponse<unknown>(resCount)
        } catch {
          countData = null
        }
      }
      if (countData != null) {
        const c = parseProductCount(countData)
        if (c != null) t = c
      }
      setTotal(t)

      const baseMappings = { ...mappings }
      let next = { ...mappings }
      let added = 0
      for (const row of rows) {
        const sku = (row.sku || '').trim()
        if (!sku) continue
        const isKey = String(row.id)
        if (next[isKey]) continue
        const resSku = await fetch(`${API_URL}/api/products/by-sku?sku=${encodeURIComponent(sku)}`)
        const skuData = await parseJsonResponse<unknown>(resSku)
        if (
          !resSku.ok ||
          skuData == null ||
          typeof skuData !== 'object' ||
          !('id' in skuData) ||
          typeof (skuData as { id: unknown }).id !== 'number' ||
          !Number.isFinite((skuData as { id: number }).id)
        ) {
          continue
        }
        const masterId = String((skuData as { id: number }).id)
        next = applyIdeasoftProductMapping(next, isKey, masterId)
        added += 1
      }

      if (added > 0) {
        const putRes = await fetch(`${API_URL}/api/ideasoft/product-mappings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: next }),
        })
        const putData = await parseJsonResponse<{ mappings?: Record<string, string>; error?: string }>(putRes)
        if (!putRes.ok) {
          toastError('Eşleştirme kaydı', putData.error || 'SKU eşleşmeleri kaydedilemedi')
          setProductMappings(baseMappings)
        } else {
          setProductMappings(putData.mappings ?? next)
        }
      } else {
        setProductMappings(baseMappings)
      }

      setItems(rows)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [buildListParams])

  const refreshListAndMappings = useCallback(() => {
    void fetchList()
  }, [fetchList])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  useEffect(() => {
    const ids = new Set<number>()
    for (const row of items) {
      const mid = productMappings[String(row.id)]
      if (!mid) continue
      const id = parseInt(mid, 10)
      if (Number.isFinite(id) && id > 0) ids.add(id)
    }
    if (ids.size === 0) return
    let cancelled = false
    void (async () => {
      const pairs = await Promise.all(
        [...ids].map(async (id) => {
          try {
            const res = await fetch(`${API_URL}/api/products/${id}`)
            const data = await parseJsonResponse<Record<string, unknown>>(res)
            const name =
              res.ok && typeof data.name === 'string' && data.name.trim()
                ? data.name.trim()
                : `Ürün #${id}`
            return [id, name] as const
          } catch {
            return [id, `Ürün #${id}`] as const
          }
        })
      )
      if (cancelled) return
      setMasterProductLabelById((prev) => {
        const next = { ...prev }
        let changed = false
        for (const [id, name] of pairs) {
          if (!(id in next) || next[id] !== name) {
            next[id] = name
            changed = true
          }
        }
        return changed ? next : prev
      })
    })()
    return () => {
      cancelled = true
    }
  }, [items, productMappings])

  return (
    <PageLayout
      title="IdeaSoft — Ürünler"
      description="Liste yüklenirken master stokta aynı SKU varsa satır otomatik eşlenir ve kaydedilir."
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={refreshListAndMappings}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ara (s)..."
                  value={search}
                  onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                  className="pl-8 w-56 h-9 rounded-r-none border-r-0"
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
                  <th className="text-left p-2 font-medium w-16">ID</th>
                  <th className="text-left p-2 font-medium">SKU</th>
                  <th className="text-left p-2 font-medium min-w-[200px]">Ad</th>
                  <th className="text-right p-2 font-medium w-32">Fiyat (price1)</th>
                  <th className="text-right p-2 font-medium w-24">Stok</th>
                  <th className="text-center p-2 font-medium w-24">Durum</th>
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
                  items.map((row) => {
                    const title = (row.fullName || row.name || '—').trim() || '—'
                    const masterIdStr = productMappings[String(row.id)]
                    const masterId = masterIdStr ? parseInt(masterIdStr, 10) : NaN
                    const matched = Boolean(masterIdStr && Number.isFinite(masterId) && masterId > 0)
                    const masterLabel =
                      matched && Number.isFinite(masterId)
                        ? masterProductLabelById[masterId] ?? `Ürün #${masterId}`
                        : ''
                    return (
                      <tr
                        key={row.id}
                        tabIndex={0}
                        className={cn(
                          'border-b border-border/60 hover:bg-muted/40 cursor-pointer',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                          matched &&
                            'bg-emerald-500/[0.06] dark:bg-emerald-500/10 border-l-2 border-l-emerald-500'
                        )}
                        onClick={() => {
                          setEditProductId(row.id)
                          setEditOpen(true)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setEditProductId(row.id)
                            setEditOpen(true)
                          }
                        }}
                      >
                        <td className="p-2 tabular-nums">{row.id}</td>
                        <td className="p-2 font-mono text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {matched ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex shrink-0 text-emerald-600 dark:text-emerald-400"
                                    aria-label="Master ürünle eşleşti"
                                  >
                                    <Link2 className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  Master: {masterLabel}
                                  {Number.isFinite(masterId) ? ` (#${masterId})` : ''}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            <span className="truncate">{row.sku?.trim() || '—'}</span>
                          </div>
                        </td>
                        <td className="p-2 max-w-md truncate" title={title}>
                          {title}
                        </td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{formatPrice(row)}</td>
                        <td className="p-2 text-right tabular-nums">
                          {row.stockAmount != null && Number.isFinite(Number(row.stockAmount))
                            ? row.stockAmount
                            : '—'}
                        </td>
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

      <IdeasoftProductEditModal
        open={editOpen}
        productId={editProductId}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) setEditProductId(null)
        }}
        onSaved={refreshListAndMappings}
      />
    </PageLayout>
  )
}
