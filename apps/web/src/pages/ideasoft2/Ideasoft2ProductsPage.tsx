import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Banknote, CheckCircle2, Copy, ImageIcon, Search, X, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { extractIdeasoftProductSearchKeywords } from '@/lib/ideasoft-product-seo'
import { toastError, toastSuccess } from '@/lib/toast'
import type { IdeasoftProductImageRow } from '@/pages/ideasoft/IdeasoftProductImagesPage'
import { CategoryCascadeThreeSelects } from './ideasoft2-category-cascade'
import {
  Ideasoft2ProductDetailModal,
  type Ideasoft2ProductDetailFocusField,
  type Ideasoft2ProductDetailInitialPanel,
} from './Ideasoft2ProductDetailModal'

const FX_STORAGE_KEY = 'ideasoft2-fx-v1'

function getInitialFxFromStorage(): { eur: string; usd: string } {
  if (typeof window === 'undefined') return { eur: '', usd: '' }
  try {
    const raw = localStorage.getItem(FX_STORAGE_KEY)
    if (!raw) return { eur: '', usd: '' }
    const j = JSON.parse(raw) as { eur?: string; usd?: string }
    return {
      eur: typeof j.eur === 'string' ? j.eur : '',
      usd: typeof j.usd === 'string' ? j.usd : '',
    }
  } catch {
    return { eur: '', usd: '' }
  }
}

/** Product LIST — fiyat / iskonto / kur için gerekli alanlar */
interface Ideasoft2ProductListRow {
  id: number
  name?: string
  fullName?: string
  sku?: string
  stockAmount?: number
  price1?: number
  discount?: number
  /** IdeaSoft ürün API: 0 = sabit tutar, 1 = yüzde (applyIdeasoftDiscountToPayload ile uyumlu). */
  discountType?: number
  /** KDV oranı % (tax). */
  tax?: number
  /** 1 = fiyatlar KDV dahil, 0 = KDV hariç (IdeasoftProductEditModal ile uyumlu). */
  taxIncluded?: number
  currency?: { id?: number; label?: string; abbr?: string }
}

interface Ideasoft2ProductSpecialInfoRow {
  id: number
  title?: unknown
  content?: unknown
  status?: unknown
  product?: unknown
}

interface SpecialInfoStatus {
  hasTitle: boolean
  hasContent: boolean
  titlePreview: string
  contentPreview: string
}

const listDefaults = {
  search: '',
  categoryPath: [] as number[],
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
}

const DEFAULT_SPECIAL_TITLE = 'Teknik Özellikler'

/** `/api/ideasoft2/products` BFF alanı — katalog toplamı */
function readEsyncListTotal(o: Record<string, unknown>): number | null {
  const v = o.esyncListTotal
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.trunc(v)
  return null
}

/** BFF — toplamın kaynağı (COUNT öncelikli; tavanlı yanıtta LIST yürüyüş / son sayfa). */
function readEsyncListTotalSource(
  o: Record<string, unknown>
): 'product_count' | 'list_hydra' | 'list_walk' | 'list_last_page' | null {
  const s = o.esyncListTotalSource
  return s === 'product_count' ||
    s === 'list_hydra' ||
    s === 'list_walk' ||
    s === 'list_last_page'
    ? s
    : null
}

/** Hydra / bazı API’ler total’i string döndürebilir — sayfalama için sayıya çevir */
function parseCollectionTotal(o: Record<string, unknown>, fallbackLen: number): number {
  const fromBff = readEsyncListTotal(o)
  if (fromBff != null) return fromBff
  const raw = o['hydra:totalItems'] ?? o.totalItems ?? o.total ?? o.count
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return fallbackLen
}

function extractProductsList(json: unknown): { items: Ideasoft2ProductListRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as Ideasoft2ProductListRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      return { items: hydra as Ideasoft2ProductListRow[], total: parseCollectionTotal(o, hydra.length) }
    }
    const member = o.member
    if (Array.isArray(member)) {
      return { items: member as Ideasoft2ProductListRow[], total: parseCollectionTotal(o, member.length) }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as Ideasoft2ProductListRow[]
      const bff = readEsyncListTotal(o)
      const total =
        bff != null ? bff : typeof o.total === 'number' ? o.total : parseCollectionTotal(o, d.length)
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as Ideasoft2ProductListRow[]
      const bff = readEsyncListTotal(o)
      const total =
        bff != null ? bff : typeof o.total === 'number' ? o.total : parseCollectionTotal(o, items.length)
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function extractSpecialInfoList(json: unknown): Ideasoft2ProductSpecialInfoRow[] {
  if (Array.isArray(json)) return json as Ideasoft2ProductSpecialInfoRow[]
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) return hydra as Ideasoft2ProductSpecialInfoRow[]
    const member = o.member
    if (Array.isArray(member)) return member as Ideasoft2ProductSpecialInfoRow[]
    if (Array.isArray(o.data)) return o.data as Ideasoft2ProductSpecialInfoRow[]
    if (Array.isArray(o.items)) return o.items as Ideasoft2ProductSpecialInfoRow[]
  }
  return []
}

/** product_images LIST yanıtı — IdeasoftProductImagesPage ile aynı */
function extractProductImagesList(json: unknown): { items: IdeasoftProductImageRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftProductImageRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftProductImageRow[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as IdeasoftProductImageRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftProductImageRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as IdeasoftProductImageRow[]
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function sortImagesForProduct(images: IdeasoftProductImageRow[]): IdeasoftProductImageRow[] {
  return [...images].sort((a, b) => {
    const sa = a.sortOrder ?? 99
    const sb = b.sortOrder ?? 99
    if (sa !== sb) return sa - sb
    return a.id - b.id
  })
}

async function fetchImagesForProduct(productId: number): Promise<IdeasoftProductImageRow[]> {
  const params = new URLSearchParams({
    product: String(productId),
    limit: '100',
    page: '1',
    sort: 'id',
  })
  const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_images?${params}`)
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) return []
  const { items } = extractProductImagesList(data)
  return sortImagesForProduct(items)
}

async function fetchSpecialInfoStatusForProduct(productId: number): Promise<SpecialInfoStatus> {
  const params = new URLSearchParams({
    product: String(productId),
    limit: '100',
    page: '1',
    sort: 'id',
  })
  const specialRes = await fetch(`${API_URL}/api/ideasoft/admin-api/product_special_infos?${params}`)
  const specialData = await parseJsonResponse<unknown>(specialRes)
  const specialItems = specialRes.ok ? extractSpecialInfoList(specialData) : []
  const titlePreview = specialItems.map((item) => plainTextFromMaybeHtml(item.title)).find(Boolean) ?? ''
  const contentPreview = specialItems.map((item) => plainTextFromMaybeHtml(item.content)).find(Boolean) ?? ''
  return {
    hasTitle: titlePreview.length > 0,
    hasContent: contentPreview.length > 0,
    titlePreview,
    contentPreview,
  }
}

async function fetchSpecialInfoRowsForProduct(productId: number): Promise<Ideasoft2ProductSpecialInfoRow[]> {
  const params = new URLSearchParams({
    product: String(productId),
    limit: '100',
    page: '1',
    sort: 'id',
  })
  const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_special_infos?${params}`)
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) {
    throw new Error(
      formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) ||
        'Özel bilgi alanı yüklenemedi'
    )
  }
  return extractSpecialInfoList(data)
}

async function saveSpecialTitleForProduct(productId: number, rawTitle: string): Promise<void> {
  const title = rawTitle.trim() || DEFAULT_SPECIAL_TITLE
  const rows = await fetchSpecialInfoRowsForProduct(productId)
  const row = rows[0] ?? null
  const payload = {
    ...(row ?? {}),
    title,
    content: row?.content ?? '',
    status: row?.status ?? 1,
    product: row?.product ?? { id: productId },
  }
  const res = await fetch(
    row
      ? `${API_URL}/api/ideasoft/admin-api/product_special_infos/${row.id}`
      : `${API_URL}/api/ideasoft/admin-api/product_special_infos`,
    {
      method: row ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) {
    throw new Error(
      formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) ||
        'Özel başlık kaydedilemedi'
    )
  }
}

async function readClipboardHtmlOrText(): Promise<string> {
  const clipboard = navigator.clipboard as
    | (Clipboard & {
        read?: () => Promise<
          Array<{ types: readonly string[]; getType: (type: string) => Promise<Blob> }>
        >
      })
    | undefined
  if (!clipboard) throw new Error('Pano erişimi desteklenmiyor')

  if (typeof clipboard.read === 'function') {
    try {
      const items = await clipboard.read()
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html')
          return blob.text()
        }
      }
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          return blob.text()
        }
      }
    } catch {
      // Bazı tarayıcılar read() yerine yalnızca readText() izni verir.
    }
  }

  if (typeof clipboard.readText === 'function') return clipboard.readText()
  throw new Error('Pano okunamadı')
}

async function saveSpecialContentForProduct(productId: number, html: string): Promise<void> {
  const rows = await fetchSpecialInfoRowsForProduct(productId)
  const row = rows[0] ?? null
  const title = plainTextFromMaybeHtml(row?.title) ? String(row?.title ?? '') : DEFAULT_SPECIAL_TITLE
  const payload = {
    ...(row ?? {}),
    title,
    content: html,
    status: row?.status ?? 1,
    product: row?.product ?? { id: productId },
  }
  const res = await fetch(
    row
      ? `${API_URL}/api/ideasoft/admin-api/product_special_infos/${row.id}`
      : `${API_URL}/api/ideasoft/admin-api/product_special_infos`,
    {
      method: row ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) {
    throw new Error(
      formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) ||
        'Özel içerik kaydedilemedi'
    )
  }
}

function parseFxInput(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = parseFloat(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * IdeaSoft: discountType 0 = sabit tutar, 1 = yüzde.
 * İskontolu net fiyat, ürünün para biriminde.
 */
function netPriceAfterDiscount(row: Ideasoft2ProductListRow): number | null {
  const p = row.price1
  if (p == null || !Number.isFinite(Number(p))) return null
  const price = Number(p)
  const d = row.discount != null ? Number(row.discount) : 0
  const dt = row.discountType ?? 1
  if (!Number.isFinite(d) || d <= 0) return price
  if (dt === 0) return Math.max(0, price - d)
  return Math.max(0, price * (1 - d / 100))
}

function currencyKey(row: Ideasoft2ProductListRow): 'TRY' | 'EUR' | 'USD' | 'OTHER' {
  const raw = (row.currency?.abbr || row.currency?.label || '').trim().toUpperCase()
  if (!raw) return 'OTHER'
  if (raw === 'TRY' || raw === 'TL' || raw === '₺') return 'TRY'
  if (raw === 'EUR' || raw === '€' || raw === 'EURO') return 'EUR'
  if (raw === 'USD' || raw === '$' || raw === 'US' || raw === 'DOLAR') return 'USD'
  return 'OTHER'
}

/**
 * İskontolu net tutarı mağazada gösterilecek şekilde KDV dahile çevirir.
 * taxIncluded === 0 ise net KDV hariç kabul edilip KDV eklenir; 1 veya belirsiz ise aynen.
 */
function toTaxInclusiveAmount(net: number, row: Ideasoft2ProductListRow): number {
  const ti = row.taxIncluded
  if (ti === 0) {
    const rate = row.tax != null ? Number(row.tax) : 0
    if (!Number.isFinite(rate) || rate < 0) return net
    return net * (1 + rate / 100)
  }
  return net
}

function netPriceInTry(
  net: number,
  row: Ideasoft2ProductListRow,
  eurTry: number | null,
  usdTry: number | null
): number | null {
  const k = currencyKey(row)
  if (k === 'TRY') return net
  if (k === 'EUR') {
    if (eurTry == null) return null
    return net * eurTry
  }
  if (k === 'USD') {
    if (usdTry == null) return null
    return net * usdTry
  }
  return null
}

/** Tüm iskontolar % ile; sabit tutarda liste fiyatına göre eşdeğer yüzde. */
function formatDiscountCell(row: Ideasoft2ProductListRow): string {
  const d = row.discount
  if (d == null || !Number.isFinite(Number(d)) || Number(d) <= 0) return '—'
  const dt = row.discountType ?? 1
  const dNum = Number(d)

  if (dt === 0) {
    const p1 = row.price1 != null ? Number(row.price1) : NaN
    if (!Number.isFinite(p1) || p1 <= 0) return '—'
    const pct = (dNum / p1) * 100
    if (!Number.isFinite(pct)) return '—'
    return `${pct.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
  }

  return `${dNum.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`
}

function formatMoneyTr(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** IdeaSoft liste fiyatı (price1 + para birimi) */
function formatIdeasoftListPrice(row: Ideasoft2ProductListRow): string | null {
  const p = row.price1
  if (p == null || !Number.isFinite(Number(p))) return null
  const price = Number(p)
  const abbr = row.currency?.abbr?.trim()
  return `${formatMoneyTr(price)}${abbr ? ` ${abbr}` : ''}`
}

function displayProductName(row: Ideasoft2ProductListRow): string {
  const n = (row.fullName || row.name || '').trim()
  return n || '—'
}

function targetKeywordForRow(row: Ideasoft2ProductListRow): string {
  return extractIdeasoftProductSearchKeywords(row as unknown as Record<string, unknown>)
}

function plainTextFromMaybeHtml(raw: unknown): string {
  if (raw == null) return ''
  const text = Array.isArray(raw)
    ? raw.map(plainTextFromMaybeHtml).filter(Boolean).join(' ')
    : typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>).map(plainTextFromMaybeHtml).filter(Boolean).join(' ')
      : String(raw)
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detailDescriptionForRow(row: Ideasoft2ProductListRow): string {
  const raw = row as unknown as Record<string, unknown>
  const detail = raw.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const detailObj = detail as Record<string, unknown>
    const detailText = plainTextFromMaybeHtml(detailObj.details ?? detailObj.description)
    if (detailText) return detailText
  }
  for (const key of ['details', 'description', 'detailDescription', 'fullDescription'] as const) {
    const text = plainTextFromMaybeHtml(raw[key])
    if (text) return text
  }
  return ''
}

/** Master ürünler ile IdeaSoft SKU eşlemesi (trim + küçük harf). */
function normalizeSkuKey(raw: string | undefined | null): string {
  return (raw ?? '').trim().toLowerCase()
}

interface MasterProductSkuRow {
  id: number
  name: string
  sku: string
  ideasoft_product_id: number | null
}

type SkuMatchUi =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'no_sku' }
  | { kind: 'no_master' }
  | { kind: 'duplicate'; masters: MasterProductSkuRow[] }
  | { kind: 'id_mismatch'; master: MasterProductSkuRow; boundId: number }
  | { kind: 'ok'; master: MasterProductSkuRow }

function masterIdForProductDetailModal(
  row: Ideasoft2ProductListRow,
  byKey: Map<string, MasterProductSkuRow[]>,
  status: 'idle' | 'loading' | 'ready' | 'error'
): number | null {
  const m = resolveSkuMatch(row, byKey, status)
  if (m.kind === 'ok' || m.kind === 'id_mismatch') return m.master.id
  return null
}

function resolveSkuMatch(
  row: Ideasoft2ProductListRow,
  byKey: Map<string, MasterProductSkuRow[]>,
  masterStatus: 'idle' | 'loading' | 'ready' | 'error'
): SkuMatchUi {
  if (masterStatus === 'idle' || masterStatus === 'loading') return { kind: 'loading' }
  if (masterStatus === 'error') return { kind: 'error' }
  const k = normalizeSkuKey(row.sku)
  if (!k) return { kind: 'no_sku' }
  const list = byKey.get(k)
  if (!list?.length) return { kind: 'no_master' }
  if (list.length > 1) return { kind: 'duplicate', masters: list }
  const master = list[0]
  const ip = master.ideasoft_product_id
  if (ip != null && ip > 0 && ip !== row.id) {
    return { kind: 'id_mismatch', master, boundId: ip }
  }
  return { kind: 'ok', master }
}

async function fetchMasterProductsSkuIndex(): Promise<Map<string, MasterProductSkuRow[]>> {
  const byKey = new Map<string, MasterProductSkuRow[]>()
  let page = 1
  const limit = 500
  let total = 0
  let hasMore = true
  while (hasMore) {
    const res = await fetch(
      `${API_URL}/api/products/sku-index?page=${page}&limit=${limit}`
    )
    const json = await parseJsonResponse<{ data?: unknown[]; total?: number }>(res)
    if (!res.ok) {
      const msg =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error?: string }).error)
          : 'Master ürün listesi alınamadı'
      throw new Error(msg)
    }
    const rows = Array.isArray(json.data) ? json.data : []
    total = typeof json.total === 'number' ? json.total : rows.length
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue
      const o = raw as Record<string, unknown>
      const id = typeof o.id === 'number' ? o.id : parseInt(String(o.id ?? ''), 10)
      if (!Number.isFinite(id)) continue
      const skuRaw = o.sku
      const sku = skuRaw == null ? '' : String(skuRaw)
      const k = normalizeSkuKey(sku)
      if (!k) continue
      const name = o.name != null ? String(o.name) : ''
      let ideasoft_product_id: number | null = null
      if (o.ideasoft_product_id != null && o.ideasoft_product_id !== '') {
        const ip = Number(o.ideasoft_product_id)
        ideasoft_product_id = Number.isFinite(ip) && ip > 0 ? ip : null
      }
      const entry: MasterProductSkuRow = { id, name, sku, ideasoft_product_id }
      const arr = byKey.get(k) ?? []
      arr.push(entry)
      byKey.set(k, arr)
    }
    if (rows.length < limit || page * limit >= total) hasMore = false
    else page += 1
  }
  return byKey
}

export function Ideasoft2ProductsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft2-products-v1', listDefaults)
  const { search, categoryPath, page, pageSize, fitLimit } = listState
  const contentRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<Ideasoft2ProductListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [imageByProductId, setImageByProductId] = useState<Record<number, IdeasoftProductImageRow[]>>({})
  const [specialInfoStatusByProductId, setSpecialInfoStatusByProductId] = useState<Record<number, SpecialInfoStatus>>({})
  const [masterSkuByKey, setMasterSkuByKey] = useState<Map<string, MasterProductSkuRow[]>>(() => new Map())
  const [masterSkuStatus, setMasterSkuStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [masterSkuError, setMasterSkuError] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<Ideasoft2ProductListRow | null>(null)
  const [detailInitialPanel, setDetailInitialPanel] = useState<Ideasoft2ProductDetailInitialPanel>('genel')
  const [detailFocusField, setDetailFocusField] = useState<Ideasoft2ProductDetailFocusField | null>(null)
  const [detailSpecialInfoOnly, setDetailSpecialInfoOnly] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(() => new Set())
  const [bulkSpecialTitleOpen, setBulkSpecialTitleOpen] = useState(false)
  const [bulkSpecialTitleDraft, setBulkSpecialTitleDraft] = useState(DEFAULT_SPECIAL_TITLE)
  const [bulkSpecialTitleSaving, setBulkSpecialTitleSaving] = useState(false)
  const [specialContentSavingIds, setSpecialContentSavingIds] = useState<Set<number>>(() => new Set())

  /** Manuel EUR/USD kurları — tarayıcıda kalıcı (ilk yüklemede boş string ile üzerine yazma hatası giderildi) */
  const [manualFx, setManualFx] = useState(() => getInitialFxFromStorage())

  useEffect(() => {
    try {
      localStorage.setItem(
        FX_STORAGE_KEY,
        JSON.stringify({ eur: manualFx.eur, usd: manualFx.usd })
      )
    } catch {
      /* ignore */
    }
  }, [manualFx])

  const eurTry = parseFxInput(manualFx.eur)
  const usdTry = parseFxInput(manualFx.usd)

  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))

  const selectedRows = useMemo(
    () => items.filter((row) => selectedProductIds.has(row.id)),
    [items, selectedProductIds]
  )
  const allVisibleSelected =
    items.length > 0 && items.every((row) => selectedProductIds.has(row.id))

  const buildListParams = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: 'id',
    })
    if (search.trim()) params.set('s', search.trim())
    const catLeaf =
      categoryPath.length > 0 ? categoryPath[categoryPath.length - 1]! : null
    if (catLeaf != null && catLeaf > 0) params.set('category_id', String(catLeaf))
    return params
  }, [page, limit, search, categoryPath])

  const openDetailModal = useCallback(
    (
      row: Ideasoft2ProductListRow,
      panel: Ideasoft2ProductDetailInitialPanel = 'genel',
      focusField: Ideasoft2ProductDetailFocusField | null = null,
      specialInfoOnly = false
    ) => {
      setDetailInitialPanel(panel)
      setDetailFocusField(focusField)
      setDetailSpecialInfoOnly(specialInfoOnly)
      setDetailRow(row)
    },
    []
  )

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    const text = value.trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toastSuccess(`${label} kopyalandı`, text)
    } catch (e) {
      toastError(`${label} kopyalanamadı`, e)
    }
  }, [])

  const refreshSpecialInfoStatusForRow = useCallback(async (productId: number) => {
    try {
      const status = await fetchSpecialInfoStatusForProduct(productId)
      setSpecialInfoStatusByProductId((prev) => ({ ...prev, [productId]: status }))
    } catch {
      setSpecialInfoStatusByProductId((prev) => ({
        ...prev,
        [productId]: { hasTitle: false, hasContent: false, titlePreview: '', contentPreview: '' },
      }))
    }
  }, [])

  const toggleProductSelection = useCallback((productId: number, checked: boolean) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(productId)
      else next.delete(productId)
      return next
    })
  }, [])

  const toggleVisibleSelection = useCallback(
    (checked: boolean) => {
      setSelectedProductIds((prev) => {
        const next = new Set(prev)
        for (const row of items) {
          if (checked) next.add(row.id)
          else next.delete(row.id)
        }
        return next
      })
    },
    [items]
  )

  const openBulkSpecialTitleModal = useCallback(() => {
    setBulkSpecialTitleDraft(DEFAULT_SPECIAL_TITLE)
    setBulkSpecialTitleOpen(true)
  }, [])

  const saveBulkSpecialTitle = useCallback(async () => {
    const productIds = selectedRows.map((row) => row.id)
    if (productIds.length === 0) return
    setBulkSpecialTitleSaving(true)
    try {
      await Promise.all(productIds.map((productId) => saveSpecialTitleForProduct(productId, bulkSpecialTitleDraft)))
      const statusEntries = await Promise.all(
        productIds.map(async (productId) => {
          const status = await fetchSpecialInfoStatusForProduct(productId)
          return [productId, status] as const
        })
      )
      setSpecialInfoStatusByProductId((prev) => {
        const next = { ...prev }
        for (const [productId, status] of statusEntries) next[productId] = status
        return next
      })
      toastSuccess('Özel başlık güncellendi', `${productIds.length} ürün işlendi.`)
      setBulkSpecialTitleOpen(false)
      setSelectedProductIds((prev) => {
        const next = new Set(prev)
        for (const productId of productIds) next.delete(productId)
        return next
      })
    } catch (e) {
      toastError('Özel başlık toplu güncellenemedi', e)
    } finally {
      setBulkSpecialTitleSaving(false)
    }
  }, [bulkSpecialTitleDraft, selectedRows])

  const pasteClipboardToSpecialContent = useCallback(
    async (row: Ideasoft2ProductListRow) => {
      setSpecialContentSavingIds((prev) => new Set(prev).add(row.id))
      try {
        const html = await readClipboardHtmlOrText()
        if (!html.trim()) throw new Error('Panoda kaydedilecek içerik yok')
        await saveSpecialContentForProduct(row.id, html)
        await refreshSpecialInfoStatusForRow(row.id)
        toastSuccess('Özel içerik kaydedildi', `${displayProductName(row)} için panodaki içerik aktarıldı.`)
      } catch (e) {
        toastError('Özel içerik kaydedilemedi', e)
      } finally {
        setSpecialContentSavingIds((prev) => {
          const next = new Set(prev)
          next.delete(row.id)
          return next
        })
      }
    },
    [refreshSpecialInfoStatusForRow]
  )

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    setImageByProductId({})
    setSpecialInfoStatusByProductId({})
    try {
      const params = buildListParams()
      /** Sunucu `/products/count` ile hydra:totalItems birleştirir; count’a page/limit gitmez (toplam kayıt doğru kalır). */
      const res = await fetch(`${API_URL}/api/ideasoft2/products?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı'
        )
        setItems([])
        setTotal(0)
        setImageByProductId({})
        setSpecialInfoStatusByProductId({})
        return
      }
      const { items: rows, total: t } = extractProductsList(data)
      setItems(rows)
      setTotal(t)
      if (page === 1 && data && typeof data === 'object') {
        const meta = data as Record<string, unknown>
        const src = readEsyncListTotalSource(meta)
        const n = t.toLocaleString('tr-TR')
        if (src === 'product_count') {
          toastSuccess(
            'IdeaSoft ürün toplamı',
            `Product COUNT (Admin API): ${n} kayıt — aynı liste filtreleriyle sayım.`
          )
        } else if (src === 'list_hydra') {
          toastSuccess(
            'IdeaSoft ürün toplamı',
            `COUNT yok veya kullanılamadı; LIST hydra:totalItems: ${n} kayıt.`
          )
        } else if (src === 'list_walk') {
          toastSuccess(
            'IdeaSoft ürün toplamı',
            `COUNT/hydra ~sayfa boyutunda kaldı; LIST ile sayfa yürüyüşü: ${n} kayıt.`
          )
        } else if (src === 'list_last_page') {
          toastSuccess(
            'IdeaSoft ürün toplamı',
            `hydra:last son sayfa LIST ile: ${n} kayıt.`
          )
        } else if (readEsyncListTotal(meta) != null) {
          toastSuccess('IdeaSoft ürün toplamı', `Toplam: ${n} kayıt.`)
        } else {
          toastSuccess('IdeaSoft ürün listesi', `Bu sayfada ${rows.length} kayıt; toplam bilgisi yok.`)
        }
      }
      const [imageEntries, specialInfoEntries] = await Promise.all([
        Promise.all(
          rows.map(async (r) => {
            const list = await fetchImagesForProduct(r.id)
            return [r.id, list] as const
          })
        ),
        Promise.all(
          rows.map(async (r) => {
            const status = await fetchSpecialInfoStatusForProduct(r.id)
            return [r.id, status] as const
          })
        ),
      ])
      const nextImages: Record<number, IdeasoftProductImageRow[]> = {}
      for (const [id, list] of imageEntries) nextImages[id] = list
      setImageByProductId(nextImages)
      const nextSpecialInfoStatus: Record<number, SpecialInfoStatus> = {}
      for (const [id, status] of specialInfoEntries) nextSpecialInfoStatus[id] = status
      setSpecialInfoStatusByProductId(nextSpecialInfoStatus)
    } catch {
      setListError('Liste alınamadı')
      setItems([])
      setTotal(0)
      setImageByProductId({})
      setSpecialInfoStatusByProductId({})
    } finally {
      setLoading(false)
    }
  }, [buildListParams, page])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  useEffect(() => {
    let cancelled = false
    setMasterSkuStatus('loading')
    setMasterSkuError(null)
    void (async () => {
      try {
        const map = await fetchMasterProductsSkuIndex()
        if (!cancelled) {
          setMasterSkuByKey(map)
          setMasterSkuStatus('ready')
        }
      } catch (e) {
        if (!cancelled) {
          setMasterSkuByKey(new Map())
          setMasterSkuStatus('error')
          setMasterSkuError(e instanceof Error ? e.message : 'Master SKU haritası yüklenemedi')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PageLayout
      title="IdeaSoft 2 › Ürünler"
      description="Kategori filtresi Admin API Product LIST `category` / `categoryIds` (seçilen düğüm ve alt kategoriler) ile daraltılır. Yayınlanan sütunu iskontolu net fiyatı KDV dahil gösterir; Master (SKU) ana ürün eşleşmesini gösterir."
      backTo="/ideasoft2"
      contentRef={contentRef}
      contentOverflow="hidden"
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <CategoryCascadeThreeSelects
            path={categoryPath}
            idPrefix="ideasoft2-prod-cat"
            onPathChange={(next) => setListState({ categoryPath: next, page: 1 })}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={selectedRows.length === 0}>
                Toplu İşlem ({selectedRows.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={openBulkSpecialTitleModal}>
                Özel Başlık güncelle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="relative w-full min-w-[200px] max-w-sm sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 pr-9"
              placeholder="Ara (s)…"
              value={search}
              onChange={(e) => setListState({ search: e.target.value, page: 1 })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void fetchList()
              }}
            />
            {search ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setListState({ search: '', page: 1 })}
                aria-label="Aramayı temizle"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <Banknote className="h-4 w-4" />
                Kur
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72 p-0"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div className="space-y-3 p-3">
                <p className="text-xs text-muted-foreground leading-snug">
                  1 EUR ve 1 USD için Türk lirası karşılığını girin. Yayınlanan (KDV dahil) tutar bu kurla TL’ye
                  çevrilir. Değerler bu tarayıcıda saklanır; tekrar girmeniz gerekmez.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="ideasoft2-fx-eur" className="text-xs">
                    1 EUR = ₺
                  </Label>
                  <Input
                    id="ideasoft2-fx-eur"
                    inputMode="decimal"
                    placeholder="örn. 36,50"
                        value={manualFx.eur}
                        onChange={(e) => setManualFx((p) => ({ ...p, eur: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ideasoft2-fx-usd" className="text-xs">
                    1 USD = ₺
                  </Label>
                  <Input
                    id="ideasoft2-fx-usd"
                    inputMode="decimal"
                    placeholder="örn. 34,20"
                        value={manualFx.usd}
                        onChange={(e) => setManualFx((p) => ({ ...p, usd: e.target.value }))}
                  />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="secondary" size="sm" onClick={() => void fetchList()}>
            Yenile
          </Button>
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
          hasFilter={search.trim().length > 0 || categoryPath.length > 0}
          showTotalInRecordRange
        />
      }
    >
      <Ideasoft2ProductDetailModal
        open={detailRow != null}
        onOpenChange={(o) => {
          if (!o) {
            setDetailRow(null)
            setDetailInitialPanel('genel')
            setDetailFocusField(null)
            setDetailSpecialInfoOnly(false)
          }
        }}
        productId={detailRow?.id ?? null}
        listPreviewName={detailRow ? displayProductName(detailRow) : undefined}
        initialPanel={detailInitialPanel}
        focusField={detailFocusField}
        specialInfoOnly={detailSpecialInfoOnly}
        onSpecialInfoSaved={(productId) => void refreshSpecialInfoStatusForRow(productId)}
        masterProductId={
          detailRow
            ? masterIdForProductDetailModal(detailRow, masterSkuByKey, masterSkuStatus)
            : null
        }
      />
      <Dialog open={bulkSpecialTitleOpen} onOpenChange={setBulkSpecialTitleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Özel Başlık Toplu Güncelle</DialogTitle>
            <DialogDescription>
              Seçili {selectedRows.length} ürünün <code>product_special_infos.title</code> alanı
              güncellenecek. Kayıt yoksa yeni özel bilgi kaydı oluşturulur.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="bulk-special-title">Özel Başlık</Label>
            <Input
              id="bulk-special-title"
              value={bulkSpecialTitleDraft}
              autoFocus
              onChange={(e) => setBulkSpecialTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !bulkSpecialTitleSaving && selectedRows.length > 0) {
                  e.preventDefault()
                  void saveBulkSpecialTitle()
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Boş bırakılırsa <strong>{DEFAULT_SPECIAL_TITLE}</strong> olarak kaydedilir.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkSpecialTitleOpen(false)}
              disabled={bulkSpecialTitleSaving}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="save"
              onClick={() => void saveBulkSpecialTitle()}
              disabled={bulkSpecialTitleSaving || selectedRows.length === 0}
            >
              {bulkSpecialTitleSaving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="flex flex-1 min-h-0 flex-col overflow-hidden border-border">
        <CardContent className="flex flex-1 min-h-0 flex-col overflow-hidden p-0">
          {listError ? (
            <div className="shrink-0 border-b border-border px-4 py-3 text-sm text-destructive">{listError}</div>
          ) : null}
          {masterSkuError ? (
            <div className="shrink-0 border-b border-border px-4 py-3 text-sm text-destructive">
              Master SKU kontrolü: {masterSkuError}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th
                    className="sticky top-0 z-20 w-[44px] border-b border-border bg-muted px-2 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))]"
                    scope="col"
                  >
                    <Checkbox
                      aria-label="Bu sayfadaki ürünleri seç"
                      checked={allVisibleSelected}
                      disabled={items.length === 0}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={toggleVisibleSelection}
                    />
                  </th>
                  <th
                    className="sticky top-0 z-20 w-[72px] border-b border-border bg-muted px-2 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))]"
                    scope="col"
                  >
                    <span className="sr-only">Görsel</span>
                    <ImageIcon className="mx-auto h-4 w-4 opacity-70" aria-hidden />
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))] min-w-[200px]">
                    Ürün
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))] min-w-[140px]">
                    <span className="block leading-tight">Master (SKU)</span>
                    <span className="block text-xs font-normal text-muted-foreground">Ana ürün eşleşmesi</span>
                  </th>
                  <th className="sticky top-0 z-20 w-[88px] border-b border-border bg-muted px-3 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    <span className="block leading-tight">Hedef</span>
                    <span className="block text-xs font-normal text-muted-foreground">Kelime</span>
                  </th>
                  <th className="sticky top-0 z-20 w-[96px] border-b border-border bg-muted px-3 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    <span className="block leading-tight">Detay</span>
                    <span className="block text-xs font-normal text-muted-foreground">Açıklama</span>
                  </th>
                  <th className="sticky top-0 z-20 w-[104px] border-b border-border bg-muted px-3 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    <span className="block leading-tight">Özel</span>
                    <span className="block text-xs font-normal text-muted-foreground">Başlık</span>
                  </th>
                  <th className="sticky top-0 z-20 w-[104px] border-b border-border bg-muted px-3 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    <span className="block leading-tight">Özel</span>
                    <span className="block text-xs font-normal text-muted-foreground">İçerik</span>
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    Stok
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    Fiyat
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    İskonto %
                  </th>
                  <th
                    className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap"
                    scope="col"
                  >
                    <span className="block leading-tight">Yayınlanan</span>
                    <span className="block text-xs font-normal text-muted-foreground">KDV dahil · TL</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                      Kayıt yok
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const skuMatch = resolveSkuMatch(row, masterSkuByKey, masterSkuStatus)
                    const net = netPriceAfterDiscount(row)
                    const published =
                      net != null && Number.isFinite(net) ? toTaxInclusiveAmount(net, row) : null
                    const tryNet =
                      published != null && Number.isFinite(published)
                        ? netPriceInTry(published, row, eurTry, usdTry)
                        : null
                    const ck = currencyKey(row)
                    const rowImages = imageByProductId[row.id] ?? []
                    const thumb = rowImages[0]
                    const imageCount = rowImages.length
                    const targetKeyword = targetKeywordForRow(row)
                    const hasTargetKeyword = targetKeyword.length > 0
                    const detailDescription = detailDescriptionForRow(row)
                    const hasDetailDescription = detailDescription.length > 0
                    const specialInfoStatus = specialInfoStatusByProductId[row.id]
                    const hasSpecialTitle = specialInfoStatus?.hasTitle ?? false
                    const hasSpecialContent = specialInfoStatus?.hasContent ?? false
                    const isSpecialContentSaving = specialContentSavingIds.has(row.id)
                    const productName = displayProductName(row)
                    const sku = (row.sku || '').trim()

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/80 transition-colors last:border-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => openDetailModal(row)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openDetailModal(row)
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${displayProductName(row)} detayı`}
                      >
                        <td className="w-[44px] px-2 py-2 text-center align-top">
                          <Checkbox
                            aria-label={`${productName} ürününü seç`}
                            checked={selectedProductIds.has(row.id)}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={(checked) => toggleProductSelection(row.id, checked)}
                          />
                        </td>
                        <td className="w-[72px] px-2 py-2 align-top">
                          <div className="relative inline-flex">
                            {thumb?.thumbUrl || thumb?.originalUrl ? (
                              <img
                                src={thumb.thumbUrl || thumb.originalUrl}
                                alt=""
                                className="h-10 w-10 rounded-full border border-border object-cover bg-muted"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            {imageCount > 1 ? (
                              <Badge
                                variant="default"
                                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center p-0 px-1 text-[10px] font-bold shadow-sm"
                                aria-label={`${imageCount} görsel`}
                              >
                                {imageCount}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-start gap-1.5 font-medium text-foreground leading-snug">
                            <span className="min-w-0 break-words">{productName}</span>
                            <button
                              type="button"
                              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              title="Ürün adını kopyala"
                              aria-label="Ürün adını kopyala"
                              onClick={(e) => {
                                e.stopPropagation()
                                void copyToClipboard(productName, 'Ürün adı')
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                            <span className="min-w-0 break-all">{sku || '—'}</span>
                            {sku ? (
                              <button
                                type="button"
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground"
                                title="Ürün kodunu kopyala"
                                aria-label="Ürün kodunu kopyala"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void copyToClipboard(sku, 'Ürün kodu')
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-xs">
                          {skuMatch.kind === 'loading' ? (
                            <span className="text-muted-foreground">…</span>
                          ) : skuMatch.kind === 'error' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : skuMatch.kind === 'no_sku' ? (
                            <Badge variant="outline" className="font-normal text-muted-foreground">
                              SKU yok
                            </Badge>
                          ) : skuMatch.kind === 'no_master' ? (
                            <Badge variant="outline" className="font-normal text-amber-700 dark:text-amber-400">
                              Master yok
                            </Badge>
                          ) : skuMatch.kind === 'duplicate' ? (
                            <span
                              className="text-destructive"
                              title={skuMatch.masters.map((m) => `#${m.id} ${m.name}`).join('; ')}
                            >
                              Çoklu master ({skuMatch.masters.map((m) => `#${m.id}`).join(', ')})
                            </span>
                          ) : skuMatch.kind === 'id_mismatch' ? (
                            <span
                              className="text-destructive"
                              title={`Bu satır IS id=${row.id}; master kaydı IS id=${skuMatch.boundId} ile bağlı`}
                            >
                              SKU eşleşir, IS id farklı (master #{skuMatch.master.id} → IS {skuMatch.boundId})
                            </span>
                          ) : (
                            <Link
                              to="/products"
                              className="inline-flex flex-col gap-0.5 text-left hover:underline"
                              title={skuMatch.master.name}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge variant="secondary" className="w-fit font-normal tabular-nums">
                                Eşleşiyor #{skuMatch.master.id}
                              </Badge>
                              {skuMatch.master.ideasoft_product_id === row.id ? (
                                <span className="text-[10px] text-muted-foreground">IS id eşleşti</span>
                              ) : skuMatch.master.ideasoft_product_id == null ||
                                skuMatch.master.ideasoft_product_id === 0 ? (
                                <span className="text-[10px] text-muted-foreground">IS id master’da boş</span>
                              ) : null}
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                            title={
                              hasTargetKeyword
                                ? `Hedef kelime: ${targetKeyword}`
                                : 'Hedef kelime boş'
                            }
                            aria-label={hasTargetKeyword ? 'Hedef kelime dolu' : 'Hedef kelime boş'}
                          >
                            {hasTargetKeyword ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                            title={
                              hasDetailDescription
                                ? `Detay açıklama dolu: ${detailDescription.slice(0, 120)}`
                                : 'Detay açıklama boş'
                            }
                            aria-label={
                              hasDetailDescription ? 'Detay açıklama dolu' : 'Detay açıklama boş'
                            }
                          >
                            {hasDetailDescription ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-muted"
                            title={
                              hasSpecialTitle
                                ? `Özel bilgi başlık dolu: ${specialInfoStatus?.titlePreview.slice(0, 120)}`
                                : 'Özel bilgi başlık boş'
                            }
                            aria-label={
                              hasSpecialTitle ? 'Özel bilgi başlık dolu' : 'Özel bilgi başlık boş'
                            }
                            onClick={(e) => {
                              e.stopPropagation()
                              openDetailModal(row, 'ozelBilgi', 'specialTitle', true)
                            }}
                          >
                            {hasSpecialTitle ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-muted"
                            title={
                              isSpecialContentSaving
                                ? 'Panodaki özel içerik kaydediliyor'
                                : hasSpecialContent
                                ? `Özel bilgi içerik dolu: ${specialInfoStatus?.contentPreview.slice(0, 120)}`
                                : 'Panodaki HTML içeriği özel içerik alanına kaydet'
                            }
                            aria-label={
                              isSpecialContentSaving
                                ? 'Panodaki özel içerik kaydediliyor'
                                : hasSpecialContent
                                  ? 'Özel bilgi içerik dolu'
                                  : 'Özel bilgi içerik boş'
                            }
                            disabled={isSpecialContentSaving}
                            onClick={(e) => {
                              e.stopPropagation()
                              void pasteClipboardToSpecialContent(row)
                            }}
                          >
                            {hasSpecialContent ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums align-top">
                          {row.stockAmount != null && Number.isFinite(Number(row.stockAmount))
                            ? String(row.stockAmount)
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums align-top">
                          {formatIdeasoftListPrice(row) ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-top">
                          {formatDiscountCell(row)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium align-top">
                          {tryNet != null && Number.isFinite(tryNet) ? (
                            <>₺{formatMoneyTr(tryNet)}</>
                          ) : ck === 'OTHER' ? (
                            <span className="text-muted-foreground font-normal text-xs">Kur tanımsız</span>
                          ) : (ck === 'EUR' && eurTry == null) || (ck === 'USD' && usdTry == null) ? (
                            <span className="text-muted-foreground font-normal text-xs">Kur girin</span>
                          ) : (
                            '—'
                          )}
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
    </PageLayout>
  )
}
