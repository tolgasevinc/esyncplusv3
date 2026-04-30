/**
 * IdeaSoft liste sütunu: ürün gövdesi `extraInfos` / `extraInfo` ağacı + gerektiğinde
 * `extra_info_to_products` API satıları. Admin panelde görülen “Yana Kayar Özellikleri” vb.
 * çoğu zaman seçim dizilerinde (`selectedExtraInfoValues` vb.) veya iç içe alt düğümlerde durur.
 */

const SUMMARY_VALUE_MAX = 120
const MAX_WALK_DEPTH = 16

/** Yapısal alt ağaç anahtarları */
const NEST_EXTRA_INFO_KEYS = [
  'subExtraInfos',
  'sub_extra_infos',
  'extraInfos',
  'extra_infos',
  'children',
  'subs',
  'childExtraInfos',
  'child_extra_infos',
] as const

/** Yaprak / seçim listeleri (value dışında) */
const ARRAY_VALUE_KEYS = [
  'selectedExtraInfoValues',
  'selected_extra_info_values',
  'selectedValues',
  'selected_values',
  'values',
  'selections',
  'choices',
  'subItems',
] as const

const VALUE_KEYS = [
  'value',
  'text',
  'content',
  'detail',
  'description',
  'answer',
  'extraInfoValue',
  'extra_info_value',
] as const

export type Ideasoft2ProductFeaturesCell = {
  loading?: boolean
  has: boolean
  hasEmptyGroups?: boolean
  summary: string
}

export function plainOneLine(raw: unknown, maxLen: number): string {
  const text =
    typeof raw === 'string'
      ? raw
      : raw == null
        ? ''
        : typeof raw === 'object'
          ? JSON.stringify(raw)
          : String(raw)
  const t = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}

/** Proxy / sarmalayıcı yanıtları düz ürün nesnesine indirger */
export function unwrapIdeasoftProductBody(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  if (typeof o.error === 'string' && o.error.trim()) return null
  const d = o.data
  if (d && typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>
  return o
}

function productExtraFieldsFromProduct(product: Record<string, unknown>): unknown {
  return product.productExtraFields ?? product.product_extra_fields
}

function pickExtraInfosArrayFromProduct(product: Record<string, unknown>): unknown[] | null {
  const keys = ['extraInfos', 'extra_infos', 'ExtraInfos'] as const
  for (const k of keys) {
    const v = product[k]
    if (Array.isArray(v)) return v
  }
  const inner = product.product
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const p = inner as Record<string, unknown>
    for (const k of keys) {
      const v = p[k]
      if (Array.isArray(v)) return v
    }
  }
  return null
}

function labelFromEmbeddedExtraInfo(extraInfoUnknown: unknown): string {
  if (!extraInfoUnknown || typeof extraInfoUnknown !== 'object' || Array.isArray(extraInfoUnknown)) {
    return ''
  }
  const ei = extraInfoUnknown as Record<string, unknown>
  for (const k of ['name', 'title', 'label'] as const) {
    const t = plainOneLine(ei[k], 96)
    if (t.length > 0) return t
  }
  return ''
}

function dedupePreserveOrder(lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const l of lines) {
    const t = l.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function collectValueStrings(o: Record<string, unknown>): string[] {
  const parts: string[] = []
  for (const k of VALUE_KEYS) {
    const v = o[k]
    if (v == null || v === '') continue
    const s = plainOneLine(v, SUMMARY_VALUE_MAX)
    if (s && s !== '{}' && s !== '[]') parts.push(s)
  }
  return parts
}

function walkExtraInfoNode(
  item: unknown,
  pathPrefix: string,
  lines: string[],
  visited: WeakSet<object>,
  depth: number
): void {
  if (depth > MAX_WALK_DEPTH || item == null) return
  if (Array.isArray(item)) {
    for (const el of item) walkExtraInfoNode(el, pathPrefix, lines, visited, depth + 1)
    return
  }
  if (typeof item !== 'object') return
  const o = item as Record<string, unknown>
  if (visited.has(o)) return
  visited.add(o)

  const selfName =
    labelFromEmbeddedExtraInfo(o.extraInfo ?? o.extra_info) ||
    plainOneLine(o.name ?? o.title ?? o.label, 96)
  const fullLabel =
    pathPrefix && selfName ? `${pathPrefix} / ${selfName}` : selfName || pathPrefix || ''

  const vals = collectValueStrings(o)
  if (vals.length > 0) {
    lines.push(`${fullLabel || 'Özellik'}: ${vals.join(', ')}`)
  }

  const lbl = fullLabel || pathPrefix || 'Seçim'
  for (const ak of ARRAY_VALUE_KEYS) {
    const arr = o[ak]
    if (!Array.isArray(arr) || arr.length === 0) continue
    for (const el of arr) {
      if (el != null && typeof el === 'object' && !Array.isArray(el)) {
        walkExtraInfoNode(el, lbl, lines, visited, depth + 1)
      } else {
        const s = plainOneLine(el, SUMMARY_VALUE_MAX)
        if (s) lines.push(`${lbl}: ${s}`)
      }
    }
  }

  const nextPrefix = fullLabel || pathPrefix
  for (const k of NEST_EXTRA_INFO_KEYS) {
    const nested = o[k]
    if (Array.isArray(nested) && nested.length > 0) {
      for (const child of nested) {
        walkExtraInfoNode(child, nextPrefix, lines, visited, depth + 1)
      }
    }
  }
}

export function appendProductExtraFieldsToLines(
  lines: string[],
  productExtraFieldsUnknown: unknown
): void {
  if (!Array.isArray(productExtraFieldsUnknown)) return
  for (const f of productExtraFieldsUnknown) {
    if (!f || typeof f !== 'object') continue
    const o = f as Record<string, unknown>
    const k = typeof o.varKey === 'string' ? o.varKey.trim() : String(o.varKey ?? '').trim()
    const v = typeof o.varValue === 'string' ? o.varValue.trim() : String(o.varValue ?? '').trim()
    if (k && v) lines.push(`${k}: ${plainOneLine(v, SUMMARY_VALUE_MAX)}`)
  }
}

function appendEmbeddedProductTreeToLines(product: Record<string, unknown>, lines: string[]): void {
  const visited = new WeakSet<object>()
  const roots = pickExtraInfosArrayFromProduct(product)
  if (roots != null) {
    walkExtraInfoNode(roots, '', lines, visited, 0)
  }
  appendProductExtraFieldsToLines(lines, productExtraFieldsFromProduct(product))
}

/** `extra_info_to_products` listesi — ürün gövdesi eksik olduğunda yedek */
export function appendExtraInfoApiRowsToLines(rows: ReadonlyArray<unknown>, lines: string[]): void {
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as Record<string, unknown>
    const extraInfoUnknown = row.extraInfo ?? row.extra_info
    const label = labelFromEmbeddedExtraInfo(extraInfoUnknown) || 'Ek bilgi'
    const flatVal = plainOneLine(row.value ?? row.varValue ?? row.text ?? row.content, SUMMARY_VALUE_MAX)
    if (flatVal) lines.push(`${label}: ${flatVal}`)
    const visited = new WeakSet<object>()
    for (const ak of ARRAY_VALUE_KEYS) {
      const arr = row[ak]
      if (!Array.isArray(arr) || arr.length === 0) continue
      for (const el of arr) {
        if (el != null && typeof el === 'object' && !Array.isArray(el)) {
          walkExtraInfoNode(el, label, lines, visited, 0)
        } else {
          const s = plainOneLine(el, SUMMARY_VALUE_MAX)
          if (s) lines.push(`${label}: ${s}`)
        }
      }
    }
  }
}

/**
 * Ürün JSON’u (GET) + isteğe bağlı API satırlarından tek özet.
 */
export function buildIdeasoftProductFeatureSummary(
  product: Record<string, unknown> | null | undefined,
  extraInfoApiRows: ReadonlyArray<unknown>
): Omit<Ideasoft2ProductFeaturesCell, 'loading'> {
  const lines: string[] = []
  if (product) appendEmbeddedProductTreeToLines(product, lines)
  appendExtraInfoApiRowsToLines(extraInfoApiRows, lines)

  const deduped = dedupePreserveOrder(lines)
  const summary = deduped.join(' · ')
  const hasValue = deduped.length > 0

  const eiArr = product ? pickExtraInfosArrayFromProduct(product) : null
  const treeRoots = eiArr?.length ?? 0
  const pf = product ? productExtraFieldsFromProduct(product) : undefined
  const fieldRows = Array.isArray(pf) ? pf.length : 0
  const apiCount = extraInfoApiRows.length
  const hasRecords = treeRoots > 0 || fieldRows > 0 || apiCount > 0

  return {
    has: hasValue,
    hasEmptyGroups: hasRecords && !hasValue,
    summary,
  }
}

export function summarizeProductEmbeddedExtraColumn(product: Record<string, unknown>): Omit<
  Ideasoft2ProductFeaturesCell,
  'loading'
> {
  return buildIdeasoftProductFeatureSummary(product, [])
}
