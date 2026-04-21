import { useCallback, useEffect, useRef, useState } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { IdeasoftBrandListRow } from '@/pages/ideasoft/IdeasoftBrandsPage'
import { normalizeIdeasoftAdminBrandImageUrl } from '@/pages/ideasoft/IdeasoftBrandsPage'

function extractBrandsList(json: unknown): { items: IdeasoftBrandListRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftBrandListRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftBrandListRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftBrandListRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
  }
  return { items: [], total: 0 }
}

interface IdeasoftAdminBrandLite {
  id: number
  imageUrl?: string
}

function parseIdeasoftAdminBrandLite(x: unknown): IdeasoftAdminBrandLite | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const id = Number(o.id)
  if (!Number.isFinite(id)) return null
  const imageUrl = typeof o.imageUrl === 'string' ? o.imageUrl : undefined
  return { id, imageUrl }
}

function extractIdeasoftAdminBrandListMembers(json: unknown): IdeasoftAdminBrandLite[] {
  if (Array.isArray(json)) {
    return json.map(parseIdeasoftAdminBrandLite).filter((x): x is IdeasoftAdminBrandLite => x != null)
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      return hydra.map(parseIdeasoftAdminBrandLite).filter((x): x is IdeasoftAdminBrandLite => x != null)
    }
    if (Array.isArray(o.data)) {
      return o.data.map(parseIdeasoftAdminBrandLite).filter((x): x is IdeasoftAdminBrandLite => x != null)
    }
  }
  return []
}

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
  statusFilter: 'active' as 'all' | 'active' | 'inactive',
}

function BrandLogoCell({ imageUrlRaw, name }: { imageUrlRaw?: string; name?: string }) {
  const src = normalizeIdeasoftAdminBrandImageUrl(imageUrlRaw ?? null)
  const initial = (name || '?').trim().slice(0, 1).toUpperCase() || '?'
  return (
    <div className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-medium">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initial
      )}
    </div>
  )
}

export function Ideasoft2BrandsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft2-brands-v1', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const [items, setItems] = useState<IdeasoftBrandListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [adminBrandImageUrlById, setAdminBrandImageUrlById] = useState<Record<number, string>>({})
  const adminLogoFetchGen = useRef(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const hasFilter = search.length > 0 || statusFilter !== 'active'

  const loadAdminBrandImageUrls = useCallback(async () => {
    const gen = ++adminLogoFetchGen.current
    const map: Record<number, string> = {}
    try {
      let p = 1
      const lim = 100
      while (p <= 500) {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(lim),
          sort: 'id',
        })
        const res = await fetch(`${API_URL}/api/ideasoft/admin-api/brands?${params}`)
        const data = await parseJsonResponse<unknown>(res)
        if (gen !== adminLogoFetchGen.current) return
        if (!res.ok) break
        const chunk = extractIdeasoftAdminBrandListMembers(data)
        if (chunk.length === 0) break
        for (const m of chunk) {
          const u = m.imageUrl?.trim()
          if (u) map[m.id] = u
        }
        if (chunk.length < lim) break
        p += 1
      }
      if (gen !== adminLogoFetchGen.current) return
      setAdminBrandImageUrlById(map)
    } catch {
      if (gen !== adminLogoFetchGen.current) return
      setAdminBrandImageUrlById({})
    }
  }, [])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: 'id',
      })
      if (search.trim()) params.set('name', search.trim())
      if (statusFilter === 'active') params.set('status', '1')
      else if (statusFilter === 'inactive') params.set('status', '0')
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı'
        )
        setItems([])
        setTotal(0)
        setAdminBrandImageUrlById({})
        return
      }
      const { items: rows, total: t } = extractBrandsList(data)
      setItems(rows)
      setTotal(t)
      void loadAdminBrandImageUrls()
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
      setAdminBrandImageUrlById({})
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter, loadAdminBrandImageUrls])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  return (
    <PageLayout
      title="IdeaSoft 2 › Markalar"
      description="Store API Brand LIST; logo görselleri Admin API brand.imageUrl ile eşlenir (salt okunur)."
      backTo="/ideasoft2"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => void fetchList()}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Marka adı (name)…"
                value={search}
                onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void fetchList()
                }}
                className="h-9 w-56 pl-8 rounded-r-none border-r-0"
              />
            </div>
            <div
              role="group"
              aria-label="Kayıt durumu"
              className="inline-flex h-9 w-[max-content] items-center rounded-r-md border border-input bg-muted/30 p-0.5 shrink-0"
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
                      'h-8 px-2.5 text-xs font-medium transition-colors first:rounded-l-none last:rounded-r-md cursor-pointer inline-flex items-center justify-center',
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
      <Card className="flex flex-1 min-h-0 flex-col overflow-hidden border-border">
        <CardContent className="flex flex-1 min-h-0 flex-col overflow-hidden p-0">
          {listError ? (
            <div className="shrink-0 border-b border-border px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
              {listError}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="w-14 p-2 text-center font-medium">Logo</th>
                  <th className="w-16 p-2 text-left font-medium">ID</th>
                  <th className="p-2 text-left font-medium min-w-[160px]">Ad</th>
                  <th className="p-2 text-left font-medium min-w-[120px]">Slug</th>
                  <th className="w-20 p-2 text-center font-medium">Sıra</th>
                  <th className="w-24 p-2 text-center font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Kayıt yok
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="p-2 align-middle text-center w-14">
                        <BrandLogoCell
                          imageUrlRaw={adminBrandImageUrlById[row.id]}
                          name={row.name}
                        />
                      </td>
                      <td className="p-2 tabular-nums text-muted-foreground">{row.id}</td>
                      <td className="p-2 font-medium">{row.name ?? '—'}</td>
                      <td className="p-2 text-muted-foreground">{row.slug ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{row.sortOrder ?? '—'}</td>
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  )
}
