import { useEffect, useRef, useState } from 'react'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { IdeasoftCategoryRow } from '@/pages/ideasoft/IdeasoftCategoriesPage'

/** LIST yanıtı — IdeasoftCategoriesPage ile aynı şema */
export function extractCategoriesList(json: unknown): { items: IdeasoftCategoryRow[]; total: number } {
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

/** Ürün/kategori yanıtındaki `/categories/{id}` veya tam IRI; Admin API / JSON-LD @id için */
export function ideasoftCategoryIdFromIriString(s: string): number | null {
  const t = s.trim()
  const m = t.match(/\/categories\/(\d+)(?:\/)?(?:\?.*)?$/i) ?? t.match(/^(\d+)$/)
  if (!m) return null
  const id = Number(m[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

export function parentIdFromCategoryListRow(row: Record<string, unknown>): number | null {
  const p = row.parent
  if (p == null) return null
  if (typeof p === 'number' && Number.isFinite(p) && p >= 0) return p
  if (typeof p === 'string') return ideasoftCategoryIdFromIriString(p)
  if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
    const o = p as Record<string, unknown>
    if ('id' in o) {
      const id = Number(o.id)
      return Number.isFinite(id) ? id : null
    }
    const at = o['@id']
    if (typeof at === 'string') return ideasoftCategoryIdFromIriString(at)
  }
  return null
}

/** `parent` gönderilmeden gelen listede yalnızca kök satırlar (IdeasoftCategoriesPage ile aynı). */
export function filterToRootLevelCategories(items: IdeasoftCategoryRow[]): IdeasoftCategoryRow[] {
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
export function appendCategoryParentParam(params: URLSearchParams, parentId: number) {
  if (parentId > 0) params.set('parent', String(parentId))
}

export async function fetchCategoryOptions(parentId: number): Promise<{ id: number; name: string }[]> {
  /** Category LIST (Admin API PDF): `page`, `limit`, `sort`, `parent`. */
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

export function CategoryCascadeThreeSelects({
  path,
  onPathChange,
  disabled,
  idPrefix = 'ideasoft2-cat-cascade',
}: {
  path: number[]
  onPathChange: (next: number[]) => void
  disabled?: boolean
  /** Aynı sayfada birden fazla cascade varsa id çakışmasın */
  idPrefix?: string
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
    'h-9 w-[10.5rem] max-w-[10.5rem] shrink-0 rounded-md border border-input bg-background px-2 text-sm truncate'

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-visible pb-0.5 [scrollbar-gutter:stable]">
      <select
        id={`${idPrefix}-l1`}
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
        id={`${idPrefix}-l2`}
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
        id={`${idPrefix}-l3`}
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
