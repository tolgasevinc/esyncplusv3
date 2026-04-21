import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link2, RefreshCw, RotateCcw, Search, Unlink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { IdeasoftCategoryRow } from '@/pages/ideasoft/IdeasoftCategoriesPage'
import type { CategoryItem } from '@/components/CategorySelect'
import { MasterCategoryTreePicker } from '@/components/MasterCategoryTreePicker'
import { toastSuccess, toastError } from '@/lib/toast'

/** LIST yanıtı — IdeasoftCategoriesPage ile aynı şema */
function extractCategoriesList(json: unknown): { items: IdeasoftCategoryRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftCategoryRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftCategoryRow[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as IdeasoftCategoryRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftCategoryRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    const items = o.items
    if (Array.isArray(items)) {
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items: items as IdeasoftCategoryRow[], total }
    }
    const categories = o.categories
    if (Array.isArray(categories)) {
      const total = typeof o.total === 'number' ? o.total : categories.length
      return { items: categories as IdeasoftCategoryRow[], total }
    }
  }
  return { items: [], total: 0 }
}

function parentIdFromCategoryListRow(row: Record<string, unknown>): number | null {
  const p = row.parent
  if (p == null) return null
  if (typeof p === 'object' && p !== null && !Array.isArray(p) && 'id' in p) {
    const id = Number((p as { id: unknown }).id)
    return Number.isFinite(id) ? id : null
  }
  return null
}

/** `parent` gönderilmeden gelen listede yalnızca kök satırlar (IdeasoftCategoriesPage ile aynı). */
function filterToRootLevelCategories(items: IdeasoftCategoryRow[]): IdeasoftCategoryRow[] {
  const raw = items as unknown as Record<string, unknown>[]
  const anyChildRow = raw.some((r) => {
    const pid = parentIdFromCategoryListRow(r)
    return pid != null && pid > 0
  })
  if (!anyChildRow) return items
  return items.filter((_, i) => {
    const pid = parentIdFromCategoryListRow(raw[i]!)
    return pid == null || pid === 0
  })
}

/**
 * IdeaSoft Admin API: kök için `parent` gönderilmez; üst kategori için `parent` eklenir.
 */
function appendCategoryParentParam(params: URLSearchParams, parentId: number) {
  if (parentId > 0) params.set('parent', String(parentId))
}

async function fetchCategoryOptions(parentId: number): Promise<{ id: number; name: string }[]> {
  const params = new URLSearchParams({
    limit: '100',
    page: '1',
    sort: 'id',
  })
  appendCategoryParentParam(params, parentId)
  const res = await fetch(`${API_URL}/api/ideasoft/admin-api/categories?${params}`)
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) return []
  let { items } = extractCategoriesList(data)
  if (parentId === 0) items = filterToRootLevelCategories(items)
  return items.map((x) => ({ id: x.id, name: x.name ?? `#${x.id}` }))
}

const CASCADE_MAX_DEPTH = 3

function CategoryCascadeThreeSelects({
  path,
  onPathChange,
  disabled,
}: {
  path: number[]
  onPathChange: (next: number[]) => void
  disabled?: boolean
}) {
  const onPathChangeRef = useRef(onPathChange)
  onPathChangeRef.current = onPathChange
  const pathRef = useRef(path)
  pathRef.current = path

  const [opt1, setOpt1] = useState<{ id: number; name: string }[]>([])
  const [opt2, setOpt2] = useState<{ id: number; name: string }[]>([])
  const [opt3, setOpt3] = useState<{ id: number; name: string }[]>([])

  const idL1 = path[0]
  const idL2 = path[1]

  useEffect(() => {
    let cancel = false
    void (async () => {
      const o = await fetchCategoryOptions(0)
      if (!cancel) setOpt1(o)
    })()
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    let cancel = false
    if (idL1 == null) {
      setOpt2([])
      return
    }
    void (async () => {
      const o = await fetchCategoryOptions(idL1)
      if (cancel) return
      setOpt2(o)
      const p = pathRef.current
      if (p[1] != null && !o.some((x) => x.id === p[1])) {
        onPathChangeRef.current(p.slice(0, 1))
      }
    })()
    return () => {
      cancel = true
    }
  }, [idL1])

  useEffect(() => {
    let cancel = false
    if (idL2 == null) {
      setOpt3([])
      return
    }
    void (async () => {
      const o = await fetchCategoryOptions(idL2)
      if (cancel) return
      setOpt3(o)
      const p = pathRef.current
      if (p[2] != null && !o.some((x) => x.id === p[2])) {
        onPathChangeRef.current(p.slice(0, 2))
      }
    })()
    return () => {
      cancel = true
    }
  }, [idL2])

  const setLevel = (levelIndex: number, raw: string) => {
    if (raw === '') {
      onPathChange(path.slice(0, levelIndex))
      return
    }
    const id = parseInt(raw, 10)
    if (!Number.isFinite(id)) return
    const next = [...path.slice(0, levelIndex), id].slice(0, CASCADE_MAX_DEPTH)
    onPathChange(next)
  }

  const v1 = path[0] != null ? String(path[0]) : ''
  const v2 = path[1] != null ? String(path[1]) : ''
  const v3 = path[2] != null ? String(path[2]) : ''

  /** Sabit genişlik — seçenek metni uzunluğu satırı oynatmasın; taşan satır yatay kayar */
  const selClass =
    'h-9 w-[10.5rem] max-w-[10.5rem] shrink-0 rounded-md border border-input bg-background px-2 text-sm truncate'

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-visible pb-0.5 [scrollbar-gutter:stable]">
      <select
        id="ideasoft2-cat-cascade-l1"
        aria-label="1. seviye kategori"
        className={cn(selClass, disabled && 'pointer-events-none opacity-50')}
        value={v1}
        disabled={disabled}
        onChange={(e) => setLevel(0, e.target.value)}
      >
        <option value="">— Kategori —</option>
        {opt1.map((o) => (
          <option key={o.id} value={String(o.id)}>
            {o.name}
          </option>
        ))}
      </select>
      <select
        id="ideasoft2-cat-cascade-l2"
        aria-label="2. seviye kategori"
        className={cn(
          selClass,
          (disabled || idL1 == null) && 'pointer-events-none cursor-not-allowed opacity-50'
        )}
        value={v2}
        disabled={disabled || idL1 == null}
        onChange={(e) => setLevel(1, e.target.value)}
      >
        <option value="">— 2. seviye —</option>
        {opt2.map((o) => (
          <option key={o.id} value={String(o.id)}>
            {o.name}
          </option>
        ))}
      </select>
      <select
        id="ideasoft2-cat-cascade-l3"
        aria-label="3. seviye kategori"
        className={cn(
          selClass,
          (disabled || idL2 == null) && 'pointer-events-none cursor-not-allowed opacity-50'
        )}
        value={v3}
        disabled={disabled || idL2 == null}
        onChange={(e) => setLevel(2, e.target.value)}
      >
        <option value="">— 3. seviye —</option>
        {opt3.map((o) => (
          <option key={o.id} value={String(o.id)}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  )
}

type CatNode = { row: IdeasoftCategoryRow; children: CatNode[] }

function buildCategoryTree(rows: IdeasoftCategoryRow[]): CatNode[] {
  const rawRows = rows as unknown as Record<string, unknown>[]
  const byId = new Map(rows.map((r) => [r.id, r]))
  const childMap = new Map<number, IdeasoftCategoryRow[]>()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    let parentKey = parentIdFromCategoryListRow(rawRows[i]!)
    parentKey = parentKey != null && parentKey > 0 ? parentKey : 0
    if (parentKey > 0 && !byId.has(parentKey)) parentKey = 0
    const arr = childMap.get(parentKey) ?? []
    arr.push(r)
    childMap.set(parentKey, arr)
  }
  const sortFn = (a: IdeasoftCategoryRow, b: IdeasoftCategoryRow) => {
    const ao = a.sortOrder ?? 0
    const bo = b.sortOrder ?? 0
    if (ao !== bo) return ao - bo
    return a.id - b.id
  }
  for (const arr of childMap.values()) arr.sort(sortFn)
  function toNodes(parentId: number): CatNode[] {
    const kids = childMap.get(parentId) ?? []
    return kids.map((row) => ({
      row,
      children: toNodes(row.id),
    }))
  }
  return toNodes(0)
}

function findCatNodeById(nodes: CatNode[], id: number): CatNode | null {
  for (const n of nodes) {
    if (n.row.id === id) return n
    const c = findCatNodeById(n.children, id)
    if (c) return c
  }
  return null
}

/** Cascade seçiliyse ağaçta o düğümü kök olarak göster (alt ağaç). */
function subtreeForCascade(tree: CatNode[], path: number[]): CatNode[] {
  if (path.length === 0) return tree
  const id = path[path.length - 1]!
  const n = findCatNodeById(tree, id)
  if (!n) return []
  return [n]
}

function pruneTree(nodes: CatNode[], q: string): CatNode[] {
  const t = q.trim().toLowerCase()
  if (!t) return nodes
  const out: CatNode[] = []
  for (const n of nodes) {
    const pruned = pruneTree(n.children, q)
    const self = (n.row.name || '').toLowerCase().includes(t)
    if (self) {
      out.push({ row: n.row, children: n.children })
    } else if (pruned.length > 0) {
      out.push({ row: n.row, children: pruned })
    }
  }
  return out
}

const listDefaults = {
  search: '',
  cascadePath: [] as number[],
}

async function fetchAllCategoriesFlat(): Promise<IdeasoftCategoryRow[]> {
  const all: IdeasoftCategoryRow[] = []
  const seen = new Set<number>()
  let page = 1
  const limit = 100
  for (;;) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: 'id',
    })
    const res = await fetch(`${API_URL}/api/ideasoft/admin-api/categories?${params}`)
    const data = await parseJsonResponse<unknown>(res)
    if (!res.ok) {
      throw new Error(formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı')
    }
    const { items } = extractCategoriesList(data)
    for (const row of items) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      all.push(row)
    }
    if (items.length < limit) break
    page += 1
    if (page > 500) break
  }
  return all
}

/** 12px + depth×20px — Category LIST hiyerarşi girintisi */
const TREE_INDENT_BY_DEPTH = [
  'pl-[12px]',
  'pl-[32px]',
  'pl-[52px]',
  'pl-[72px]',
  'pl-[92px]',
  'pl-[112px]',
  'pl-[132px]',
  'pl-[152px]',
  'pl-[172px]',
  'pl-[192px]',
  'pl-[212px]',
  'pl-[232px]',
  'pl-[252px]',
  'pl-[272px]',
  'pl-[292px]',
  'pl-[312px]',
] as const

function categoryNameCellClass(depth: number): string {
  const i = Math.min(Math.max(depth, 0), TREE_INDENT_BY_DEPTH.length - 1)
  return cn('py-2.5 pr-2 align-middle', TREE_INDENT_BY_DEPTH[i])
}

type MasterByIdeasoftId = Map<number, { id: number; name: string }>

type MasterProductCategoryRow = CategoryItem & {
  ideasoft_category_id?: number | null
  ideasoft_category_code?: string | null
}

/** Master satırındaki `ideasoft_category_id` = IdeaSoft kategori tablosundaki `id` */
function buildMasterByIdeasoftId(
  rows: { id: number; name: string; ideasoft_category_id?: number | null }[]
): MasterByIdeasoftId {
  const m: MasterByIdeasoftId = new Map()
  for (const r of rows) {
    const isid = r.ideasoft_category_id
    if (isid == null || !Number.isFinite(Number(isid))) continue
    const k = Number(isid)
    if (k <= 0) continue
    if (!m.has(k)) m.set(k, { id: r.id, name: r.name })
  }
  return m
}

function IdeasoftDistributorCell({ row }: { row: IdeasoftCategoryRow }) {
  const d = (row.distributor || '').trim()
  if (!d) return <span className="text-muted-foreground">—</span>
  return (
    <span className="font-mono text-xs text-foreground" title="Admin API Category.distributor">
      {d}
    </span>
  )
}

function MasterMatchCell({
  row,
  masterByIdeasoftId,
  onLink,
  onUnlink,
  busy,
}: {
  row: IdeasoftCategoryRow
  masterByIdeasoftId: MasterByIdeasoftId
  onLink: (row: IdeasoftCategoryRow) => void
  onUnlink: (row: IdeasoftCategoryRow, masterId: number) => void
  busy?: boolean
}) {
  const m = masterByIdeasoftId.get(row.id)
  if (m) {
    return (
      <div className="flex min-w-0 max-w-full items-center gap-0.5">
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-700 dark:text-emerald-400"
          title={`Master kategori #${m.id}: ${m.name}`}
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

function CategoryTreeTable({
  nodes,
  depth,
  masterByIdeasoftId,
  onLink,
  onUnlink,
  busy,
}: {
  nodes: CatNode[]
  depth: number
  masterByIdeasoftId: MasterByIdeasoftId
  onLink: (row: IdeasoftCategoryRow) => void
  onUnlink: (row: IdeasoftCategoryRow, masterId: number) => void
  busy?: boolean
}) {
  return (
    <>
      {nodes.map((n) => (
        <Fragment key={n.row.id}>
          <tr className="border-b border-border/60 hover:bg-muted/40">
            <td className={categoryNameCellClass(depth)}>
              <span className="min-w-0 truncate font-medium text-foreground">
                {n.row.name?.trim() || `— (#${n.row.id})`}
              </span>
            </td>
            <td className="w-20 py-2.5 pr-2 text-right tabular-nums text-muted-foreground align-middle">
              {n.row.id}
            </td>
            <td className="hidden sm:table-cell max-w-[200px] py-2.5 pr-3 text-muted-foreground truncate align-middle">
              {n.row.slug ?? '—'}
            </td>
            <td className="w-24 py-2.5 pr-3 text-center align-middle">
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                  n.row.status === 1
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {n.row.status === 1 ? 'Aktif' : n.row.status === 0 ? 'Pasif' : '—'}
              </span>
            </td>
            <td className="hidden md:table-cell w-20 py-2.5 pr-3 text-center text-muted-foreground align-middle">
              {n.row.hasChildren === 0 ? 'Var' : n.row.hasChildren === 1 ? 'Yok' : '—'}
            </td>
            <td className="w-[100px] min-w-[88px] py-2.5 pr-2 align-middle">
              <IdeasoftDistributorCell row={n.row} />
            </td>
            <td className="min-w-[120px] max-w-[200px] py-2.5 pr-3 align-middle">
              <MasterMatchCell
                row={n.row}
                masterByIdeasoftId={masterByIdeasoftId}
                onLink={onLink}
                onUnlink={onUnlink}
                busy={busy}
              />
            </td>
          </tr>
          {n.children.length > 0 ? (
            <CategoryTreeTable
              nodes={n.children}
              depth={depth + 1}
              masterByIdeasoftId={masterByIdeasoftId}
              onLink={onLink}
              onUnlink={onUnlink}
              busy={busy}
            />
          ) : null}
        </Fragment>
      ))}
    </>
  )
}

export function Ideasoft2CategoriesPage() {
  const [rows, setRows] = useState<IdeasoftCategoryRow[]>([])
  const [masterRows, setMasterRows] = useState<MasterProductCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [matchDialogRow, setMatchDialogRow] = useState<IdeasoftCategoryRow | null>(null)
  const [matchPickerSearch, setMatchPickerSearch] = useState('')
  const [matchPickerSelectedMasterId, setMatchPickerSelectedMasterId] = useState<number | null>(null)
  const [matchSaving, setMatchSaving] = useState(false)
  const [listState, setListState] = usePersistedListState('ideasoft2-categories-v1', listDefaults)
  const { search, cascadePath } = listState
  const cascadePathEffective = cascadePath.slice(0, CASCADE_MAX_DEPTH)

  const loadMasters = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/product-categories?limit=9999`)
      const json = await parseJsonResponse<{
        data?: {
          id: number
          name: string
          code?: string | null
          group_id?: number | null
          category_id?: number | null
          sort_order?: number
          color?: string | null
          ideasoft_category_id?: number | null
          ideasoft_category_code?: string | null
        }[]
      }>(res)
      if (res.ok && Array.isArray(json.data)) {
        setMasterRows(
          json.data.map((x) => ({
            id: x.id,
            name: x.name,
            code: x.code ?? '',
            group_id: x.group_id ?? undefined,
            category_id: x.category_id ?? undefined,
            sort_order: x.sort_order,
            color: x.color ?? undefined,
            ideasoft_category_id: x.ideasoft_category_id ?? null,
            ideasoft_category_code: x.ideasoft_category_code ?? null,
          }))
        )
      } else setMasterRows([])
    } catch {
      setMasterRows([])
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const flat = await fetchAllCategoriesFlat()
      setRows(flat)
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Liste alınamadı')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadMasters()
  }, [loadMasters])

  const masterByIdeasoftId = useMemo(() => buildMasterByIdeasoftId(masterRows), [masterRows])

  const masterCategoryItems = useMemo(
    () =>
      masterRows.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        group_id: c.group_id,
        category_id: c.category_id,
        sort_order: c.sort_order,
        color: c.color,
      })),
    [masterRows]
  )

  const matchDialogDisabledMasterIds = useMemo(() => {
    if (!matchDialogRow) return new Set<number>() as ReadonlySet<number>
    const rid = matchDialogRow.id
    return new Set(
      masterRows
        .filter((m) => m.ideasoft_category_id != null && Number(m.ideasoft_category_id) !== rid)
        .map((m) => m.id)
    )
  }, [matchDialogRow, masterRows])

  const openMatchDialog = useCallback((row: IdeasoftCategoryRow) => {
    setMatchDialogRow(row)
    setMatchPickerSearch('')
    setMatchPickerSelectedMasterId(null)
  }, [])

  const closeMatchDialog = useCallback(() => {
    setMatchDialogRow(null)
    setMatchPickerSearch('')
    setMatchPickerSelectedMasterId(null)
  }, [])

  const saveMatchFromDialog = useCallback(async () => {
    if (!matchDialogRow || matchPickerSelectedMasterId == null) return
    setMatchSaving(true)
    try {
      const codeRaw = (matchDialogRow.distributor || '').trim()
      const code = codeRaw || null
      const isId = matchDialogRow.id
      const other = masterRows.find(
        (m) =>
          m.ideasoft_category_id != null &&
          Number(m.ideasoft_category_id) === isId &&
          m.id !== matchPickerSelectedMasterId
      )
      if (other) {
        const clearRes = await fetch(`${API_URL}/api/product-categories/${other.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ideasoft_category_id: null, ideasoft_category_code: null }),
        })
        const clearData = await parseJsonResponse<{ error?: string }>(clearRes)
        if (!clearRes.ok) throw new Error(clearData.error || 'Çakışan master temizlenemedi')
      }
      const res = await fetch(`${API_URL}/api/product-categories/${matchPickerSelectedMasterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideasoft_category_id: isId,
          ideasoft_category_code: code,
        }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      toastSuccess('Eşleştirildi', 'IdeaSoft kategori master kayıtla bağlandı.')
      closeMatchDialog()
      await loadMasters()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setMatchSaving(false)
    }
  }, [matchDialogRow, matchPickerSelectedMasterId, masterRows, closeMatchDialog, loadMasters])

  const removeMatch = useCallback(
    async (_row: IdeasoftCategoryRow, masterId: number) => {
      setMatchSaving(true)
      try {
        const res = await fetch(`${API_URL}/api/product-categories/${masterId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ideasoft_category_id: null, ideasoft_category_code: null }),
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

  const tree = useMemo(() => buildCategoryTree(rows), [rows])
  const treeForView = useMemo(
    () => subtreeForCascade(tree, cascadePathEffective),
    [tree, cascadePathEffective]
  )
  const visibleTree = useMemo(() => pruneTree(treeForView, search), [treeForView, search])

  const cascadeMissing =
    cascadePathEffective.length > 0 &&
    tree.length > 0 &&
    findCatNodeById(tree, cascadePathEffective[cascadePathEffective.length - 1]!) == null

  const hasActiveFilters = search.trim().length > 0 || cascadePathEffective.length > 0

  const emptyHint = (() => {
    if (rows.length === 0) return 'Kayıt yok'
    if (cascadeMissing) return 'Seçilen konum ağaçta bulunamadı (veri güncellendi mi?)'
    if (visibleTree.length === 0) return 'Aramaya uygun kategori yok'
    return ''
  })()

  return (
    <PageLayout
      title="IdeaSoft 2 › Kategoriler"
      description="Admin API Category LIST; master eşleşmesi Parametreler › Kategoriler’de kayıtlı IdeaSoft kategori ID’si (ideasoft_category_id) ile yapılır."
      backTo="/ideasoft2"
      headerToolbar={
        <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center lg:gap-3">
          <div className="relative w-full shrink-0 lg:w-[16rem]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-full pl-9 pr-3"
              placeholder="Kategori adında ara…"
              value={search}
              onChange={(e) => setListState({ search: e.target.value })}
            />
          </div>
          <div className="flex min-h-[2.25rem] min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:overflow-x-auto sm:pb-0.5">
            <span className="hidden w-12 shrink-0 text-xs leading-9 text-muted-foreground sm:inline-block">
              Konum
            </span>
            <div className="min-w-0 flex-1 sm:min-w-[min(100%,36rem)]">
              <CategoryCascadeThreeSelects
                path={cascadePathEffective}
                onPathChange={(next) => setListState({ cascadePath: next })}
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={loading}
                  onClick={() => {
                    void load()
                    void loadMasters()
                  }}
                  aria-label="Listeyi yenile"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Yenile</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={loading || !hasActiveFilters}
                  onClick={() => setListState({ search: '', cascadePath: [] })}
                  aria-label="Arama ve konum filtrelerini sıfırla"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filtreleri sıfırla</TooltipContent>
            </Tooltip>
          </div>
        </div>
      }
    >
      <Card className="flex flex-1 min-h-0 flex-col overflow-hidden border-border">
        <CardContent className="flex flex-1 min-h-0 flex-col overflow-hidden p-0">
          {listError ? (
            <div className="shrink-0 border-b border-border px-4 py-3 text-sm text-destructive">{listError}</div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-2 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                    Kategori
                  </th>
                  <th className="sticky top-0 z-10 w-20 border-b border-border bg-muted px-2 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                    ID
                  </th>
                  <th className="sticky top-0 z-10 hidden sm:table-cell max-w-[200px] border-b border-border bg-muted px-3 py-2 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                    Slug
                  </th>
                  <th className="sticky top-0 z-10 w-24 border-b border-border bg-muted px-3 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                    Durum
                  </th>
                  <th className="sticky top-0 z-10 hidden md:table-cell w-20 border-b border-border bg-muted px-3 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                    Alt
                  </th>
                  <th className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-left text-xs font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                    IS kod
                  </th>
                  <th className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-2 text-left text-xs font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                    Master
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : visibleTree.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                      {emptyHint}
                    </td>
                  </tr>
                ) : (
                  <CategoryTreeTable
                    nodes={visibleTree}
                    depth={0}
                    masterByIdeasoftId={masterByIdeasoftId}
                    onLink={openMatchDialog}
                    onUnlink={removeMatch}
                    busy={matchSaving}
                  />
                )}
              </tbody>
            </table>
          </div>
          {!loading && rows.length > 0 ? (
            <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Toplam {rows.length} kategori
              {cascadePathEffective.length > 0 ? (
                <>
                  {' '}
                  · görünüm:{' '}
                  <span className="tabular-nums text-foreground">
                    {cascadePathEffective.join(' → ')}
                  </span>
                </>
              ) : null}
              {' '}
              · hiyerarşi <code className="rounded bg-muted px-1">parent.id</code> · master:{' '}
              <code className="rounded bg-muted px-1">ideasoft_category_id</code> = bu tablodaki{' '}
              <code className="rounded bg-muted px-1">ID</code> (IS kod = distributor, bilgi)
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={matchDialogRow != null} onOpenChange={(open) => !open && closeMatchDialog()}>
        <DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden sm:max-w-lg">
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
                  placeholder="Master kategori ara…"
                  value={matchPickerSearch}
                  onChange={(e) => setMatchPickerSearch(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/20">
                {masterCategoryItems.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master kategori yok. Önce Parametreler › Kategoriler üzerinden ekleyin.
                  </div>
                ) : (
                  <MasterCategoryTreePicker
                    categories={masterCategoryItems}
                    selectedId={matchPickerSelectedMasterId}
                    onSelect={setMatchPickerSelectedMasterId}
                    searchQuery={matchPickerSearch}
                    disabledMasterIds={matchDialogDisabledMasterIds}
                  />
                )}
              </div>
              <DialogFooter className="mt-4 gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={closeMatchDialog} disabled={matchSaving}>
                  İptal
                </Button>
                <Button
                  type="button"
                  disabled={matchSaving || matchPickerSelectedMasterId == null}
                  onClick={() => void saveMatchFromDialog()}
                >
                  {matchSaving ? 'Kaydediliyor…' : 'Kaydet'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
