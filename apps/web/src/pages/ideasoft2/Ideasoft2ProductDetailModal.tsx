import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { Label } from '@/components/ui/label'
import { toastError, toastSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { buildIdeasoftProductCategoryBreadcrumbs } from './ideasoft2-product-category-breadcrumb'
import { summarizeProductEmbeddedExtraColumn } from './ideasoft2-product-features-list'
import {
  formatIdeasoftProductPriceLine,
  readIdeasoftStockTypeLabel,
  readMasterCurrencyLabel,
  readMasterListPrice,
  readMasterUnitName,
  priceAfterUserDiscount,
  formatMoneyTr,
} from './ideasoft2-product-detail-pricing'

type ActivePanel =
  | 'genel'
  | 'fiyatlar'
  | 'urunOzellikleri'
  | 'varyantSecenekleri'
  | 'ekstraAlanlar'
  | 'ozelBilgi'
  | 'tumAlanlar'
export type Ideasoft2ProductDetailInitialPanel = ActivePanel
export type Ideasoft2ProductDetailFocusField = 'specialTitle' | 'specialContent'
type SpecialContentMode = 'normal' | 'html'
const DEFAULT_SPECIAL_TITLE = 'Teknik Özellikler'

type FieldRow = {
  path: string
  value: string
}

interface ProductExtraInfoRow {
  id: number
  value?: unknown
  extraInfo?: { id?: number; name?: unknown; sortOrder?: number }
}

interface ProductExtraFieldRow {
  id: number
  product?: Record<string, unknown>
  varKey?: unknown
  var_key?: unknown
  varValue?: unknown
  var_value?: unknown
}

interface ProductSpecialInfoRow {
  id: number
  title?: unknown
  content?: unknown
  status?: unknown
  product?: Record<string, unknown>
}

interface ProductDetailRow {
  id: number
  sku?: string
  details?: unknown
  extraDetails?: unknown
  product?: Record<string, unknown>
}

function formatStockOneLine(p: Record<string, unknown>): string {
  const sa = p.stockAmount
  if (sa == null) return '—'
  const n = typeof sa === 'number' ? sa : parseFloat(String(sa))
  if (!Number.isFinite(n)) return '—'
  const unit = p.stockTypeLabel
  const u = typeof unit === 'string' && unit.trim() ? unit.trim() : 'Piece'
  return `${n.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${u}`
}

function formatRawFieldValue(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'string') return value.trim() || '""'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatNestedProductRef(product: unknown): string {
  if (product == null || product === '') return '—'
  if (typeof product !== 'object' || Array.isArray(product)) {
    return typeof product === 'string' ? (product.trim() || '—') : formatRawFieldValue(product)
  }
  const o = product as Record<string, unknown>
  const pid = o.id
  if (pid != null && String(pid).trim()) return `#${String(pid).trim()}`
  return formatRawFieldValue(product)
}

function readProductExtraVarKey(row: ProductExtraFieldRow): string {
  const raw = row as unknown as Record<string, unknown>
  const v = row.varKey ?? row.var_key ?? raw.varKey ?? raw.var_key
  const s =
    typeof v === 'string' ? v.trim() : v != null && v !== '' ? String(v).trim() : ''
  return s || '—'
}

function readProductExtraVarValue(row: ProductExtraFieldRow): string {
  const raw = row as unknown as Record<string, unknown>
  const v = row.varValue ?? row.var_value ?? raw.varValue ?? raw.var_value
  if (typeof v === 'string') return v.trim() || '—'
  if (v == null || v === '') return '—'
  return typeof v === 'number' || typeof v === 'boolean' ? String(v) : formatRawFieldValue(v)
}

function flattenRawFields(value: unknown, prefix = ''): FieldRow[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ path: prefix, value: '[]' }]
    return value.flatMap((item, index) => flattenRawFields(item, `${prefix}[${index}]`))
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return [{ path: prefix, value: '{}' }]
    return entries.flatMap(([key, child]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key
      return flattenRawFields(child, nextPrefix)
    })
  }
  return [{ path: prefix || 'value', value: formatRawFieldValue(value) }]
}

function readStringFieldFromObject(raw: unknown, key: string): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  const value = (raw as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readRecordArrayField(raw: unknown, key: string): Record<string, unknown>[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const value = (raw as Record<string, unknown>)[key]
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item != null && typeof item === 'object' && !Array.isArray(item)
      )
    : []
}

/** `optionGroups[].options` — varyant seçenekleri */
function readNestedVariantOptions(group: Record<string, unknown>): Record<string, unknown>[] {
  const a = readRecordArrayField(group, 'options')
  return a.length > 0 ? a : readRecordArrayField(group, 'option')
}

function pickVariantField(o: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(o, k)) {
      return o[k]
    }
  }
  return undefined
}

function variantOptionCellText(v: unknown): string {
  if (v === undefined) return '—'
  if (v === null) return 'null'
  if (typeof v === 'string') return v.trim() || '—'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return formatRawFieldValue(v)
}

function formatVariantOptionGroupCell(og: unknown): { summary: string; json: string | null } {
  if (og == null) return { summary: '—', json: null }
  if (typeof og !== 'object' || Array.isArray(og)) {
    return { summary: variantOptionCellText(og), json: null }
  }
  const o = og as Record<string, unknown>
  const id = o.id
  const title =
    typeof o.title === 'string'
      ? o.title.trim()
      : typeof o.name === 'string'
        ? o.name.trim()
        : ''
  const parts: string[] = []
  if (id != null && String(id).trim()) parts.push(`#${String(id).trim()}`)
  if (title) parts.push(title)
  const summary = parts.length > 0 ? parts.join(' · ') : displayFeatureText(og)
  const json =
    typeof og === 'object' && !Array.isArray(og) ? formatRawFieldValue(og) : null
  return { summary, json }
}

function displayFeatureText(raw: unknown): string {
  if (raw == null) return '—'
  if (typeof raw === 'string') return raw.trim() || '—'
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    for (const key of ['title', 'name', 'value', 'label', 'id'] as const) {
      const v = o[key]
      if (v != null && String(v).trim()) return String(v)
    }
  }
  return formatRawFieldValue(raw)
}

function specialTitleDraftValue(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  return title || DEFAULT_SPECIAL_TITLE
}

function extractExtraInfoList(json: unknown): ProductExtraInfoRow[] {
  if (Array.isArray(json)) return json as ProductExtraInfoRow[]
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) return hydra as ProductExtraInfoRow[]
    const member = o.member
    if (Array.isArray(member)) return member as ProductExtraInfoRow[]
    if (Array.isArray(o.data)) return o.data as ProductExtraInfoRow[]
    if (Array.isArray(o.items)) return o.items as ProductExtraInfoRow[]
  }
  return []
}

function extractExtraFieldList(json: unknown): ProductExtraFieldRow[] {
  if (Array.isArray(json)) return json as ProductExtraFieldRow[]
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) return hydra as ProductExtraFieldRow[]
    const member = o.member
    if (Array.isArray(member)) return member as ProductExtraFieldRow[]
    if (Array.isArray(o.data)) return o.data as ProductExtraFieldRow[]
    if (Array.isArray(o.items)) return o.items as ProductExtraFieldRow[]
  }
  return []
}

function extractSpecialInfoList(json: unknown): ProductSpecialInfoRow[] {
  if (Array.isArray(json)) return json as ProductSpecialInfoRow[]
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) return hydra as ProductSpecialInfoRow[]
    const member = o.member
    if (Array.isArray(member)) return member as ProductSpecialInfoRow[]
    if (Array.isArray(o.data)) return o.data as ProductSpecialInfoRow[]
    if (Array.isArray(o.items)) return o.items as ProductSpecialInfoRow[]
  }
  return []
}

function extractProductDetailList(json: unknown): ProductDetailRow[] {
  if (Array.isArray(json)) return json as ProductDetailRow[]
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) return hydra as ProductDetailRow[]
    const member = o.member
    if (Array.isArray(member)) return member as ProductDetailRow[]
    if (Array.isArray(o.data)) return o.data as ProductDetailRow[]
    if (Array.isArray(o.items)) return o.items as ProductDetailRow[]
  }
  return []
}

interface Ideasoft2ProductDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: number | null
  listPreviewName?: string
  /** Master ürün id (liste sayfası SKU eşleşmesi). Yoksa aynı SKU ile `by-sku` denenir. */
  masterProductId?: number | null
  initialPanel?: Ideasoft2ProductDetailInitialPanel
  focusField?: Ideasoft2ProductDetailFocusField | null
  specialInfoOnly?: boolean
  onSpecialInfoSaved?: (productId: number) => void
}

export function Ideasoft2ProductDetailModal({
  open,
  onOpenChange,
  productId,
  listPreviewName,
  masterProductId: masterProductIdProp = null,
  initialPanel = 'genel',
  focusField = null,
  specialInfoOnly = false,
  onSpecialInfoSaved,
}: Ideasoft2ProductDetailModalProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>('genel')
  const [genel, setGenel] = useState<Record<string, unknown> | null>(null)
  const [productDetailItems, setProductDetailItems] = useState<ProductDetailRow[]>([])
  const [kategoriBreadcrumb, setKategoriBreadcrumb] = useState('—')
  const [genelLoading, setGenelLoading] = useState(false)
  const [genelError, setGenelError] = useState<string | null>(null)
  const fetchedGenelId = useRef<number | null>(null)

  const [master, setMaster] = useState<Record<string, unknown> | null>(null)
  const [masterLoading, setMasterLoading] = useState(false)
  const [masterError, setMasterError] = useState<string | null>(null)
  const [discountInput, setDiscountInput] = useState('')
  const [discountKind, setDiscountKind] = useState<'percent' | 'fixed'>('percent')
  const lastMasterLoadKey = useRef<string | null>(null)

  const [extraInfoItems, setExtraInfoItems] = useState<ProductExtraInfoRow[]>([])
  const [extraFieldItems, setExtraFieldItems] = useState<ProductExtraFieldRow[]>([])
  const [specialInfoItems, setSpecialInfoItems] = useState<ProductSpecialInfoRow[]>([])
  const [specialInfoDrafts, setSpecialInfoDrafts] = useState<Record<string, { title: string; content: string }>>({})
  const [specialInfoSavingKey, setSpecialInfoSavingKey] = useState<string | null>(null)
  const [specialContentMode, setSpecialContentMode] = useState<SpecialContentMode>('normal')
  const [extraInfoLoading, setExtraInfoLoading] = useState(false)
  const [extraInfoError, setExtraInfoError] = useState<string | null>(null)
  const fetchedExtraInfoId = useRef<number | null>(null)
  /** Özel Bilgi paket yükleme (aynı anda product_extra_fields da geliyor) */
  const bundledAttachLoadingRef = useRef(false)
  /** `product_extra_fields` bu ürün için yüklendi */
  const extraFieldsHydratedId = useRef<number | null>(null)
  const [extraFieldsPanelLoading, setExtraFieldsPanelLoading] = useState(false)
  const [extraFieldsPanelError, setExtraFieldsPanelError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setActivePanel(specialInfoOnly ? 'ozelBilgi' : initialPanel)
    setGenel(null)
    setProductDetailItems([])
    setKategoriBreadcrumb('—')
    setGenelError(null)
    fetchedGenelId.current = null
    setMaster(null)
    setMasterError(null)
    setMasterLoading(false)
    lastMasterLoadKey.current = null
    setExtraInfoItems([])
    setExtraFieldItems([])
    setSpecialInfoItems([])
    setSpecialInfoDrafts({})
    setSpecialInfoSavingKey(null)
    setSpecialContentMode('normal')
    setExtraInfoError(null)
    setExtraInfoLoading(false)
    fetchedExtraInfoId.current = null
    bundledAttachLoadingRef.current = false
    extraFieldsHydratedId.current = null
    setExtraFieldsPanelLoading(false)
    setExtraFieldsPanelError(null)
    setDiscountInput('')
    setDiscountKind('percent')
  }, [open, productId, initialPanel, specialInfoOnly])

  const loadGenel = useCallback(async (id: number) => {
    setGenelLoading(true)
    setGenelError(null)
    setGenel(null)
    setProductDetailItems([])
    setKategoriBreadcrumb('—')
    try {
      const detailParams = new URLSearchParams({
        product: String(id),
        limit: '100',
        page: '1',
        sort: 'id',
      })
      const [res, productDetailsRes] = await Promise.all([
        fetch(`${API_URL}/api/ideasoft/admin-api/products/${id}`),
        fetch(`${API_URL}/api/ideasoft/admin-api/product_details?${detailParams}`),
      ])
      const data = await parseJsonResponse<Record<string, unknown> & { error?: string; hint?: string }>(res)
      const productDetailsData = await parseJsonResponse<unknown>(productDetailsRes)
      if (!res.ok) {
        throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Ürün yüklenemedi')
      }
      setGenel(data)
      setProductDetailItems(productDetailsRes.ok ? extractProductDetailList(productDetailsData) : [])
      const k = await buildIdeasoftProductCategoryBreadcrumbs(data)
      setKategoriBreadcrumb(k)
    } catch (e) {
      setGenelError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setGenelLoading(false)
    }
  }, [])

  const loadExtraInfo = useCallback(async (id: number) => {
    bundledAttachLoadingRef.current = true
    setExtraInfoLoading(true)
    setExtraInfoError(null)
    setExtraInfoItems([])
    setExtraFieldItems([])
    setSpecialInfoItems([])
    extraFieldsHydratedId.current = null
    try {
      const params = new URLSearchParams({
        product: String(id),
        limit: '100',
        page: '1',
        sort: 'id',
      })
      const [specialRes, infoRes, fieldRes] = await Promise.all([
        fetch(`${API_URL}/api/ideasoft/admin-api/product_special_infos?${params}`),
        fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products?${params}`),
        fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields?${params}`),
      ])
      const [specialData, infoData, fieldData] = await Promise.all([
        parseJsonResponse<unknown>(specialRes),
        parseJsonResponse<unknown>(infoRes),
        parseJsonResponse<unknown>(fieldRes),
      ])
      if (!specialRes.ok) {
        throw new Error(
          formatIdeasoftProxyErrorForUi(specialData as { error?: string; hint?: string }) ||
            'Özel bilgi alanı yüklenemedi'
        )
      }
      if (!infoRes.ok) {
        throw new Error(
          formatIdeasoftProxyErrorForUi(infoData as { error?: string; hint?: string }) ||
            'Özel bilgi yüklenemedi'
        )
      }
      if (!fieldRes.ok) {
        throw new Error(
          formatIdeasoftProxyErrorForUi(fieldData as { error?: string; hint?: string }) ||
            'Ürün ekstra alanları yüklenemedi'
        )
      }
      const specialRows = extractSpecialInfoList(specialData)
      setSpecialInfoItems(specialRows)
      setSpecialInfoDrafts(
        specialRows.length > 0
          ? Object.fromEntries(
              specialRows.map((row) => [
                String(row.id),
                {
                  title: specialTitleDraftValue(row.title),
                  content: typeof row.content === 'string' ? row.content : String(row.content ?? ''),
                },
              ])
            )
          : { new: { title: DEFAULT_SPECIAL_TITLE, content: '' } }
      )
      setExtraInfoItems(extractExtraInfoList(infoData))
      const fieldRows = extractExtraFieldList(fieldData)
      setExtraFieldItems(fieldRows)
      extraFieldsHydratedId.current = id
    } catch (e) {
      setExtraInfoError(e instanceof Error ? e.message : 'Özel bilgi yüklenemedi')
    } finally {
      setExtraInfoLoading(false)
      bundledAttachLoadingRef.current = false
    }
  }, [])

  const loadExtraFieldsOnly = useCallback(async (id: number) => {
    setExtraFieldsPanelLoading(true)
    setExtraFieldsPanelError(null)
    try {
      const params = new URLSearchParams({
        product: String(id),
        limit: '100',
        page: '1',
        sort: 'id',
      })
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        throw new Error(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) ||
            'Ürün ekstra alanları alınamadı'
        )
      }
      setExtraFieldItems(extractExtraFieldList(data))
      extraFieldsHydratedId.current = id
    } catch (e) {
      setExtraFieldsPanelError(e instanceof Error ? e.message : 'Ürün ekstra alanları alınamadı')
      setExtraFieldItems([])
    } finally {
      setExtraFieldsPanelLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setActivePanel(specialInfoOnly ? 'ozelBilgi' : 'genel')
      setGenel(null)
      setProductDetailItems([])
      setKategoriBreadcrumb('—')
      setGenelError(null)
      setGenelLoading(false)
      fetchedGenelId.current = null
      setMaster(null)
      setMasterError(null)
      lastMasterLoadKey.current = null
      setExtraInfoItems([])
      setExtraFieldItems([])
      setSpecialInfoItems([])
      setSpecialInfoDrafts({})
      setSpecialInfoSavingKey(null)
      setSpecialContentMode('normal')
      setExtraInfoError(null)
      setExtraInfoLoading(false)
      fetchedExtraInfoId.current = null
      bundledAttachLoadingRef.current = false
      extraFieldsHydratedId.current = null
      setExtraFieldsPanelLoading(false)
      setExtraFieldsPanelError(null)
      return
    }
    if (productId == null) return
    if (fetchedGenelId.current === productId) return
    fetchedGenelId.current = productId
    void loadGenel(productId)
  }, [open, productId, loadGenel, specialInfoOnly])

  useEffect(() => {
    if (
      !open ||
      (activePanel !== 'ozelBilgi' && activePanel !== 'tumAlanlar' && !specialInfoOnly) ||
      productId == null
    ) return
    if (fetchedExtraInfoId.current === productId) return
    fetchedExtraInfoId.current = productId
    void loadExtraInfo(productId)
  }, [open, activePanel, productId, loadExtraInfo, specialInfoOnly])

  useEffect(() => {
    if (!open || specialInfoOnly || activePanel !== 'ekstraAlanlar' || productId == null) return
    if (extraFieldsHydratedId.current === productId) return
    if (bundledAttachLoadingRef.current && fetchedExtraInfoId.current === productId) return
    void loadExtraFieldsOnly(productId)
  }, [
    open,
    specialInfoOnly,
    activePanel,
    productId,
    loadExtraFieldsOnly,
    extraInfoLoading,
  ])

  const saveSpecialInfo = useCallback(
    async (row: ProductSpecialInfoRow | null) => {
      if (productId == null) return
      const key = row ? String(row.id) : 'new'
      const draft = specialInfoDrafts[key] ?? { title: '', content: '' }
      setSpecialInfoSavingKey(key)
      try {
        const title = draft.title.trim() || DEFAULT_SPECIAL_TITLE
        const payload = {
          ...(row ?? {}),
          title,
          content: draft.content,
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
              'Özel bilgi kaydedilemedi'
          )
        }
        toastSuccess('Özel bilgi kaydedildi')
        onSpecialInfoSaved?.(productId)
        onOpenChange(false)
      } catch (e) {
        toastError('Özel bilgi kaydedilemedi', e)
      } finally {
        setSpecialInfoSavingKey(null)
      }
    },
    [onOpenChange, onSpecialInfoSaved, productId, specialInfoDrafts]
  )

  const loadMasterForFiyat = useCallback(
    async (idHint: number | null, sku: string) => {
      setMasterLoading(true)
      setMasterError(null)
      setMaster(null)
      try {
        let id: number | null = idHint != null && idHint > 0 ? idHint : null
        if (id == null) {
          if (!sku) return
          const res = await fetch(`${API_URL}/api/products/by-sku?sku=${encodeURIComponent(sku)}`)
          const bySku = await parseJsonResponse<
            { id?: number; error?: string } | { error: string } | null
          >(res)
          if (!res.ok) {
            const err =
              (bySku as { error?: string } | null | undefined)?.error ?? 'Master aranamadı'
            throw new Error(err)
          }
          if (bySku == null || typeof bySku !== 'object' || (bySku as { id?: number }).id == null) {
            return
          }
          const rid = Number((bySku as { id: number }).id)
          if (!Number.isFinite(rid) || rid <= 0) return
          id = rid
        }
        const dRes = await fetch(`${API_URL}/api/products/${id}`)
        const detail = await parseJsonResponse<Record<string, unknown> & { error?: string }>(dRes)
        if (!dRes.ok) {
          throw new Error(detail.error || 'Master ürün yüklenemedi')
        }
        setMaster(detail)
      } catch (e) {
        setMasterError(e instanceof Error ? e.message : 'Yüklenemedi')
      } finally {
        setMasterLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (activePanel !== 'fiyatlar') lastMasterLoadKey.current = null
  }, [activePanel])

  useEffect(() => {
    if (!open || activePanel !== 'fiyatlar' || genel == null) return
    const sku = String(genel.sku ?? '').trim()
    const key = `${productId ?? ''}|${masterProductIdProp ?? 'x'}|${sku}`
    if (lastMasterLoadKey.current === key) return
    lastMasterLoadKey.current = key
    const hint =
      masterProductIdProp != null && masterProductIdProp > 0 ? masterProductIdProp : null
    void loadMasterForFiyat(hint, sku)
  }, [open, activePanel, genel, productId, masterProductIdProp, loadMasterForFiyat])

  const displayName = genel
    ? String(
        (typeof genel.fullName === 'string' && genel.fullName.trim()
          ? genel.fullName
          : genel.name) ?? ''
      ).trim() || '—'
    : (listPreviewName || '').trim() || '—'

  const masterBase = master != null ? readMasterListPrice(master) : null
  const masterCalc =
    masterBase != null
      ? priceAfterUserDiscount(masterBase, discountInput, discountKind)
      : null
  const selectionGroups = useMemo(() => readRecordArrayField(genel, 'selectionGroups'), [genel])
  const optionGroups = useMemo(() => {
    if (!genel || typeof genel !== 'object' || Array.isArray(genel)) return []
    const camel = readRecordArrayField(genel, 'optionGroups')
    return camel.length > 0 ? camel : readRecordArrayField(genel, 'option_groups')
  }, [genel])
  const variantOptionBlocks = useMemo(
    () =>
      optionGroups.map((group, groupIndex) => ({
        groupIndex,
        options: readNestedVariantOptions(group),
        groupTitle: displayFeatureText(
          group.title ?? group.name ?? group.label ?? `Varyant grubu ${groupIndex + 1}`
        ),
      })),
    [optionGroups]
  )
  const hasVariantOptionsListed = variantOptionBlocks.some((b) => b.options.length > 0)
  const rawFieldRows = useMemo(() => {
    const rows = genel ? flattenRawFields(genel) : []
    const productDetailRows = productDetailItems.flatMap((item, index) =>
      flattenRawFields(item, `product_details[${index}]`)
    )
    const specialRows = specialInfoItems.flatMap((item, index) =>
      flattenRawFields(item, `product_special_infos[${index}]`)
    )
    return [...rows, ...productDetailRows, ...specialRows]
  }, [genel, productDetailItems, specialInfoItems])
  const firstProductDetail = productDetailItems[0]
  const productDetailsDetails =
    typeof firstProductDetail?.details === 'string' ? firstProductDetail.details.trim() : ''
  const productDetailsExtraDetails =
    typeof firstProductDetail?.extraDetails === 'string' ? firstProductDetail.extraDetails.trim() : ''
  const detailDetails = productDetailsDetails || (genel ? readStringFieldFromObject(genel.detail, 'details') : '')
  const detailExtraDetails =
    productDetailsExtraDetails || (genel ? readStringFieldFromObject(genel.detail, 'extraDetails') : '')
  const visibleRawFieldRows = useMemo(() => {
    const byPath = new Map(rawFieldRows.map((row) => [row.path, row]))
    if (!byPath.has('product_details[0].details')) {
      byPath.set('product_details[0].details', {
        path: 'product_details[0].details',
        value: detailDetails || '—',
      })
    }
    if (!byPath.has('product_details[0].extraDetails')) {
      byPath.set('product_details[0].extraDetails', {
        path: 'product_details[0].extraDetails',
        value: detailExtraDetails || '—',
      })
    }
    return [...byPath.values()]
  }, [detailDetails, detailExtraDetails, rawFieldRows])

  const genelEmbeddedExtras = useMemo(() => {
    if (!genel || typeof genel !== 'object' || Array.isArray(genel)) return null
    return summarizeProductEmbeddedExtraColumn(genel as Record<string, unknown>)
  }, [genel])

  const genelExtraInfoRootsLen = useMemo(() => {
    if (!genel || typeof genel !== 'object' || Array.isArray(genel)) return 0
    const g = genel as Record<string, unknown>
    const roots = g.extraInfos ?? g.extra_infos
    return Array.isArray(roots) ? roots.length : 0
  }, [genel])

  const genelExtraFieldRowsLen = useMemo(() => {
    if (!genel || typeof genel !== 'object' || Array.isArray(genel)) return 0
    const g = genel as Record<string, unknown>
    const pf = g.productExtraFields ?? g.product_extra_fields
    return Array.isArray(pf) ? pf.length : 0
  }, [genel])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[min(90vh,760px)] flex flex-col">
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle className="line-clamp-2">
            {specialInfoOnly
              ? focusField === 'specialTitle'
                ? 'Özel Bilgi Başlığı'
                : 'Özel Bilgi İçeriği'
              : genel
                ? displayName
                : (listPreviewName || '').trim() || 'IdeaSoft ürünü'}
          </DialogTitle>
          {productId != null ? (
            <DialogDescription className="font-mono text-xs">IdeaSoft ürün #{productId}</DialogDescription>
          ) : null}
        </DialogHeader>

        {!specialInfoOnly ? (
        <div className="flex shrink-0 gap-1 border-b border-border p-0.5" aria-label="Ürün detay bölümleri">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'genel' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'genel'}
            onClick={() => setActivePanel('genel')}
          >
            Genel
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'fiyatlar' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'fiyatlar'}
            onClick={() => setActivePanel('fiyatlar')}
          >
            Fiyatlar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'urunOzellikleri' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'urunOzellikleri'}
            onClick={() => setActivePanel('urunOzellikleri')}
          >
            Ürün Özellikleri
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'varyantSecenekleri' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'varyantSecenekleri'}
            onClick={() => setActivePanel('varyantSecenekleri')}
          >
            Varyant seçenekleri
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'ekstraAlanlar' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'ekstraAlanlar'}
            onClick={() => setActivePanel('ekstraAlanlar')}
          >
            Ekstra Alanlar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'ozelBilgi' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'ozelBilgi'}
            onClick={() => setActivePanel('ozelBilgi')}
          >
            Özel Bilgi
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'tumAlanlar' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'tumAlanlar'}
            onClick={() => setActivePanel('tumAlanlar')}
          >
            Tüm Alanlar
          </Button>
        </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto text-sm">
          {activePanel === 'genel' && genelLoading && (
            <p className="text-muted-foreground">Yükleniyor…</p>
          )}

          {activePanel === 'genel' && !genelLoading && genelError && (
            <p className="text-destructive">{genelError}</p>
          )}

          {activePanel === 'genel' && !genelLoading && !genelError && genel && (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Ürün kodu (SKU)</Label>
                <p className="font-mono text-foreground break-all">{String(genel.sku ?? '—')}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Barkod</Label>
                <p className="font-mono text-foreground break-all">{String(genel.barcode ?? '—')}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Stok</Label>
                <p className="text-foreground whitespace-nowrap tabular-nums">{formatStockOneLine(genel)}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Ürün adı</Label>
                <p className="text-foreground leading-snug break-words">{displayName}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">IdeaSoft kategori</Label>
                <p className="text-foreground leading-snug break-words whitespace-pre-line">
                  {kategoriBreadcrumb}
                </p>
              </div>
              {genelEmbeddedExtras != null &&
              (genelExtraInfoRootsLen > 0 ||
                genelExtraFieldRowsLen > 0 ||
                genelEmbeddedExtras.has ||
                genelEmbeddedExtras.hasEmptyGroups) ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground leading-snug">
                    Ürün özellikleri{' '}
                    <code className="text-[10px]">products.extraInfos</code>
                    {genelExtraInfoRootsLen > 0 ? (
                      <span className="block text-[10px] font-normal text-muted-foreground tabular-nums">
                        extraInfos: {genelExtraInfoRootsLen} kök
                        {genelExtraFieldRowsLen > 0
                          ? ` · product_extra_fields: ${genelExtraFieldRowsLen}`
                          : ''}
                      </span>
                    ) : genelExtraFieldRowsLen > 0 ? (
                      <span className="block text-[10px] font-normal text-muted-foreground tabular-nums">
                        product_extra_fields: {genelExtraFieldRowsLen}
                      </span>
                    ) : null}
                  </Label>
                  {genelEmbeddedExtras.has && genelEmbeddedExtras.summary ? (
                    <p className="max-h-40 overflow-auto text-sm leading-snug break-words text-foreground">
                      {genelEmbeddedExtras.summary}
                    </p>
                  ) : genelEmbeddedExtras.hasEmptyGroups ? (
                    <p className="text-sm text-amber-800 dark:text-amber-400">
                      Kayıtlar listelenmiş; seçili değer / metin alanı çıkmıyor (children veya{' '}
                      <code className="text-xs">subExtraInfos</code> yapısı farklı olabilir).
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Özet oluşturulamadı.</p>
                  )}
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Detay açıklama <code>product_details[0].details</code>
                </Label>
                {detailDetails ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
                    {detailDetails}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Ekstra detaylar <code>product_details[0].extraDetails</code>
                </Label>
                {detailExtraDetails ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
                    {detailExtraDetails}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </div>
            </div>
          )}

          {activePanel === 'fiyatlar' && genelLoading && (
            <p className="text-muted-foreground">Yükleniyor…</p>
          )}

          {activePanel === 'fiyatlar' && !genelLoading && genelError && (
            <p className="text-destructive">{genelError}</p>
          )}

          {activePanel === 'fiyatlar' && !genelLoading && !genelError && genel && (
            <div className="space-y-5 pr-0.5">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">IdeaSoft</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Fiyat (price1)</Label>
                    <p className="font-medium tabular-nums text-foreground">
                      {formatIdeasoftProductPriceLine(genel)}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Birim</Label>
                    <p className="text-foreground">{readIdeasoftStockTypeLabel(genel)}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Master</p>
                {masterLoading ? (
                  <p className="text-sm text-muted-foreground">Master fiyat yükleniyor…</p>
                ) : null}
                {masterError ? <p className="text-sm text-destructive">{masterError}</p> : null}
                {!masterLoading && !masterError && !master ? (
                  <p className="text-sm text-muted-foreground">
                    Bu IdeaSoft SKU ile eşleşen master ürün bulunamadı.
                  </p>
                ) : null}
                {master ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <div>
                        <Label className="text-xs text-muted-foreground">Fiyat</Label>
                        <p className="font-medium tabular-nums text-foreground">
                          {masterBase != null ? formatMoneyTr(masterBase) : '—'}
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                            {readMasterCurrencyLabel(master)}
                          </span>
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Birim</Label>
                        <p className="text-foreground">{readMasterUnitName(master)}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
                      <div className="grid gap-1.5">
                        <Label htmlFor="is-modal-iskonto" className="text-xs text-muted-foreground">
                          İskonto
                        </Label>
                        <Input
                          id="is-modal-iskonto"
                          inputMode="decimal"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          placeholder="0"
                          className="tabular-nums"
                        />
                      </div>
                      <div className="grid gap-1.5 sm:min-w-[128px]">
                        <Label htmlFor="is-modal-iskonto-tur" className="text-xs text-muted-foreground">
                          Tür
                        </Label>
                        <select
                          id="is-modal-iskonto-tur"
                          aria-label="İskonto türü: yüzde veya sabit"
                          className={cn(
                            'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
                            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                          )}
                          value={discountKind}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === 'percent' || v === 'fixed') setDiscountKind(v)
                          }}
                        >
                          <option value="percent">Yüzde (%)</option>
                          <option value="fixed">Sabit tutar</option>
                        </select>
                      </div>
                      <div className="grid gap-1.5">
                        <span className="text-xs text-muted-foreground">Hesaplanan fiyat</span>
                        <p className="font-semibold tabular-nums text-foreground">
                          {masterCalc != null ? formatMoneyTr(masterCalc) : '—'}
                          {master != null && masterCalc != null ? (
                            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                              {readMasterCurrencyLabel(master)}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {activePanel === 'urunOzellikleri' && genelLoading && (
            <p className="text-muted-foreground">Ürün özellikleri yükleniyor…</p>
          )}

          {activePanel === 'urunOzellikleri' && !genelLoading && genelError && (
            <p className="text-destructive">{genelError}</p>
          )}

          {activePanel === 'urunOzellikleri' && !genelLoading && !genelError && genel && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-medium text-foreground">Ürün Özellikleri</h3>
                <p className="text-xs text-muted-foreground">
                  Bu sekme ürün detay yanıtındaki <code>selectionGroups</code> ve{' '}
                  <code>optionGroups</code> alanlarını gösterir.
                </p>
              </div>

              {selectionGroups.length === 0 && optionGroups.length === 0 ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Bu ürün için ürün özelliği veya varyant grubu yok.
                </p>
              ) : null}

              {selectionGroups.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Ek özellik grupları (<code>selectionGroups</code>)
                  </h4>
                  {selectionGroups.map((group, groupIndex) => {
                    const selections = readRecordArrayField(group, 'selections')
                    return (
                      <div key={`selection-${groupIndex}`} className="rounded-md border border-border bg-muted/20 p-3">
                        <div className="mb-3">
                          <Label className="text-[10px] text-muted-foreground">
                            selectionGroups[{groupIndex}]
                          </Label>
                          <p className="font-medium text-foreground">
                            {displayFeatureText(group.title ?? group.name ?? `Grup ${groupIndex + 1}`)}
                          </p>
                        </div>
                        {selections.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="border-b border-border px-2 py-2 text-left font-medium">
                                    Alan
                                  </th>
                                  <th className="border-b border-border px-2 py-2 text-left font-medium">
                                    Değer
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {selections.map((selection, selectionIndex) => (
                                  <tr key={selectionIndex} className="odd:bg-background/60">
                                    <td className="border-b border-border/60 px-2 py-2 align-top font-mono text-xs text-muted-foreground">
                                      selections[{selectionIndex}]
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 align-top">
                                      <p className="text-foreground">
                                        {displayFeatureText(
                                          selection.title ?? selection.name ?? selection.value ?? selection.id
                                        )}
                                      </p>
                                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                                        {formatRawFieldValue(selection)}
                                      </pre>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {formatRawFieldValue(group)}
                          </pre>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {optionGroups.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Varyant grupları (<code>optionGroups</code>)
                  </h4>
                  {optionGroups.map((group, groupIndex) => {
                    const options = readNestedVariantOptions(group)
                    return (
                      <div key={`option-${groupIndex}`} className="rounded-md border border-border bg-muted/20 p-3">
                        <div className="mb-3">
                          <Label className="text-[10px] text-muted-foreground">
                            optionGroups[{groupIndex}]
                          </Label>
                          <p className="font-medium text-foreground">
                            {displayFeatureText(group.title ?? group.name ?? `Varyant ${groupIndex + 1}`)}
                          </p>
                        </div>
                        {options.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="border-b border-border px-2 py-2 text-left font-medium">
                                    Alan
                                  </th>
                                  <th className="border-b border-border px-2 py-2 text-left font-medium">
                                    Değer
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {options.map((option, optionIndex) => (
                                  <tr key={optionIndex} className="odd:bg-background/60">
                                    <td className="border-b border-border/60 px-2 py-2 align-top font-mono text-xs text-muted-foreground">
                                      options[{optionIndex}]
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 align-top">
                                      <p className="text-foreground">
                                        {displayFeatureText(option.title ?? option.name ?? option.value ?? option.id)}
                                      </p>
                                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                                        {formatRawFieldValue(option)}
                                      </pre>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {formatRawFieldValue(group)}
                          </pre>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )}

          {activePanel === 'varyantSecenekleri' && genelLoading && (
            <p className="text-muted-foreground">Varyant seçenekleri yükleniyor…</p>
          )}

          {activePanel === 'varyantSecenekleri' && !genelLoading && genelError && (
            <p className="text-destructive">{genelError}</p>
          )}

          {activePanel === 'varyantSecenekleri' && !genelLoading && !genelError && genel && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-medium text-foreground">Varyant seçenekleri</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <code className="text-[11px]">optionGroups</code> › <code className="text-[11px]">options</code>{' '}
                  — her satır bir varyant (ör. renk &quot;Kırmızı&quot;). İsimlendirme API ile uyumlu;{' '}
                  <code className="text-[11px]">snake_case</code> alanlar da okunur.
                </p>
              </div>
              {!hasVariantOptionsListed ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Bu ürün için <code className="text-xs">optionGroups</code> altında{' '}
                  <code className="text-xs">options</code> kaydı yok.
                </p>
              ) : (
                <div className="space-y-6">
                  {variantOptionBlocks.map(({ groupIndex, groupTitle, options }) =>
                    options.length === 0 ? null : (
                      <div key={`vg-${groupIndex}`} className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground">
                          <span className="text-foreground">{groupTitle}</span>
                          <span className="ml-1.5 font-normal tabular-nums">
                            · optionGroups[{groupIndex}] · {options.length} seçenek
                          </span>
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  id
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  title
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  slug
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  sortOrder
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  logo
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  attachment
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  imageUrl
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  size
                                </th>
                                <th className="min-w-[140px] border-b border-border px-2 py-2 text-left font-medium">
                                  optionGroup
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  updatedAt
                                </th>
                                <th className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-medium">
                                  createdAt
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {options.map((opt, oi) => {
                                const idVal = pickVariantField(opt, ['id'])
                                const rowKey =
                                  typeof idVal === 'number' || typeof idVal === 'string'
                                    ? String(idVal)
                                    : `opt-${oi}`
                                const rowId = `${groupIndex}-${rowKey}`
                                const imageUrlRaw = pickVariantField(opt, ['imageUrl', 'image_url'])
                                const imageStr =
                                  typeof imageUrlRaw === 'string' ? imageUrlRaw.trim() : ''
                                const ogVal = pickVariantField(opt, ['optionGroup', 'option_group'])
                                const ogCell = formatVariantOptionGroupCell(ogVal)
                                return (
                                  <tr key={rowId} className="odd:bg-muted/20">
                                    <td className="border-b border-border/60 px-2 py-2 font-mono tabular-nums text-foreground">
                                      {variantOptionCellText(idVal)}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 max-w-[160px]">
                                      <p className="break-words text-foreground">
                                        {variantOptionCellText(pickVariantField(opt, ['title']))}
                                      </p>
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 font-mono text-[11px] text-foreground">
                                      {variantOptionCellText(pickVariantField(opt, ['slug']))}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 tabular-nums text-foreground">
                                      {variantOptionCellText(
                                        pickVariantField(opt, ['sortOrder', 'sort_order'])
                                      )}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 max-w-[120px] break-all text-[11px] text-foreground">
                                      {variantOptionCellText(pickVariantField(opt, ['logo']))}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 max-w-[120px] break-all text-[11px] text-foreground">
                                      {variantOptionCellText(pickVariantField(opt, ['attachment']))}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 max-w-[180px] break-all">
                                      {imageStr && /^https?:\/\//i.test(imageStr) ? (
                                        <a
                                          href={imageStr}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary underline-offset-2 hover:underline"
                                        >
                                          {imageStr.length > 48 ? `${imageStr.slice(0, 44)}…` : imageStr}
                                        </a>
                                      ) : (
                                        <span className="text-foreground">{variantOptionCellText(imageUrlRaw)}</span>
                                      )}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 tabular-nums text-foreground">
                                      {variantOptionCellText(pickVariantField(opt, ['size']))}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 min-w-[140px]">
                                      <p className="break-words font-medium text-foreground">{ogCell.summary}</p>
                                      {ogCell.json ? (
                                        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/30 p-1.5 font-mono text-[10px] text-muted-foreground">
                                          {ogCell.json}
                                        </pre>
                                      ) : null}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 font-mono text-[10px] text-foreground whitespace-nowrap">
                                      {variantOptionCellText(
                                        pickVariantField(opt, ['updatedAt', 'updated_at'])
                                      )}
                                    </td>
                                    <td className="border-b border-border/60 px-2 py-2 font-mono text-[10px] text-foreground whitespace-nowrap">
                                      {variantOptionCellText(
                                        pickVariantField(opt, ['createdAt', 'created_at'])
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {activePanel === 'ekstraAlanlar' && productId == null ? (
            <p className="text-muted-foreground">Ürün seçilmemiş.</p>
          ) : null}

          {activePanel === 'ekstraAlanlar' && productId != null &&
          extraFieldsHydratedId.current !== productId &&
          (extraFieldsPanelLoading ||
            (extraInfoLoading && fetchedExtraInfoId.current === productId)) ? (
            <p className="text-muted-foreground">Ekstra alanlar yükleniyor…</p>
          ) : null}

          {activePanel === 'ekstraAlanlar' && productId != null && extraFieldsPanelError ? (
            <p className="text-destructive">{extraFieldsPanelError}</p>
          ) : null}

          {activePanel === 'ekstraAlanlar' &&
          productId != null &&
          extraFieldsHydratedId.current === productId &&
          !extraFieldsPanelError ? (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Ürün ekstra alanları</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Admin API kaynağı <code className="text-[11px]">product_extra_fields</code>; ürün gövdesinde{' '}
                  <code className="text-[11px]">productExtraFields</code>.
                </p>
              </div>
              {extraFieldItems.length === 0 ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Bu ürün için ekstra alan kaydı yok.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="border-b border-border px-2 py-2 text-left font-medium">id</th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">
                          Ürün <code className="text-[10px] font-normal">product</code>
                        </th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">
                          varKey
                        </th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">
                          varValue
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraFieldItems.map((item) => {
                        const pk = formatNestedProductRef(item.product)
                        const pkJson =
                          item.product &&
                          typeof item.product === 'object' &&
                          Object.keys(item.product as Record<string, unknown>).some((k) => k !== 'id')
                            ? formatRawFieldValue(item.product)
                            : null
                        return (
                          <tr key={item.id} className="odd:bg-muted/20">
                            <td className="border-b border-border/60 px-2 py-2 font-mono tabular-nums text-foreground">
                              {item.id}
                            </td>
                            <td className="border-b border-border/60 px-2 py-2">
                              <p className="font-mono text-xs text-foreground">{pk}</p>
                              {pkJson ? (
                                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                                  {pkJson}
                                </pre>
                              ) : null}
                            </td>
                            <td className="border-b border-border/60 px-2 py-2">
                              <p className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                                {readProductExtraVarKey(item)}
                              </p>
                            </td>
                            <td className="border-b border-border/60 px-2 py-2">
                              <p className="whitespace-pre-wrap break-words text-foreground">
                                {readProductExtraVarValue(item)}
                              </p>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {activePanel === 'ozelBilgi' && extraInfoLoading && (
            <p className="text-muted-foreground">Özel bilgi yükleniyor…</p>
          )}

          {activePanel === 'ozelBilgi' && !extraInfoLoading && extraInfoError && (
            <p className="text-destructive">{extraInfoError}</p>
          )}

          {activePanel === 'ozelBilgi' && !extraInfoLoading && !extraInfoError && (
            <div className="space-y-3">
              {!specialInfoOnly ? (
              <div>
                <h3 className="text-sm font-medium text-foreground">Özel Bilgi</h3>
                <p className="text-xs text-muted-foreground">
                  Paneldeki Özel Bilgi Alanı <code>product_special_infos</code> kaynağından gelir.{' '}
                  <code>extra_info_to_products</code> aşağıdadır; <code>productExtraFields</code> için{' '}
                  <span className="font-medium text-foreground">Ekstra Alanlar</span> sekmesini kullanın.
                </p>
              </div>
              ) : null}
              {specialInfoItems.length === 0 &&
              (!specialInfoOnly ? extraInfoItems.length === 0 : true) ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Bu ürün için özel bilgi kaydı yok.
                </p>
              ) : null}
              {specialInfoItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    Özel Bilgi Alanı (<code>product_special_infos</code>)
                  </h4>
                  <div className="space-y-4">
                    {specialInfoItems.map((item, index) => {
                      const key = String(item.id)
                      const draft = specialInfoDrafts[key] ?? {
                        title: specialTitleDraftValue(item.title),
                        content: typeof item.content === 'string' ? item.content : String(item.content ?? ''),
                      }
                      return (
                        <div key={item.id} className="rounded-md border border-border bg-muted/20 p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Kayıt #{item.id} · <code>product_special_infos[{index}]</code>
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="save"
                              onClick={() => void saveSpecialInfo(item)}
                              disabled={specialInfoSavingKey === key}
                            >
                              {specialInfoSavingKey === key ? 'Kaydediliyor…' : 'Kaydet'}
                            </Button>
                          </div>
                          <div className="grid gap-3">
                            {!specialInfoOnly || focusField === 'specialTitle' ? (
                            <div className="grid gap-1.5">
                              <Label htmlFor={`special-title-${item.id}`} className="text-xs text-muted-foreground">
                                Başlık <code>title</code>
                              </Label>
                              <Input
                                id={`special-title-${item.id}`}
                                value={draft.title}
                                autoFocus={focusField === 'specialTitle' && index === 0}
                                onChange={(e) =>
                                  setSpecialInfoDrafts((prev) => ({
                                    ...prev,
                                    [key]: { ...draft, title: e.target.value },
                                  }))
                                }
                              />
                            </div>
                            ) : null}
                            {!specialInfoOnly || focusField === 'specialContent' ? (
                            <div className="grid gap-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label htmlFor={`special-content-${item.id}`} className="text-xs text-muted-foreground">
                                  İçerik <code>content</code>
                                </Label>
                                <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={specialContentMode === 'normal' ? 'secondary' : 'ghost'}
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setSpecialContentMode('normal')}
                                  >
                                    Normal
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={specialContentMode === 'html' ? 'secondary' : 'ghost'}
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setSpecialContentMode('html')}
                                  >
                                    HTML
                                  </Button>
                                </div>
                              </div>
                              {specialContentMode === 'html' ? (
                                <Textarea
                                  id={`special-content-${item.id}`}
                                  value={draft.content}
                                  autoFocus={focusField === 'specialContent' && index === 0}
                                  className="min-h-40 font-mono text-xs"
                                  onChange={(e) =>
                                    setSpecialInfoDrafts((prev) => ({
                                      ...prev,
                                      [key]: { ...draft, content: e.target.value },
                                    }))
                                  }
                                />
                              ) : (
                                <div
                                  id={`special-content-${item.id}`}
                                  role="textbox"
                                  tabIndex={0}
                                  contentEditable
                                  suppressContentEditableWarning
                                  className="min-h-40 overflow-auto rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  dangerouslySetInnerHTML={{ __html: draft.content }}
                                  onBlur={(e) =>
                                    setSpecialInfoDrafts((prev) => ({
                                      ...prev,
                                      [key]: { ...draft, content: e.currentTarget.innerHTML },
                                    }))
                                  }
                                />
                              )}
                            </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {specialInfoItems.length === 0 ? (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Yeni kayıt · <code>product_special_infos</code>
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="save"
                      onClick={() => void saveSpecialInfo(null)}
                      disabled={specialInfoSavingKey === 'new'}
                    >
                      {specialInfoSavingKey === 'new' ? 'Kaydediliyor…' : 'Kaydet'}
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {!specialInfoOnly || focusField === 'specialTitle' ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor="special-title-new" className="text-xs text-muted-foreground">
                        Başlık <code>title</code>
                      </Label>
                      <Input
                        id="special-title-new"
                        value={specialInfoDrafts.new?.title ?? DEFAULT_SPECIAL_TITLE}
                        autoFocus={focusField === 'specialTitle'}
                        onChange={(e) =>
                          setSpecialInfoDrafts((prev) => ({
                            ...prev,
                            new: { title: e.target.value, content: prev.new?.content ?? '' },
                          }))
                        }
                      />
                    </div>
                    ) : null}
                    {!specialInfoOnly || focusField === 'specialContent' ? (
                    <div className="grid gap-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="special-content-new" className="text-xs text-muted-foreground">
                          İçerik <code>content</code>
                        </Label>
                        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={specialContentMode === 'normal' ? 'secondary' : 'ghost'}
                            className="h-7 px-2 text-xs"
                            onClick={() => setSpecialContentMode('normal')}
                          >
                            Normal
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={specialContentMode === 'html' ? 'secondary' : 'ghost'}
                            className="h-7 px-2 text-xs"
                            onClick={() => setSpecialContentMode('html')}
                          >
                            HTML
                          </Button>
                        </div>
                      </div>
                      {specialContentMode === 'html' ? (
                        <Textarea
                          id="special-content-new"
                          value={specialInfoDrafts.new?.content ?? ''}
                          autoFocus={focusField === 'specialContent'}
                          className="min-h-40 font-mono text-xs"
                          onChange={(e) =>
                            setSpecialInfoDrafts((prev) => ({
                              ...prev,
                              new: { title: prev.new?.title ?? DEFAULT_SPECIAL_TITLE, content: e.target.value },
                            }))
                          }
                        />
                      ) : (
                        <div
                          id="special-content-new"
                          role="textbox"
                          tabIndex={0}
                          contentEditable
                          suppressContentEditableWarning
                          className="min-h-40 overflow-auto rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          dangerouslySetInnerHTML={{ __html: specialInfoDrafts.new?.content ?? '' }}
                          onBlur={(e) =>
                            setSpecialInfoDrafts((prev) => ({
                              ...prev,
                              new: {
                                title: prev.new?.title ?? DEFAULT_SPECIAL_TITLE,
                                content: e.currentTarget.innerHTML,
                              },
                            }))
                          }
                        />
                      )}
                    </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {!specialInfoOnly && extraInfoItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    ExtraInfo ürün bağları (<code>extra_info_to_products</code>)
                  </h4>
                  <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="border-b border-border px-2 py-2 text-left font-medium">
                          Başlık
                        </th>
                        <th className="border-b border-border px-2 py-2 text-left font-medium">
                          İçerik
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraInfoItems.map((item) => {
                        const title = formatRawFieldValue(item.extraInfo?.name)
                        const content = formatRawFieldValue(item.value)
                        return (
                          <tr key={item.id} className="odd:bg-muted/20">
                            <td className="border-b border-border/60 px-2 py-2 align-top">
                              <Label className="mb-1 block text-[10px] text-muted-foreground">
                                extraInfo.name
                              </Label>
                              <p className="whitespace-pre-wrap break-words text-foreground">{title}</p>
                            </td>
                            <td className="border-b border-border/60 px-2 py-2 align-top">
                              <Label className="mb-1 block text-[10px] text-muted-foreground">
                                value
                              </Label>
                              <p className="whitespace-pre-wrap break-words text-foreground">{content}</p>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          {activePanel === 'tumAlanlar' && genelLoading && (
            <p className="text-muted-foreground">Yükleniyor…</p>
          )}

          {activePanel === 'tumAlanlar' && !genelLoading && genelError && (
            <p className="text-destructive">{genelError}</p>
          )}

          {activePanel === 'tumAlanlar' && !genelLoading && !genelError && genel && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="sticky top-0 z-10 w-[260px] border-b border-border bg-background px-2 py-2 text-left font-medium">
                      Orijinal alan adı
                    </th>
                    <th className="sticky top-0 z-10 border-b border-border bg-background px-2 py-2 text-left font-medium">
                      Değer
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRawFieldRows.map((field) => (
                    <tr key={field.path} className="border-b border-border/70 odd:bg-muted/20">
                      <td className="border-b border-border/60 px-2 py-2 align-top font-mono text-muted-foreground">
                        {field.path}
                      </td>
                      <td className="border-b border-border/60 px-2 py-2 align-top">
                        <pre className="max-h-40 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
                          {field.value}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
