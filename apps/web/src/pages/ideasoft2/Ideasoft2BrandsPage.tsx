import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Link2, Search, Unlink, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  API_URL,
  extractProductCategoryList,
  formatIdeasoftProxyErrorForUi,
  parseJsonResponse,
} from '@/lib/api'
import { toastSuccess, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { IdeasoftBrandListRow } from '@/pages/ideasoft/IdeasoftBrandsPage'
import { normalizeIdeasoftAdminBrandImageUrl } from '@/pages/ideasoft/IdeasoftBrandsPage'

function parseHydraCollectionTotal(o: Record<string, unknown>, fallbackLen: number): number {
  const raw = o['hydra:totalItems'] ?? o.totalItems ?? o.total ?? o.count
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseInt(raw.trim(), 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return fallbackLen
}

function extractBrandsList(json: unknown): { items: IdeasoftBrandListRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftBrandListRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      return { items: hydra as IdeasoftBrandListRow[], total: parseHydraCollectionTotal(o, hydra.length) }
    }
    const member = o.member
    if (Array.isArray(member)) {
      return { items: member as IdeasoftBrandListRow[], total: parseHydraCollectionTotal(o, member.length) }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftBrandListRow[]
      const total = typeof o.total === 'number' ? o.total : parseHydraCollectionTotal(o, d.length)
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as IdeasoftBrandListRow[]
      const total = typeof o.total === 'number' ? o.total : parseHydraCollectionTotal(o, items.length)
      return { items, total }
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

type MasterBrandRow = {
  id: number
  name: string
  code: string
  sort_order?: number
  ideasoft_brand_id?: number | null
}

type MasterByIdeasoftBrandId = Map<number, { id: number; name: string }>

function buildMasterByIdeasoftBrandId(
  rows: { id: number; name: string; ideasoft_brand_id?: number | null }[]
): MasterByIdeasoftBrandId {
  const m: MasterByIdeasoftBrandId = new Map()
  for (const r of rows) {
    const bid = r.ideasoft_brand_id
    if (bid == null || !Number.isFinite(Number(bid))) continue
    const k = Number(bid)
    if (k <= 0) continue
    if (!m.has(k)) m.set(k, { id: r.id, name: r.name })
  }
  return m
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

function MasterMatchCell({
  row,
  masterByIdeasoftId,
  onLink,
  onUnlink,
  busy,
}: {
  row: IdeasoftBrandListRow
  masterByIdeasoftId: MasterByIdeasoftBrandId
  onLink: (row: IdeasoftBrandListRow) => void
  onUnlink: (row: IdeasoftBrandListRow, masterId: number) => void
  busy?: boolean
}) {
  const m = masterByIdeasoftId.get(row.id)
  if (m) {
    return (
      <div className="flex min-w-0 max-w-full items-center gap-0.5">
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-700 dark:text-emerald-400"
          title={`Master marka #${m.id}: ${m.name}`}
        >
          ✓ {m.name}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => onUnlink(row, m.id)}
              aria-label="Eşleştirmeyi kaldır"
            >
              <Unlink className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Eşleştirmeyi kaldır</TooltipContent>
        </Tooltip>
      </div>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={busy}
          onClick={() => onLink(row)}
          aria-label="Master ile eşleştir"
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Master ile eşleştir</TooltipContent>
    </Tooltip>
  )
}

export function Ideasoft2BrandsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft2-brands-v1', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const [items, setItems] = useState<IdeasoftBrandListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [masterRows, setMasterRows] = useState<MasterBrandRow[]>([])
  const [masterListLoading, setMasterListLoading] = useState(false)
  const [masterListError, setMasterListError] = useState<string | null>(null)
  const [matchDialogRow, setMatchDialogRow] = useState<IdeasoftBrandListRow | null>(null)
  const [matchPickerSearch, setMatchPickerSearch] = useState('')
  const [matchSaving, setMatchSaving] = useState(false)
  const [adminBrandImageUrlById, setAdminBrandImageUrlById] = useState<Record<number, string>>({})
  const adminLogoFetchGen = useRef(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const hasFilter = search.length > 0 || statusFilter !== 'active'

  const loadMasters = useCallback(async () => {
    const toPositiveId = (v: unknown): number | null => {
      if (v == null || v === '') return null
      const n = typeof v === 'number' ? v : parseInt(String(v).trim(), 10)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    setMasterListLoading(true)
    setMasterListError(null)
    try {
      const res = await fetch(`${API_URL}/api/product-brands?limit=9999`)
      const json = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) {
        const msg =
          typeof json === 'object' && json && 'error' in json && typeof json.error === 'string'
            ? json.error
            : `HTTP ${res.status}`
        setMasterListError(msg)
        setMasterRows([])
        return
      }
      const rawList = extractProductCategoryList(json)
      const rows: MasterBrandRow[] = []
      for (const item of rawList) {
        const x = item as Record<string, unknown>
        const id = toPositiveId(x.id)
        if (id == null) continue
        let isbid: number | null = null
        const rawIs = x.ideasoft_brand_id
        if (rawIs != null && rawIs !== '') {
          const n = typeof rawIs === 'number' ? rawIs : parseInt(String(rawIs).trim(), 10)
          if (Number.isFinite(n) && n > 0) isbid = n
        }
        const name = typeof x.name === 'string' ? x.name : String(x.name ?? '')
        rows.push({
          id,
          name,
          code: typeof x.code === 'string' ? x.code : x.code != null ? String(x.code) : '',
          sort_order: typeof x.sort_order === 'number' ? x.sort_order : undefined,
          ideasoft_brand_id: isbid,
        })
      }
      setMasterRows(rows)
    } catch (e) {
      setMasterListError(e instanceof Error ? e.message : 'Master listesi alınamadı')
      setMasterRows([])
    } finally {
      setMasterListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMasters()
  }, [loadMasters])

  useEffect(() => {
    if (matchDialogRow) void loadMasters()
  }, [matchDialogRow, loadMasters])

  const masterByIdeasoftId = useMemo(() => buildMasterByIdeasoftBrandId(masterRows), [masterRows])

  const matchDialogDisabledMasterIds = useMemo(() => {
    if (!matchDialogRow) return new Set<number>() as ReadonlySet<number>
    const rid = matchDialogRow.id
    return new Set(
      masterRows
        .filter((m) => {
          if (m.ideasoft_brand_id == null) return false
          const linked = Number(m.ideasoft_brand_id)
          if (!Number.isFinite(linked) || linked <= 0) return false
          return linked !== rid
        })
        .map((m) => m.id)
    )
  }, [matchDialogRow, masterRows])

  const openMatchDialog = useCallback((row: IdeasoftBrandListRow) => {
    setMatchDialogRow(row)
    setMatchPickerSearch('')
  }, [])

  const closeMatchDialog = useCallback(() => {
    setMatchDialogRow(null)
    setMatchPickerSearch('')
  }, [])

  const saveMatchWithMasterId = useCallback(
    async (masterId: number) => {
      if (!matchDialogRow) return
      setMatchSaving(true)
      try {
        const isId = matchDialogRow.id
        const other = masterRows.find(
          (m) =>
            m.ideasoft_brand_id != null &&
            Number(m.ideasoft_brand_id) === isId &&
            m.id !== masterId
        )
        if (other) {
          const clearRes = await fetch(`${API_URL}/api/product-brands/${other.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ideasoft_brand_id: null }),
          })
          const clearData = await parseJsonResponse<{ error?: string }>(clearRes)
          if (!clearRes.ok) throw new Error(clearData.error || 'Çakışan master temizlenemedi')
        }
        const res = await fetch(`${API_URL}/api/product-brands/${masterId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ideasoft_brand_id: isId }),
        })
        const data = await parseJsonResponse<{ error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
        toastSuccess('Eşleştirildi', 'IdeaSoft marka master kayıtla bağlandı.')
        closeMatchDialog()
        await loadMasters()
      } catch (err) {
        toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
      } finally {
        setMatchSaving(false)
      }
    },
    [matchDialogRow, masterRows, closeMatchDialog, loadMasters]
  )

  const removeMatch = useCallback(
    async (_row: IdeasoftBrandListRow, masterId: number) => {
      setMatchSaving(true)
      try {
        const res = await fetch(`${API_URL}/api/product-brands/${masterId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ideasoft_brand_id: null }),
        })
        const data = await parseJsonResponse<{ error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Kaldırılamadı')
        toastSuccess('Kaldırıldı', 'Master eşleştirmesi silindi.')
        await loadMasters()
      } catch (err) {
        toastError('Hata', err instanceof Error ? err.message : 'Kaldırılamadı')
      } finally {
        setMatchSaving(false)
      }
    },
    [loadMasters]
  )

  const sortedMasterPickerList = useMemo(() => {
    const q = matchPickerSearch.trim().toLowerCase()
    return [...masterRows]
      .filter((m) => {
        if (!q) return true
        return (
          (m.name || '').toLowerCase().includes(q) ||
          (m.code || '').toLowerCase().includes(q) ||
          String(m.id).includes(q)
        )
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
  }, [masterRows, matchPickerSearch])

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
      description="Store API Brand LIST; master eşleşmesi Parametreler › Markalar’da kayıtlı IdeaSoft marka ID’si (ideasoft_brand_id) ile yapılır. Logolar Admin API imageUrl ile eşlenir."
      backTo="/ideasoft2"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => {
        void fetchList()
        void loadMasters()
      }}
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
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="w-14 p-2 text-center font-medium">Logo</th>
                  <th className="w-16 p-2 text-left font-medium">ID</th>
                  <th className="p-2 text-left font-medium min-w-[160px]">Ad</th>
                  <th className="p-2 text-left font-medium min-w-[120px]">Slug</th>
                  <th className="w-20 p-2 text-center font-medium">Sıra</th>
                  <th className="min-w-[120px] max-w-[200px] p-2 text-left text-xs font-medium">Master</th>
                  <th className="w-24 p-2 text-center font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
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
                      <td className="min-w-[120px] max-w-[200px] p-2 align-middle">
                        <MasterMatchCell
                          row={row}
                          masterByIdeasoftId={masterByIdeasoftId}
                          onLink={openMatchDialog}
                          onUnlink={removeMatch}
                          busy={matchSaving}
                        />
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

      <Dialog open={matchDialogRow != null} onOpenChange={(open) => !open && closeMatchDialog()}>
        <DialogContent className="flex max-h-[min(90vh,640px)] w-full max-w-3xl min-h-0 flex-col gap-0 overflow-y-hidden">
          <DialogHeader>
            <DialogTitle>Master ile eşleştir</DialogTitle>
            {matchDialogRow ? (
              <p className="text-sm text-muted-foreground">
                IdeaSoft:{' '}
                <span className="font-medium text-foreground">
                  {matchDialogRow.name?.trim() || `#${matchDialogRow.id}`}
                </span>{' '}
                <span className="tabular-nums">(id {matchDialogRow.id})</span>
              </p>
            ) : null}
          </DialogHeader>
          {matchDialogRow ? (
            <>
              <div className="relative mt-2 shrink-0">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Master marka ara…"
                  value={matchPickerSearch}
                  onChange={(e) => setMatchPickerSearch(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
              <div
                className={cn(
                  'mt-2 h-[min(50vh,420px)] min-h-[220px] w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-md border bg-muted/20',
                  matchSaving && 'pointer-events-none opacity-60'
                )}
              >
                {masterListLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Master markalar yükleniyor…</div>
                ) : masterListError ? (
                  <div className="flex flex-col gap-3 p-4">
                    <p className="text-sm text-destructive">{masterListError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => void loadMasters()}
                    >
                      Yeniden dene
                    </Button>
                  </div>
                ) : masterRows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master marka yok. Önce Parametreler › Markalar üzerinden ekleyin.
                  </div>
                ) : (
                  <div className="p-2 space-y-0.5">
                    {sortedMasterPickerList.map((m) => {
                      const taken = matchDialogDisabledMasterIds.has(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={taken || matchSaving}
                          title={
                            taken
                              ? 'Bu master kayıt başka bir IdeaSoft marka satırında kullanılıyor; seçilemez.'
                              : undefined
                          }
                          onClick={() => void saveMatchWithMasterId(m.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                            taken
                              ? 'cursor-not-allowed bg-muted/50 text-muted-foreground'
                              : 'hover:bg-muted/80'
                          )}
                        >
                          <span className={cn('min-w-0 flex-1 truncate font-medium', taken && 'font-normal')}>
                            {m.name} [{m.code}]
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {taken ? 'kullanımda' : ''} #{m.id}
                          </span>
                        </button>
                      )
                    })}
                    {sortedMasterPickerList.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">Sonuç yok.</div>
                    ) : null}
                  </div>
                )}
              </div>
              <DialogFooter className="mt-4 gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={closeMatchDialog} disabled={matchSaving}>
                  İptal
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
