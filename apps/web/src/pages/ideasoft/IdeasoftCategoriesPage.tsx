import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Link2, Plus, Search, Save, Trash2, Unlink, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { CategoryItem } from '@/components/CategorySelect'
import { MasterCategoryTreePicker } from '@/components/MasterCategoryTreePicker'

/** Admin API Category — LIST/GET (PDF) */
export interface IdeasoftCategoryRow {
  id: number
  name?: string
  slug?: string
  sortOrder?: number
  showcaseSortOrder?: number
  status?: number
  /** PDF: 0 = Var, 1 = Yok */
  hasChildren?: number
  imageFile?: string
  imageUrl?: string
  distributor?: string
}

export type IdeasoftCatStatusFilter = 'all' | 'active' | 'inactive'

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
  statusFilter: 'active' as IdeasoftCatStatusFilter,
  cascadePath: [] as number[],
}

/** parseInt gevşek; "12abc"→12 ve "0" gibi değerler yanlış kilitlemeye yol açmasın */
function parseStrictPositiveId(raw: unknown): number | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function sanitizeIdeasoftCategoryMappings(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(raw)) {
    const ks = String(k).trim()
    if (!/^\d+$/.test(ks)) continue
    const ideasoftId = Number(ks)
    if (!Number.isFinite(ideasoftId) || ideasoftId <= 0) continue
    const mid = parseStrictPositiveId(val)
    if (mid == null) continue
    out[String(ideasoftId)] = String(mid)
  }
  return out
}

function normalizeAdminImageUrl(u: string | undefined | null): string | null {
  const s = (u || '').trim()
  if (!s) return null
  if (s.startsWith('//')) return `https:${s}`
  if (/^https?:\/\//i.test(s)) return s
  return null
}

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

function parseCategoryCount(json: unknown): number | null {
  if (typeof json === 'number' && Number.isFinite(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.total === 'number') return o.total
    if (typeof o.count === 'number') return o.count
    if (typeof o['hydra:totalItems'] === 'number') return o['hydra:totalItems'] as number
  }
  return null
}

/** Geçerli liste ebeveyni: kök = 0, derinlik = path son elemanı */
function listParentId(path: number[]): number {
  return path.length === 0 ? 0 : path[path.length - 1]!
}

/**
 * IdeaSoft Admin API: `parent=0` göndermek 400 döndürüyor
 * ("The string '0' can only be null or digits." — kök için parametre gönderilmemeli).
 * Üst kategori > 0 ise `parent` eklenir.
 */
function appendCategoryParentParam(params: URLSearchParams, parentId: number) {
  if (parentId > 0) params.set('parent', String(parentId))
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

/** `parent` gönderilmeden gelen listede yalnızca 1. seviye (üst id yok veya 0). */
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

async function fetchCategoryOptions(
  parentId: number
): Promise<{ id: number; name: string }[]> {
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

interface IdeasoftCategoryForm {
  id: number
  /** GET’teki üst kategori (PUT gövdesi için) */
  parentId: number
  name: string
  slug: string
  sortOrder: number
  showcaseSortOrder: number
  status: number
  distributor: string
  distributorCode: string
  percent: number
  imageFile: string
  displayShowcaseContent: number
  showcaseContent: string
  showcaseContentDisplayType: number
  displayShowcaseFooterContent: number
  showcaseFooterContent: string
  showcaseFooterContentDisplayType: number
  hasChildren: number
  pageTitle: string
  metaDescription: string
  metaKeywords: string
  canonicalUrl: string
  tree: string
  updatedAt: string
}

function emptyCategoryForm(): IdeasoftCategoryForm {
  return {
    id: 0,
    parentId: 0,
    name: '',
    slug: '',
    sortOrder: 0,
    showcaseSortOrder: 0,
    status: 1,
    distributor: '',
    distributorCode: '',
    percent: 1,
    imageFile: '',
    displayShowcaseContent: 0,
    showcaseContent: '',
    showcaseContentDisplayType: 1,
    displayShowcaseFooterContent: 0,
    showcaseFooterContent: '',
    showcaseFooterContentDisplayType: 1,
    hasChildren: 1,
    pageTitle: '',
    metaDescription: '',
    metaKeywords: '',
    canonicalUrl: '',
    tree: '',
    updatedAt: '',
  }
}

function mapApiToCategoryForm(data: Record<string, unknown>): IdeasoftCategoryForm {
  const num = (k: string, d: number) => {
    const v = data[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : d
  }
  let parentId = 0
  const pr = data.parent
  if (pr && typeof pr === 'object' && pr !== null && 'id' in pr) {
    const pid = Number((pr as { id: unknown }).id)
    if (Number.isFinite(pid)) parentId = pid
  }
  return {
    id: Number(data.id) || 0,
    parentId,
    name: String(data.name ?? ''),
    slug: String(data.slug ?? ''),
    sortOrder: num('sortOrder', 0),
    showcaseSortOrder: num('showcaseSortOrder', 0),
    status: data.status === 1 || data.status === 0 ? (data.status as number) : 1,
    distributor: String(data.distributor ?? ''),
    distributorCode: String(data.distributorCode ?? ''),
    percent: typeof data.percent === 'number' ? data.percent : 1,
    imageFile: String(data.imageFile ?? ''),
    displayShowcaseContent: num('displayShowcaseContent', 0),
    showcaseContent: String(data.showcaseContent ?? ''),
    showcaseContentDisplayType: num('showcaseContentDisplayType', 1),
    displayShowcaseFooterContent: num('displayShowcaseFooterContent', 0),
    showcaseFooterContent: String(data.showcaseFooterContent ?? ''),
    showcaseFooterContentDisplayType: num('showcaseFooterContentDisplayType', 1),
    hasChildren: num('hasChildren', 1),
    pageTitle: String(data.pageTitle ?? ''),
    metaDescription: String(data.metaDescription ?? ''),
    metaKeywords: String(data.metaKeywords ?? ''),
    canonicalUrl: String(data.canonicalUrl ?? ''),
    tree: String(data.tree ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  }
}

function categoryFormToPayload(
  form: IdeasoftCategoryForm,
  mode: 'create' | 'edit',
  listParentForCreate: number
): Record<string, unknown> {
  const parentId = mode === 'create' ? listParentForCreate : form.parentId
  const payload: Record<string, unknown> = {
    name: form.name.trim().slice(0, 255),
    slug: form.slug.trim().slice(0, 255),
    sortOrder: Math.min(999, Math.max(0, form.sortOrder)),
    showcaseSortOrder: Math.min(500, Math.max(0, form.showcaseSortOrder)),
    status: form.status ? 1 : 0,
    distributor: form.distributor.trim().slice(0, 255),
    distributorCode: form.distributorCode.trim().slice(0, 255),
    percent: Math.max(0, form.percent),
    imageFile: form.imageFile.trim().slice(0, 255),
    displayShowcaseContent: Math.min(2, Math.max(0, form.displayShowcaseContent)),
    showcaseContent: form.showcaseContent.slice(0, 65535),
    showcaseContentDisplayType: Math.min(3, Math.max(1, form.showcaseContentDisplayType)),
    displayShowcaseFooterContent: Math.min(2, Math.max(0, form.displayShowcaseFooterContent)),
    showcaseFooterContent: form.showcaseFooterContent.slice(0, 65535),
    showcaseFooterContentDisplayType: Math.min(3, Math.max(1, form.showcaseFooterContentDisplayType)),
    hasChildren: form.hasChildren === 0 ? 0 : 1,
    pageTitle: form.pageTitle.trim().slice(0, 255),
    metaDescription: form.metaDescription.slice(0, 65535),
    metaKeywords: form.metaKeywords.slice(0, 65535),
    canonicalUrl: form.canonicalUrl.trim().slice(0, 255),
    tree: form.tree.slice(0, 65535),
  }
  if (form.id) payload.id = form.id
  if (form.updatedAt) payload.updatedAt = form.updatedAt
  payload.parent = { id: parentId }
  return payload
}

const CANONICAL_RE = /^[a-z0-9-/]+$/

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

  const selClass =
    'h-9 min-w-[9.5rem] max-w-[11rem] flex-1 rounded-md border border-input bg-background px-2 text-sm truncate'

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <select
        id="ideasoft-cat-cascade-l1"
        aria-label="Kategori"
        className={cn(selClass, disabled && 'opacity-50 pointer-events-none')}
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
        id="ideasoft-cat-cascade-l2"
        aria-label="2. seviye kategori"
        className={cn(
          selClass,
          (disabled || idL1 == null) && 'opacity-50 pointer-events-none cursor-not-allowed'
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
        id="ideasoft-cat-cascade-l3"
        aria-label="3. seviye kategori"
        className={cn(
          selClass,
          (disabled || idL2 == null) && 'opacity-50 pointer-events-none cursor-not-allowed'
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
      {path.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 px-2"
          disabled={disabled}
          onClick={() => onPathChange([])}
        >
          Kategori sıfırla
        </Button>
      )}
    </div>
  )
}

function CategoryLogoAvatar({ imageUrlRaw, name }: { imageUrlRaw?: string; name?: string }) {
  const src = normalizeAdminImageUrl(imageUrlRaw ?? null)
  const initial = (name || '?').trim().slice(0, 1).toUpperCase() || '?'
  return (
    <Avatar className="h-9 w-9 rounded-md border border-border bg-muted/40 shrink-0">
      {src ? <AvatarImage src={src} alt="" className="object-contain p-0.5" /> : null}
      <AvatarFallback className="rounded-md text-[10px] font-medium">{initial}</AvatarFallback>
    </Avatar>
  )
}

/** IdeaSoft kategori id (string) → master product_categories.id (string) */
function applyIdeasoftCategoryMapping(
  prev: Record<string, string>,
  ideasoftCategoryId: string,
  masterCategoryId: string
): Record<string, string> {
  const next = { ...prev }
  for (const [k, v] of Object.entries(next)) {
    if (v === masterCategoryId && k !== ideasoftCategoryId) delete next[k]
  }
  next[ideasoftCategoryId] = masterCategoryId
  return next
}

function removeIdeasoftCategoryMappingKey(
  prev: Record<string, string>,
  ideasoftCategoryId: string
): Record<string, string> {
  const next = { ...prev }
  delete next[ideasoftCategoryId]
  return next
}

export function IdeasoftCategoriesPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-categories-v1', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter, cascadePath } = listState
  const [items, setItems] = useState<IdeasoftCategoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit')
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<IdeasoftCategoryForm>(emptyCategoryForm())
  const [saving, setSaving] = useState(false)
  const [loadDetailPending, setLoadDetailPending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [masterCategoryItems, setMasterCategoryItems] = useState<CategoryItem[]>([])
  const [masterLoading, setMasterLoading] = useState(false)
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({})
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [matchPickerRow, setMatchPickerRow] = useState<IdeasoftCategoryRow | null>(null)
  const [matchPickerSearch, setMatchPickerSearch] = useState('')
  const [matchPickerSelectedMasterId, setMatchPickerSelectedMasterId] = useState<number | null>(null)
  const [savingMapping, setSavingMapping] = useState(false)
  const [clearAllMappingsOpen, setClearAllMappingsOpen] = useState(false)
  const [clearingAllMappings, setClearingAllMappings] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const cascadePathEffective = cascadePath.slice(0, CASCADE_MAX_DEPTH)
  const parentListId = listParentId(cascadePathEffective)
  const hasFilter =
    search.length > 0 || statusFilter !== 'active' || cascadePathEffective.length > 0

  const categoryMappingCount = useMemo(() => Object.keys(categoryMappings).length, [categoryMappings])

  const buildListParams = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: 'id',
    })
    appendCategoryParentParam(params, parentListId)
    if (search.trim()) params.set('s', search.trim())
    if (statusFilter === 'active') params.set('status', '1')
    else if (statusFilter === 'inactive') params.set('status', '0')
    return params
  }, [page, limit, parentListId, search, statusFilter])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = buildListParams()
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/categories?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı'
        )
        setItems([])
        setTotal(0)
        return
      }
      let { items: rows, total: t } = extractCategoriesList(data)
      setItems(rows)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(
        `${API_URL}/api/ideasoft/admin-api/categories/count?${countParams}`
      )
      let countData: unknown = null
      if (resCount.ok) {
        try {
          countData = await parseJsonResponse<unknown>(resCount)
        } catch {
          countData = null
        }
      }
      if (countData != null) {
        const c = parseCategoryCount(countData)
        if (c != null) t = c
      }
      setTotal(t)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [buildListParams])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/category-mappings`)
      const data = await parseJsonResponse<{ mappings?: Record<string, unknown> }>(res)
      const raw = data.mappings && typeof data.mappings === 'object' ? data.mappings : {}
      setCategoryMappings(sanitizeIdeasoftCategoryMappings(raw))
    } catch {
      setCategoryMappings({})
    } finally {
      setMappingsLoading(false)
    }
  }, [])

  const fetchMasterCategories = useCallback(async () => {
    setMasterLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/product-categories?limit=9999`)
      const data = await parseJsonResponse<{
        data?: {
          id: number
          name: string
          code?: string | null
          group_id?: number | null
          category_id?: number | null
          sort_order?: number
          color?: string | null
        }[]
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Master kategoriler yüklenemedi')
      setMasterCategoryItems(
        (data.data ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          code: x.code ?? '',
          group_id: x.group_id ?? undefined,
          category_id: x.category_id ?? undefined,
          sort_order: x.sort_order,
          color: x.color ?? undefined,
        }))
      )
    } catch {
      setMasterCategoryItems([])
    } finally {
      setMasterLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMappings()
    void fetchMasterCategories()
  }, [fetchMappings, fetchMasterCategories])

  const masterById = useMemo(
    () => new Map(masterCategoryItems.map((c) => [c.id, c])),
    [masterCategoryItems]
  )

  const validMasterIdSet = useMemo(
    () => new Set(masterCategoryItems.map((c) => c.id)),
    [masterCategoryItems]
  )

  /** Yalnızca gerçekten master tabloda var olan id’ler — silinmiş/çöp eşleştirme ağacı kilitlemesin */
  const masterIdsOccupiedByOtherIdeasoft = useMemo(() => {
    if (!matchPickerRow) return new Set<number>() as ReadonlySet<number>
    const cur = String(matchPickerRow.id)
    const s = new Set<number>()
    for (const [isKey, masterStr] of Object.entries(categoryMappings)) {
      if (isKey === cur) continue
      const mid = parseStrictPositiveId(masterStr)
      if (mid == null || !validMasterIdSet.has(mid)) continue
      s.add(mid)
    }
    return s
  }, [categoryMappings, matchPickerRow, validMasterIdSet])

  const openMatchPicker = (row: IdeasoftCategoryRow, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMatchPickerRow(row)
    setMatchPickerSearch('')
    const m = parseStrictPositiveId(categoryMappings[String(row.id)])
    setMatchPickerSelectedMasterId(m != null && validMasterIdSet.has(m) ? m : null)
  }

  const closeMatchPicker = () => {
    setMatchPickerRow(null)
    setMatchPickerSearch('')
    setMatchPickerSelectedMasterId(null)
  }

  const saveCategoryMapping = async () => {
    if (!matchPickerRow || matchPickerSelectedMasterId == null) return
    const isKey = String(matchPickerRow.id)
    const masterKey = String(matchPickerSelectedMasterId)
    setSavingMapping(true)
    try {
      const next = applyIdeasoftCategoryMapping(categoryMappings, isKey, masterKey)
      const res = await fetch(`${API_URL}/api/ideasoft/category-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setCategoryMappings(sanitizeIdeasoftCategoryMappings(next as Record<string, unknown>))
      toastSuccess('Eşleştirildi', 'IdeaSoft kategorisi master kategori ile bağlandı.')
      closeMatchPicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const clearCategoryMapping = async () => {
    if (!matchPickerRow) return
    const isKey = String(matchPickerRow.id)
    setSavingMapping(true)
    try {
      const next = removeIdeasoftCategoryMappingKey(categoryMappings, isKey)
      const res = await fetch(`${API_URL}/api/ideasoft/category-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setCategoryMappings(sanitizeIdeasoftCategoryMappings(next as Record<string, unknown>))
      toastSuccess('Kaldırıldı', 'Master kategori eşleştirmesi silindi.')
      closeMatchPicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const clearCategoryMappingInline = async (row: IdeasoftCategoryRow, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const isKey = String(row.id)
    if (!categoryMappings[isKey]) return
    setSavingMapping(true)
    try {
      const next = removeIdeasoftCategoryMappingKey(categoryMappings, isKey)
      const res = await fetch(`${API_URL}/api/ideasoft/category-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setCategoryMappings(sanitizeIdeasoftCategoryMappings(next as Record<string, unknown>))
      toastSuccess('Kaldırıldı', 'Eşleştirme kaldırıldı.')
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const clearAllIdeasoftCategoryMappings = async () => {
    setClearingAllMappings(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/category-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: {} }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setCategoryMappings({})
      closeMatchPicker()
      setClearAllMappingsOpen(false)
      toastSuccess('Temizlendi', 'Tüm IdeaSoft–master kategori eşleştirmeleri kaldırıldı.')
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setClearingAllMappings(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditId(null)
    setModalMode('edit')
    setForm(emptyCategoryForm())
  }

  const parentForNewCategory = parentListId

  const openNew = () => {
    setModalMode('create')
    setEditId(null)
    setForm(emptyCategoryForm())
    setModalOpen(true)
  }

  const openEdit = async (row: IdeasoftCategoryRow) => {
    setModalMode('edit')
    setEditId(row.id)
    setModalOpen(true)
    setLoadDetailPending(true)
    setForm(emptyCategoryForm())
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/categories/${row.id}`)
      const data = await parseJsonResponse<Record<string, unknown> & { error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Kayıt yüklenemedi')
      setForm(mapApiToCategoryForm(data))
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Yüklenemedi')
      closeModal()
    } finally {
      setLoadDetailPending(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toastError('Doğrulama', 'Ad (name) zorunludur.')
      return
    }
    const cu = form.canonicalUrl.trim()
    if (cu && !CANONICAL_RE.test(cu)) {
      toastError('Doğrulama', 'Canonical URL yalnızca küçük harf, rakam, tire ve / içerebilir.')
      return
    }

    setSaving(true)
    try {
      if (modalMode === 'create') {
        const payload = categoryFormToPayload(form, 'create', parentForNewCategory)
        delete payload.id
        const res = await fetch(`${API_URL}/api/ideasoft/admin-api/categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res)
        if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Oluşturulamadı')
        toastSuccess('Oluşturuldu', 'Kategori eklendi.')
      } else {
        if (editId == null) return
        const payload = categoryFormToPayload(form, 'edit', parentForNewCategory)
        const res = await fetch(`${API_URL}/api/ideasoft/admin-api/categories/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res)
        if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Güncellenemedi')
        toastSuccess('Kaydedildi', 'Kategori güncellendi.')
      }
      closeModal()
      fetchList()
    } catch (err) {
      toastError('Kayıt hatası', err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (editId == null) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/categories/${editId}`, {
        method: 'DELETE',
      })
      if (res.ok && res.status === 204) {
        toastSuccess('Silindi', 'Kategori kaldırıldı.')
        setDeleteOpen(false)
        closeModal()
        fetchList()
        return
      }
      const data = await parseJsonResponse<{ error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Silinemedi')
      toastSuccess('Silindi', 'Kategori kaldırıldı.')
      setDeleteOpen(false)
      closeModal()
      fetchList()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }

  const onCascadePathChange = useCallback(
    (next: number[]) =>
      setListState({ cascadePath: next.slice(0, CASCADE_MAX_DEPTH), page: 1 }),
    [setListState]
  )

  return (
    <PageLayout
      title="IdeaSoft — Kategoriler"
      description="Admin API kategoriler; master eşleştirme Parametreler › Kategoriler (product_categories) ile satırdan yapılır."
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={fetchList}
      headerActions={
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ara (s)..."
                  value={search}
                  onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                  className="pl-8 w-52 h-9 rounded-r-none border-r-0 sm:w-56"
                />
              </div>
              <div
                role="group"
                aria-label="Durum"
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
                  onClick={() =>
                    setListState({ search: '', statusFilter: 'active', cascadePath: [], page: 1 })
                  }
                  className={`h-9 w-9 shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filtreleri sıfırla</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={openNew} className="h-9 w-9 shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Yeni kategori (POST, ebeveyn: mevcut liste seviyesi)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-9 w-9 shrink-0',
                    categoryMappingCount > 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  disabled={
                    categoryMappingCount === 0 || mappingsLoading || clearingAllMappings || savingMapping
                  }
                  onClick={() => setClearAllMappingsOpen(true)}
                  aria-label="Tüm eşleştirmeleri kaldır"
                >
                  <Unlink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {categoryMappingCount > 0
                  ? `Tüm master eşleştirmelerini kaldır (${categoryMappingCount})`
                  : 'Eşleştirme yok'}
              </TooltipContent>
            </Tooltip>
          </div>
          <CategoryCascadeThreeSelects
            path={cascadePathEffective}
            disabled={loading}
            onPathChange={onCascadePathChange}
          />
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
          <p className="px-4 py-2 text-xs text-muted-foreground border-b border-border shrink-0">
            Liste ebeveyn ID: <span className="font-mono tabular-nums">{parentListId}</span>
            {cascadePathEffective.length > 0 && (
              <span className="ml-2">Yol: {cascadePathEffective.join(' → ')}</span>
            )}
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b bg-muted/50">
                  <th className="text-center p-2 font-medium w-14">Görsel</th>
                  <th className="text-left p-2 font-medium">ID</th>
                  <th className="text-left p-2 font-medium">Ad</th>
                  <th className="text-left p-2 font-medium">Slug</th>
                  <th className="text-center p-2 font-medium w-20">Sıra</th>
                  <th className="text-center p-2 font-medium w-24">Durum</th>
                  <th className="text-center p-2 font-medium w-28">Alt kategori</th>
                  <th className="text-left p-2 font-medium min-w-[120px]">Master</th>
                  <th className="text-center p-2 font-medium w-[148px]">Eşleştir</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Bu seviyede kayıt yok.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      aria-label={`${row.name || 'Kategori'} detayını aç`}
                      className={cn(
                        'border-b border-border/60 hover:bg-muted/40 cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                      )}
                      onClick={() => void openEdit(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          void openEdit(row)
                        }
                      }}
                    >
                      <td className="p-2 text-center w-14">
                        <div className="inline-flex justify-center">
                          <CategoryLogoAvatar imageUrlRaw={row.imageUrl} name={row.name} />
                        </div>
                      </td>
                      <td className="p-2 tabular-nums">{row.id}</td>
                      <td className="p-2 font-medium">{row.name ?? '—'}</td>
                      <td className="p-2 text-muted-foreground truncate max-w-[180px]">
                        {row.slug ?? '—'}
                      </td>
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
                      <td className="p-2 text-center text-xs text-muted-foreground">
                        {row.hasChildren === 0 ? 'Var' : row.hasChildren === 1 ? 'Yok' : '—'}
                      </td>
                      <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                        {(() => {
                          const mid = parseStrictPositiveId(categoryMappings[String(row.id)])
                          if (mid == null || !validMasterIdSet.has(mid)) {
                            return mappingsLoading ? '…' : '—'
                          }
                          const mc = masterById.get(mid)
                          if (!mc) return <span className="tabular-nums">#{mid}</span>
                          return (
                            <span
                              className="text-foreground"
                              title={mc.code ? `${mc.name} [${mc.code}]` : mc.name}
                            >
                              <span className="truncate">{mc.name}</span>
                              {mc.code ? (
                                <span className="text-xs text-muted-foreground ml-1 shrink-0">
                                  [{mc.code}]
                                </span>
                              ) : null}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex flex-wrap items-center justify-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs gap-1"
                                onClick={(e) => openMatchPicker(row, e)}
                                disabled={masterLoading || savingMapping}
                              >
                                <Link2 className="h-3.5 w-3.5 shrink-0" />
                                Eşleştir
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Master kategori seç (Parametreler › Kategoriler)</TooltipContent>
                          </Tooltip>
                          {parseStrictPositiveId(categoryMappings[String(row.id)]) != null && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={(e) => void clearCategoryMappingInline(row, e)}
                                  disabled={savingMapping}
                                >
                                  Kaldır
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Master eşleştirmesini kaldır</TooltipContent>
                            </Tooltip>
                          )}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'create'
                ? `Yeni kategori (ebeveyn id: ${parentForNewCategory})`
                : `Kategori düzenle #${editId}`}
            </DialogTitle>
          </DialogHeader>
          {loadDetailPending ? (
            <p className="text-sm text-muted-foreground py-6">Yükleniyor...</p>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <Tabs defaultValue="genel" className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <TabsList className="shrink-0 grid w-full grid-cols-3">
                  <TabsTrigger value="genel">Genel</TabsTrigger>
                  <TabsTrigger value="vitrin">Vitrin</TabsTrigger>
                  <TabsTrigger value="seo">SEO</TabsTrigger>
                </TabsList>
                <div className="flex-1 min-h-0 overflow-y-auto py-4 pr-1">
                  <TabsContent value="genel" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <Label htmlFor="c-name">Ad (name) *</Label>
                        <Input
                          id="c-name"
                          maxLength={255}
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <Label htmlFor="c-slug">Slug</Label>
                        <Input
                          id="c-slug"
                          maxLength={255}
                          value={form.slug}
                          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="c-so">Sıra (sortOrder, 0–999)</Label>
                        <Input
                          id="c-so"
                          type="number"
                          min={0}
                          max={999}
                          value={form.sortOrder}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              sortOrder: Math.min(999, Math.max(0, parseInt(e.target.value, 10) || 0)),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="c-sso">Vitrin sırası (showcaseSortOrder, ≤500)</Label>
                        <Input
                          id="c-sso"
                          type="number"
                          min={0}
                          max={500}
                          value={form.showcaseSortOrder}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              showcaseSortOrder: Math.min(
                                500,
                                Math.max(0, parseInt(e.target.value, 10) || 0)
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                        <Label htmlFor="c-st">Durum (status)</Label>
                        <Switch
                          id="c-st"
                          checked={form.status === 1}
                          onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                        <Label htmlFor="c-hc">Alt kategori (hasChildren: 0=Var, 1=Yok)</Label>
                        <Switch
                          id="c-hc"
                          checked={form.hasChildren === 0}
                          onCheckedChange={(v) => setForm((f) => ({ ...f, hasChildren: v ? 0 : 1 }))}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="c-img">Görsel dosya adı (imageFile)</Label>
                        <Input
                          id="c-img"
                          maxLength={255}
                          value={form.imageFile}
                          onChange={(e) => setForm((f) => ({ ...f, imageFile: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="c-pct">Fiyat katsayısı (percent)</Label>
                        <Input
                          id="c-pct"
                          type="number"
                          min={0}
                          step="any"
                          value={form.percent}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              percent: parseFloat(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </div>
                    {modalMode === 'edit' && form.updatedAt && (
                      <p className="text-xs text-muted-foreground">Güncellenme: {form.updatedAt}</p>
                    )}
                  </TabsContent>
                  <TabsContent value="vitrin" className="mt-0 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="c-display-showcase">Üst içerik göster (displayShowcaseContent: 0/1/2)</Label>
                        <select
                          id="c-display-showcase"
                          title="Üst içerik göster"
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={form.displayShowcaseContent}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              displayShowcaseContent: parseInt(e.target.value, 10) || 0,
                            }))
                          }
                        >
                          <option value={0}>0 — Gösterilmez</option>
                          <option value={1}>1 — Masaüstü</option>
                          <option value={2}>2 — Mobil + masaüstü</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="c-showcase-type">Üst içerik tipi (showcaseContentDisplayType: 1–3)</Label>
                        <select
                          id="c-showcase-type"
                          title="Üst içerik tipi"
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={form.showcaseContentDisplayType}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              showcaseContentDisplayType: parseInt(e.target.value, 10) || 1,
                            }))
                          }
                        >
                          <option value={1}>1 — Yalnız bu kategori</option>
                          <option value={2}>2 — Bu + üst</option>
                          <option value={3}>3 — Bu + tüm üst</option>
                        </select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="c-sc">Üst içerik (showcaseContent)</Label>
                        <Textarea
                          id="c-sc"
                          rows={4}
                          value={form.showcaseContent}
                          onChange={(e) => setForm((f) => ({ ...f, showcaseContent: e.target.value }))}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="c-display-footer">Alt içerik göster (displayShowcaseFooterContent: 0/1/2)</Label>
                        <select
                          id="c-display-footer"
                          title="Alt içerik göster"
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={form.displayShowcaseFooterContent}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              displayShowcaseFooterContent: parseInt(e.target.value, 10) || 0,
                            }))
                          }
                        >
                          <option value={0}>0 — Gösterilmez</option>
                          <option value={1}>1 — Masaüstü</option>
                          <option value={2}>2 — Mobil + masaüstü</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="c-footer-type">Alt içerik tipi (showcaseFooterContentDisplayType: 1–3)</Label>
                        <select
                          id="c-footer-type"
                          title="Alt içerik tipi"
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={form.showcaseFooterContentDisplayType}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              showcaseFooterContentDisplayType: parseInt(e.target.value, 10) || 1,
                            }))
                          }
                        >
                          <option value={1}>1 — Yalnız bu kategori</option>
                          <option value={2}>2 — Bu + alt</option>
                          <option value={3}>3 — Bu + tüm alt</option>
                        </select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="c-sf">Alt içerik (showcaseFooterContent)</Label>
                        <Textarea
                          id="c-sf"
                          rows={3}
                          value={form.showcaseFooterContent}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, showcaseFooterContent: e.target.value }))
                          }
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="seo" className="mt-0 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="c-pt">Sayfa başlığı (pageTitle)</Label>
                      <Input
                        id="c-pt"
                        maxLength={255}
                        value={form.pageTitle}
                        onChange={(e) => setForm((f) => ({ ...f, pageTitle: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-md">Meta açıklama</Label>
                      <Textarea
                        id="c-md"
                        rows={2}
                        value={form.metaDescription}
                        onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-mk">Meta anahtar kelimeler</Label>
                      <Input
                        id="c-mk"
                        value={form.metaKeywords}
                        onChange={(e) => setForm((f) => ({ ...f, metaKeywords: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-can">Canonical URL</Label>
                      <Input
                        id="c-can"
                        maxLength={255}
                        placeholder="kategoriler/idea-kalem"
                        value={form.canonicalUrl}
                        onChange={(e) => setForm((f) => ({ ...f, canonicalUrl: e.target.value }))}
                      />
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
              <DialogFooter className="shrink-0 gap-2 sm:gap-0 flex-col sm:flex-row sm:justify-between border-t pt-4 mt-2">
                <div>
                  {modalMode === 'edit' && editId != null && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setDeleteOpen(true)}
                      disabled={saving}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Sil
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 justify-end w-full sm:w-auto">
                  <Button type="button" variant="outline" onClick={closeModal}>
                    İptal
                  </Button>
                  <Button type="submit" variant="save" disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Kaydediliyor...' : modalMode === 'create' ? 'Oluştur' : 'Kaydet'}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!matchPickerRow} onOpenChange={(open) => !open && closeMatchPicker()}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Master kategori eşleştir
              {matchPickerRow && (
                <span className="block text-sm font-normal text-muted-foreground mt-1 truncate">
                  IdeaSoft: {matchPickerRow.name ?? `#${matchPickerRow.id}`}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {matchPickerRow && (
            <>
              {(() => {
                const curMid = parseStrictPositiveId(categoryMappings[String(matchPickerRow.id)])
                if (curMid == null) return null
                const c = masterById.get(curMid)
                return (
                  <p className="text-sm text-muted-foreground">
                    Mevcut:{' '}
                    <span className="text-foreground font-medium">
                      {c ? `${c.name}${c.code ? ` [${c.code}]` : ''}` : `#${curMid}`}
                    </span>
                  </p>
                )
              })()}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Master kategori ara (ad, kod, id)..."
                  value={matchPickerSearch}
                  onChange={(e) => setMatchPickerSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-md border bg-muted/20">
                {masterLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master kategoriler yükleniyor…
                  </div>
                ) : masterCategoryItems.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master kategori yok. Önce Parametreler › Kategoriler üzerinden ekleyin.
                  </div>
                ) : (
                  <MasterCategoryTreePicker
                    categories={masterCategoryItems}
                    selectedId={matchPickerSelectedMasterId}
                    onSelect={setMatchPickerSelectedMasterId}
                    searchQuery={matchPickerSearch}
                    disabledMasterIds={masterIdsOccupiedByOtherIdeasoft}
                  />
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:gap-0">
                <div className="flex gap-2 w-full sm:w-auto">
                  {parseStrictPositiveId(categoryMappings[String(matchPickerRow.id)]) != null && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void clearCategoryMapping()}
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
                    onClick={() => void saveCategoryMapping()}
                  >
                    {savingMapping ? 'Kaydediliyor...' : 'Kaydet'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={clearAllMappingsOpen}
        onOpenChange={setClearAllMappingsOpen}
        title="Tüm eşleştirmeleri kaldır"
        description={`Kayıtlı ${categoryMappingCount} IdeaSoft–master kategori eşleştirmesi silinecek. Bu işlem geri alınamaz; istediğinizde yeniden eşleştirmeniz gerekir.`}
        onConfirm={() => void clearAllIdeasoftCategoryMappings()}
        loading={clearingAllMappings}
      />

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Kategoriyi sil"
        description={`#${editId} silinecek (DELETE /admin-api/categories/{id}).`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </PageLayout>
  )
}
