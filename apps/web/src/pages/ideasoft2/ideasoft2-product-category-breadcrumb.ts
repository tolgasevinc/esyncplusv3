import { API_URL, parseJsonResponse } from '@/lib/api'
import { ideasoftCategoryIdFromIriString, parentIdFromCategoryListRow } from './ideasoft2-category-cascade'

const SEP = ' › '

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}

function categoryLeafId(c: unknown): number | null {
  const o = asRecord(c)
  if (!o) return null
  const at = o['@id']
  if (typeof at === 'string') {
    const n = ideasoftCategoryIdFromIriString(at)
    if (n) return n
  }
  const id = o.id
  if (typeof id === 'number' && id > 0) return id
  if (typeof id === 'string') {
    const trimmed = id.trim()
    if (/^\d+$/.test(trimmed)) {
      const n = parseInt(trimmed, 10)
      if (n > 0) return n
    }
    const n = ideasoftCategoryIdFromIriString(trimmed)
    if (n) return n
  }
  return null
}

async function fetchCategoryRow(
  id: number,
  cache: Map<number, Record<string, unknown>>
): Promise<Record<string, unknown> | null> {
  const hit = cache.get(id)
  if (hit) return hit
  const res = await fetch(`${API_URL}/api/ideasoft/admin-api/categories/${id}`)
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok || !data || typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  cache.set(id, row)
  return row
}

/**
 * Yaprak kategori id için üst kategorilere tırmanarak "Kök › ... › Yaprak" metni.
 */
export async function fetchIdeasoftCategoryBreadcrumbByLeafId(
  leafId: number,
  cache: Map<number, Record<string, unknown>> = new Map()
): Promise<string> {
  const seen = new Set<number>()
  const stack: string[] = []
  let cur: number | null = leafId
  for (let i = 0; i < 64 && cur != null && cur > 0; i++) {
    if (seen.has(cur)) {
      stack.push('…')
      break
    }
    seen.add(cur)
    const row = await fetchCategoryRow(cur, cache)
    if (!row) {
      stack.push(`#${cur}`)
      break
    }
    const name =
      typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `#${cur}`
    stack.push(name)
    const pid = parentIdFromCategoryListRow(row)
    cur = pid != null && pid > 0 ? pid : null
  }
  if (stack.length === 0) return ` #${leafId}`
  return stack.reverse().join(SEP)
}

function categoryRefItems(product: Record<string, unknown>): unknown[] {
  const fromArr = product.categories
  if (Array.isArray(fromArr) && fromArr.length > 0) return fromArr
  const single = product.mainCategory ?? product.category
  if (single != null && single !== '') return [single]
  return []
}

/**
 * Ürün kategori referanslarında yaprak id biliniyorsa `GET /categories/{id}` ile yukarı tırmanır
 * (gömülü tek seviyeli/eksik ağaçlardan kaçınmak için).
 * Birden fazla kategori satır satır (`\n`) ayrılmış dönür.
 */
export async function buildIdeasoftProductCategoryBreadcrumbs(
  product: Record<string, unknown>
): Promise<string> {
  const raw = categoryRefItems(product)
  if (raw.length === 0) return '—'
  const cache = new Map<number, Record<string, unknown>>()
  const lines: string[] = []
  for (const c of raw) {
    const o = asRecord(c)
    if (!o) {
      if (typeof c === 'string') {
        const t = c.trim()
        const id = ideasoftCategoryIdFromIriString(t)
        if (id) {
          lines.push(await fetchIdeasoftCategoryBreadcrumbByLeafId(id, cache))
        } else {
          lines.push(t || '—')
        }
      }
      continue
    }
    const leaf = categoryLeafId(o)
    if (leaf) {
      const line = await fetchIdeasoftCategoryBreadcrumbByLeafId(leaf, cache)
      lines.push(line)
      continue
    }
    const onlyName = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null
    lines.push(onlyName ?? '—')
  }
  return lines.length > 0 ? lines.join('\n') : '—'
}
