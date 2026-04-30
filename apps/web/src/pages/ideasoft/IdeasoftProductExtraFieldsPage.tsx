import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { ChevronDown, ListChecks, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { toastSuccess, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type {
  IdeasoftProductListRow,
  IdeasoftProductStatusFilter,
} from '@/pages/ideasoft/IdeasoftProductsPage'

/**
 * ProductExtraField — PDF: …/product_extra_fields — id, product, varKey (≤255), varValue.
 */
export interface IdeasoftProductExtraFieldRow {
  id: number
  varKey?: string
  varValue?: string
  product?: Record<string, unknown>
}

/**
 * ProductExtraInfo — PDF: …/extra_info_to_products — id, value, extraInfo { id, name, sortOrder }, product.
 */
export interface IdeasoftProductExtraInfoRow {
  id: number
  value?: string
  extraInfo?: { id?: number; name?: string; sortOrder?: number }
  product?: Record<string, unknown>
}

/** ProductExtraInfo tanım başlığı — Admin API GET …/extra_infos */
export interface IdeasoftExtraInfoDefinition {
  id: number
  name: string
  sortOrder: number
}

function parseExtraInfoDefinition(raw: unknown): IdeasoftExtraInfoDefinition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'number' ? o.id : parseInt(String(o.id ?? ''), 10)
  if (!Number.isFinite(id) || id < 1) return null
  const name = typeof o.name === 'string' ? o.name : String(o.name ?? '').trim()
  const soRaw = o.sortOrder ?? o.sort_order
  const sortOrder = typeof soRaw === 'number' ? soRaw : parseInt(String(soRaw ?? '0'), 10)
  return {
    id,
    name,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  }
}

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

export function extractExtraFieldsList(json: unknown): { items: IdeasoftProductExtraFieldRow[]; total: number } {
  return extractHydraLikeList<IdeasoftProductExtraFieldRow>(json)
}

export function extractExtraInfoList(json: unknown): { items: IdeasoftProductExtraInfoRow[]; total: number } {
  return extractHydraLikeList<IdeasoftProductExtraInfoRow>(json)
}

export function extractExtraInfoDefinitionsList(json: unknown): {
  items: IdeasoftExtraInfoDefinition[]
  total: number
} {
  const { items: rawItems, total } = extractHydraLikeList<Record<string, unknown>>(json)
  const items: IdeasoftExtraInfoDefinition[] = []
  for (const raw of rawItems) {
    const d = parseExtraInfoDefinition(raw)
    if (d) items.push(d)
  }
  return { items, total }
}

function extractHydraLikeList<T>(json: unknown): { items: T[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as T[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as T[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as T[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as T[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as T[]
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function parseCount(json: unknown): number | null {
  if (typeof json === 'number' && Number.isFinite(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.total === 'number') return o.total
    if (typeof o.count === 'number') return o.count
    if (typeof o['hydra:totalItems'] === 'number') return o['hydra:totalItems'] as number
  }
  return null
}

function parseProductCount(json: unknown): number | null {
  return parseCount(json)
}

function productLine(p: IdeasoftProductListRow): string {
  const t = (p.fullName || p.name || '').trim() || `Ürün #${p.id}`
  const sku = (p.sku || '').trim()
  return sku ? `${t} (${sku})` : t
}

type SubMode = 'list' | 'create' | 'edit'
type DialogTab = 'fields' | 'info'

type BulkInfoDraft = {
  id: number
  value: string
  extraInfoId: string
  name: string
  sortOrderStr: string
  originalPayload: Record<string, unknown>
}

type BulkInfoStep = 'edit' | 'preview' | 'results'

type BulkInfoResultRow = { id: number; ok: boolean; message?: string }

function validateExtraInfoFields(extraInfoId: string, name: string, sortOrderStr: string): string | null {
  const exId = parseInt(extraInfoId.trim(), 10)
  const n = name.trim()
  const so = parseInt(sortOrderStr, 10)
  if (!Number.isFinite(exId) || exId < 1) return 'extraInfo.id ≥ 1 olmalıdır (PDF).'
  if (!n || n.length > 255) return 'extraInfo.name zorunlu, ≤255 karakter (PDF).'
  if (!Number.isFinite(so) || so < 0 || so > 99) return 'extraInfo.sortOrder 0–99 (PDF).'
  return null
}

const EXTRA_PAGE_SIZE = 50

export function IdeasoftProductExtraFieldsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-product-extra-fields-v1', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const [items, setItems] = useState<IdeasoftProductListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  /** Yeşil nokta: product_extra_fields veya extra_info_to_products COUNT &gt; 0 */
  const [productExtrasMarker, setProductExtrasMarker] = useState<Record<number, boolean>>({})
  const [extraFlagsLoading, setExtraFlagsLoading] = useState(false)
  const [docOpen, setDocOpen] = useState(false)

  const [extrasOpen, setExtrasOpen] = useState(false)
  const [extrasKey, setExtrasKey] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState<IdeasoftProductListRow | null>(null)
  const [dialogTab, setDialogTab] = useState<DialogTab>('fields')

  const [extraMode, setExtraMode] = useState<SubMode>('list')
  const [extraPage, setExtraPage] = useState(1)
  const [extraItems, setExtraItems] = useState<IdeasoftProductExtraFieldRow[]>([])
  const [extraTotal, setExtraTotal] = useState(0)
  const [extraLoading, setExtraLoading] = useState(false)
  const [extraError, setExtraError] = useState<string | null>(null)
  const [formVarKey, setFormVarKey] = useState('')
  const [formVarValue, setFormVarValue] = useState('')
  const [fieldEditPayload, setFieldEditPayload] = useState<Record<string, unknown> | null>(null)
  const [fieldEditLoading, setFieldEditLoading] = useState(false)
  const [deleteFieldOpen, setDeleteFieldOpen] = useState(false)

  const [infoMode, setInfoMode] = useState<SubMode>('list')
  const [infoPage, setInfoPage] = useState(1)
  const [infoItems, setInfoItems] = useState<IdeasoftProductExtraInfoRow[]>([])
  const [infoTotal, setInfoTotal] = useState(0)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoFormValue, setInfoFormValue] = useState('')
  const [infoFormExId, setInfoFormExId] = useState('')
  const [infoFormExName, setInfoFormExName] = useState('')
  const [infoFormExSort, setInfoFormExSort] = useState('1')
  const [infoEditPayload, setInfoEditPayload] = useState<Record<string, unknown> | null>(null)
  const [infoEditLoading, setInfoEditLoading] = useState(false)
  const [deleteInfoOpen, setDeleteInfoOpen] = useState(false)

  const [selectedInfoIds, setSelectedInfoIds] = useState<Set<number>>(() => new Set())
  const [bulkInfoDialogOpen, setBulkInfoDialogOpen] = useState(false)
  const [bulkInfoStep, setBulkInfoStep] = useState<BulkInfoStep>('edit')
  const [bulkInfoDrafts, setBulkInfoDrafts] = useState<BulkInfoDraft[]>([])
  const [bulkInfoResults, setBulkInfoResults] = useState<BulkInfoResultRow[]>([])
  const [bulkInfoLoadLoading, setBulkInfoLoadLoading] = useState(false)
  const [bulkInfoApplyLoading, setBulkInfoApplyLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const hasFilter = search.length > 0 || statusFilter !== 'active'

  const refreshProductExtrasMarker = useCallback(async (productId: number) => {
    try {
      const [rf, ri] = await Promise.all([
        fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/count?product=${productId}`),
        fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products/count?product=${productId}`),
      ])
      const [jf, ji] = await Promise.all([
        parseJsonResponse<unknown>(rf),
        parseJsonResponse<unknown>(ri),
      ])
      const cf = rf.ok ? parseCount(jf) ?? 0 : 0
      const ci = ri.ok ? parseCount(ji) ?? 0 : 0
      setProductExtrasMarker((prev) => ({ ...prev, [productId]: cf > 0 || ci > 0 }))
    } catch {
      setProductExtrasMarker((prev) => ({ ...prev, [productId]: false }))
    }
  }, [])

  const buildProductParams = useCallback(() => {
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

  const fetchProductList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = buildProductParams()
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/products?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Ürün listesi alınamadı'
        )
        setItems([])
        setTotal(0)
        setProductExtrasMarker({})
        setExtraFlagsLoading(false)
        return
      }
      let { items: rows, total: t } = extractProductsList(data)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(`${API_URL}/api/ideasoft/admin-api/products/count?${countParams}`)
      if (resCount.ok) {
        try {
          const countData = await parseJsonResponse<unknown>(resCount)
          const c = parseProductCount(countData)
          if (c != null) t = c
        } catch {
          /* */
        }
      }
      setTotal(t)
      setItems(rows)
      setProductExtrasMarker({})
      if (rows.length === 0) {
        setExtraFlagsLoading(false)
      } else {
        setExtraFlagsLoading(true)
        void (async () => {
          const next: Record<number, boolean> = {}
          await Promise.all(
            rows.map(async (row) => {
              try {
                const [rf, ri] = await Promise.all([
                  fetch(
                    `${API_URL}/api/ideasoft/admin-api/product_extra_fields/count?product=${row.id}`
                  ),
                  fetch(
                    `${API_URL}/api/ideasoft/admin-api/extra_info_to_products/count?product=${row.id}`
                  ),
                ])
                const [jf, ji] = await Promise.all([
                  parseJsonResponse<unknown>(rf),
                  parseJsonResponse<unknown>(ri),
                ])
                const cf = rf.ok ? parseCount(jf) ?? 0 : 0
                const ci = ri.ok ? parseCount(ji) ?? 0 : 0
                if (cf > 0 || ci > 0) next[row.id] = true
              } catch {
                /* */
              }
            })
          )
          setProductExtrasMarker(next)
          setExtraFlagsLoading(false)
        })()
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
      setProductExtrasMarker({})
      setExtraFlagsLoading(false)
    } finally {
      setLoading(false)
    }
  }, [buildProductParams])

  useEffect(() => {
    void fetchProductList()
  }, [fetchProductList])

  const fetchExtraFieldsForProduct = useCallback(async (productId: number, ep: number) => {
    setExtraLoading(true)
    setExtraError(null)
    try {
      const params = new URLSearchParams({
        product: String(productId),
        page: String(ep),
        limit: String(EXTRA_PAGE_SIZE),
        sort: 'id',
      })
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setExtraError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) ||
            'Ekstra alanlar alınamadı'
        )
        setExtraItems([])
        setExtraTotal(0)
        return
      }
      let { items: rows, total: tot } = extractExtraFieldsList(data)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/count?${countParams}`)
      if (resCount.ok) {
        try {
          const countData = await parseJsonResponse<unknown>(resCount)
          const c = parseCount(countData)
          if (c != null) tot = c
        } catch {
          /* */
        }
      }
      setExtraTotal(tot)
      setExtraItems(rows)
    } catch (err) {
      setExtraError(err instanceof Error ? err.message : 'Ekstra alanlar alınamadı')
      setExtraItems([])
      setExtraTotal(0)
    } finally {
      setExtraLoading(false)
    }
  }, [])

  const fetchExtraInfosForProduct = useCallback(async (productId: number, ip: number) => {
    setInfoLoading(true)
    setInfoError(null)
    try {
      const params = new URLSearchParams({
        product: String(productId),
        page: String(ip),
        limit: String(EXTRA_PAGE_SIZE),
        sort: 'id',
      })
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setInfoError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) ||
            'Ekstra bilgi kayıtları alınamadı'
        )
        setInfoItems([])
        setInfoTotal(0)
        return
      }
      let { items: rows, total: tot } = extractExtraInfoList(data)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(
        `${API_URL}/api/ideasoft/admin-api/extra_info_to_products/count?${countParams}`
      )
      if (resCount.ok) {
        try {
          const countData = await parseJsonResponse<unknown>(resCount)
          const c = parseCount(countData)
          if (c != null) tot = c
        } catch {
          /* */
        }
      }
      setInfoTotal(tot)
      setInfoItems(rows)
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : 'Ekstra bilgi kayıtları alınamadı')
      setInfoItems([])
      setInfoTotal(0)
    } finally {
      setInfoLoading(false)
    }
  }, [])

  const openExtras = useCallback((row: IdeasoftProductListRow) => {
    setSelectedProduct(row)
    setDialogTab('fields')
    setExtraMode('list')
    setExtraPage(1)
    setInfoMode('list')
    setInfoPage(1)
    setSelectedInfoIds(new Set())
    setExtrasKey((k) => k + 1)
    setExtrasOpen(true)
    setFieldEditPayload(null)
    setInfoEditPayload(null)
    setFormVarKey('')
    setFormVarValue('')
    setInfoFormValue('')
    setInfoFormExId('')
    setInfoFormExName('')
    setInfoFormExSort('1')
  }, [])

  const closeExtras = useCallback(() => {
    setExtrasOpen(false)
    setSelectedProduct(null)
    setDialogTab('fields')
    setExtraMode('list')
    setInfoMode('list')
    setFieldEditPayload(null)
    setInfoEditPayload(null)
  }, [])

  const onDialogTabChange = useCallback((v: string) => {
    const t = v === 'info' ? 'info' : 'fields'
    setDialogTab(t)
    setExtraMode('list')
    setInfoMode('list')
    setFieldEditPayload(null)
    setInfoEditPayload(null)
  }, [])

  useEffect(() => {
    if (!extrasOpen || !selectedProduct || extraMode !== 'list' || dialogTab !== 'fields') return
    void fetchExtraFieldsForProduct(selectedProduct.id, extraPage)
  }, [extrasOpen, extrasKey, selectedProduct?.id, extraPage, extraMode, dialogTab, fetchExtraFieldsForProduct])

  useEffect(() => {
    if (!extrasOpen || !selectedProduct || infoMode !== 'list' || dialogTab !== 'info') return
    void fetchExtraInfosForProduct(selectedProduct.id, infoPage)
  }, [extrasOpen, extrasKey, selectedProduct?.id, infoPage, infoMode, dialogTab, fetchExtraInfosForProduct])

  useEffect(() => {
    setSelectedInfoIds(new Set())
  }, [infoPage])

  useEffect(() => {
    if (!extrasOpen) setSelectedInfoIds(new Set())
  }, [extrasOpen])

  const toggleInfoRowSelected = useCallback((id: number, checked: boolean) => {
    setSelectedInfoIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const allInfoOnPageSelected =
    infoItems.length > 0 && infoItems.every((it) => selectedInfoIds.has(it.id))
  const someInfoOnPageSelected = infoItems.some((it) => selectedInfoIds.has(it.id))

  const toggleSelectAllInfoOnPage = useCallback(() => {
    setSelectedInfoIds((prev) => {
      const next = new Set(prev)
      const pageIds = infoItems.map((it) => it.id)
      if (pageIds.length === 0) return next
      if (pageIds.every((id) => next.has(id))) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })
  }, [infoItems])

  const closeBulkInfoDialog = useCallback(() => {
    setBulkInfoDialogOpen(false)
    setBulkInfoStep('edit')
    setBulkInfoDrafts([])
    setBulkInfoResults([])
  }, [])

  const updateBulkDraft = useCallback((index: number, patch: Partial<Omit<BulkInfoDraft, 'id' | 'originalPayload'>>) => {
    setBulkInfoDrafts((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    )
  }, [])

  const openBulkInfoEditor = useCallback(async () => {
    const ids = Array.from(selectedInfoIds)
    if (ids.length === 0 || !selectedProduct) return
    setBulkInfoLoadLoading(true)
    try {
      const loaded: BulkInfoDraft[] = []
      for (const id of ids) {
        const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products/${id}`)
        const data = await parseJsonResponse<unknown>(res)
        if (!res.ok) {
          toastError(
            `Kayıt #${id}`,
            formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'GET başarısız'
          )
          continue
        }
        if (!data || typeof data !== 'object') continue
        const rec = data as Record<string, unknown>
        const ex =
          rec.extraInfo && typeof rec.extraInfo === 'object'
            ? (rec.extraInfo as Record<string, unknown>)
            : {}
        loaded.push({
          id,
          value: typeof rec.value === 'string' ? rec.value : '',
          extraInfoId: typeof ex.id === 'number' ? String(ex.id) : '',
          name: typeof ex.name === 'string' ? ex.name : '',
          sortOrderStr: typeof ex.sortOrder === 'number' ? String(ex.sortOrder) : '1',
          originalPayload: rec,
        })
      }
      if (loaded.length === 0) {
        toastError('Toplu düzenle', 'Yüklenebilir kayıt yok.')
        return
      }
      if (loaded.length < ids.length) {
        toastError(
          'Toplu düzenle',
          `${ids.length - loaded.length} kayıt yüklenemedi; ${loaded.length} kayıt ile devam ediliyor.`
        )
      }
      setBulkInfoDrafts(loaded)
      setBulkInfoResults([])
      setBulkInfoStep('edit')
      setBulkInfoDialogOpen(true)
    } catch (e) {
      toastError('Toplu düzenle', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setBulkInfoLoadLoading(false)
    }
  }, [selectedInfoIds, selectedProduct])

  const goBulkInfoPreview = useCallback(() => {
    for (let i = 0; i < bulkInfoDrafts.length; i++) {
      const d = bulkInfoDrafts[i]!
      const err = validateExtraInfoFields(d.extraInfoId, d.name, d.sortOrderStr)
      if (err) {
        toastError(`Kayıt #${d.id}`, err)
        return
      }
    }
    setBulkInfoStep('preview')
  }, [bulkInfoDrafts])

  const applyBulkInfoUpdates = useCallback(async () => {
    if (!selectedProduct) return
    const results: BulkInfoResultRow[] = []
    setBulkInfoApplyLoading(true)
    try {
      for (const d of bulkInfoDrafts) {
        const exId = parseInt(d.extraInfoId.trim(), 10)
        const name = d.name.trim()
        const so = parseInt(d.sortOrderStr, 10)
        const body = {
          ...d.originalPayload,
          value: d.value,
          extraInfo: {
            id: exId,
            name,
            sortOrder: so,
          },
        }
        try {
          const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products/${d.id}`, {
            method: 'PUT',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          const data = await parseJsonResponse<unknown>(res)
          if (!res.ok) {
            results.push({
              id: d.id,
              ok: false,
              message: formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || `HTTP ${res.status}`,
            })
          } else {
            results.push({ id: d.id, ok: true })
          }
        } catch (e) {
          results.push({
            id: d.id,
            ok: false,
            message: e instanceof Error ? e.message : 'İstek başarısız',
          })
        }
      }
      setBulkInfoResults(results)
      setBulkInfoStep('results')
      const okCount = results.filter((r) => r.ok).length
      if (okCount === results.length) {
        toastSuccess('Toplu güncelleme', `${okCount} kayıt güncellendi.`)
      } else {
        toastError(
          'Toplu güncelleme',
          `${okCount}/${results.length} başarılı; sonuçları listeden kontrol edin.`
        )
      }
      void fetchExtraInfosForProduct(selectedProduct.id, infoPage)
      void refreshProductExtrasMarker(selectedProduct.id)
    } finally {
      setBulkInfoApplyLoading(false)
    }
  }, [bulkInfoDrafts, selectedProduct, infoPage, fetchExtraInfosForProduct, refreshProductExtrasMarker])

  const startCreateField = () => {
    setExtraMode('create')
    setFormVarKey('')
    setFormVarValue('')
    setFieldEditPayload(null)
  }

  const startCreateInfo = () => {
    setInfoMode('create')
    setInfoFormValue('')
    setInfoFormExId('')
    setInfoFormExName('')
    setInfoFormExSort('1')
    setInfoEditPayload(null)
  }

  const openEditField = useCallback(async (fieldId: number) => {
    setFieldEditLoading(true)
    setExtraMode('edit')
    setFieldEditPayload(null)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/${fieldId}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Detay',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Kayıt alınamadı'
        )
        setExtraMode('list')
        return
      }
      const rec = data as Record<string, unknown>
      setFieldEditPayload(rec)
      setFormVarKey(typeof rec.varKey === 'string' ? rec.varKey : '')
      setFormVarValue(typeof rec.varValue === 'string' ? rec.varValue : '')
    } catch (e) {
      toastError('Detay', e instanceof Error ? e.message : 'Kayıt alınamadı')
      setExtraMode('list')
    } finally {
      setFieldEditLoading(false)
    }
  }, [])

  const openEditInfo = useCallback(async (recId: number) => {
    setInfoEditLoading(true)
    setInfoMode('edit')
    setInfoEditPayload(null)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products/${recId}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Detay',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Kayıt alınamadı'
        )
        setInfoMode('list')
        return
      }
      const rec = data as Record<string, unknown>
      setInfoEditPayload(rec)
      setInfoFormValue(typeof rec.value === 'string' ? rec.value : '')
      const ex = rec.extraInfo && typeof rec.extraInfo === 'object' ? (rec.extraInfo as Record<string, unknown>) : {}
      setInfoFormExId(typeof ex.id === 'number' ? String(ex.id) : '')
      setInfoFormExName(typeof ex.name === 'string' ? ex.name : '')
      setInfoFormExSort(typeof ex.sortOrder === 'number' ? String(ex.sortOrder) : '1')
    } catch (e) {
      toastError('Detay', e instanceof Error ? e.message : 'Kayıt alınamadı')
      setInfoMode('list')
    } finally {
      setInfoEditLoading(false)
    }
  }, [])

  const submitCreateField = async () => {
    if (!selectedProduct) return
    const key = formVarKey.trim()
    if (!key || key.length > 255) {
      toastError('Doğrulama', 'varKey zorunlu, en fazla 255 karakter (PDF).')
      return
    }
    setSaving(true)
    try {
      const pres = await fetch(`${API_URL}/api/ideasoft/admin-api/products/${selectedProduct.id}`)
      const pdata = await parseJsonResponse<unknown>(pres)
      if (!pres.ok) {
        toastError(
          'Ürün',
          formatIdeasoftProxyErrorForUi(pdata as { error?: string; hint?: string }) || 'Ürün GET başarısız'
        )
        return
      }
      if (!pdata || typeof pdata !== 'object') {
        toastError('Ürün', 'Geçersiz ürün yanıtı')
        return
      }
      const body = {
        id: 0,
        product: pdata as Record<string, unknown>,
        varKey: key,
        varValue: formVarValue,
      }
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Oluştur',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'POST başarısız'
        )
        return
      }
      toastSuccess('Ekstra alan oluşturuldu (POST, 201).')
      setExtraMode('list')
      setProductExtrasMarker((prev) => ({ ...prev, [selectedProduct.id]: true }))
      void fetchExtraFieldsForProduct(selectedProduct.id, extraPage)
      void fetchProductList()
    } catch (e) {
      toastError('Oluştur', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setSaving(false)
    }
  }

  const submitEditField = async () => {
    if (!fieldEditPayload || typeof fieldEditPayload.id !== 'number') return
    const key = formVarKey.trim()
    if (!key || key.length > 255) {
      toastError('Doğrulama', 'varKey zorunlu, en fazla 255 karakter (PDF).')
      return
    }
    const id = fieldEditPayload.id
    const body = {
      ...fieldEditPayload,
      varKey: key,
      varValue: formVarValue,
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/${id}`, {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Kaydet',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'PUT başarısız'
        )
        return
      }
      toastSuccess('Ekstra alan güncellendi (PUT).')
      setExtraMode('list')
      setFieldEditPayload(null)
      if (selectedProduct) void fetchExtraFieldsForProduct(selectedProduct.id, extraPage)
    } catch (e) {
      toastError('Kaydet', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteField = async () => {
    if (!fieldEditPayload || typeof fieldEditPayload.id !== 'number') return
    const id = fieldEditPayload.id
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_extra_fields/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res).catch(() => ({}))
        toastError('Sil', formatIdeasoftProxyErrorForUi(data) || `HTTP ${res.status}`)
        return
      }
      toastSuccess('Ekstra alan silindi (DELETE, 204).')
      setDeleteFieldOpen(false)
      setExtraMode('list')
      setFieldEditPayload(null)
      if (selectedProduct) {
        void fetchExtraFieldsForProduct(selectedProduct.id, extraPage)
        void refreshProductExtrasMarker(selectedProduct.id)
      }
    } catch (e) {
      toastError('Sil', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setDeleting(false)
    }
  }

  const submitCreateInfo = async () => {
    if (!selectedProduct) return
    const val = infoFormValue
    const exId = parseInt(infoFormExId.trim(), 10)
    const name = infoFormExName.trim()
    const so = parseInt(infoFormExSort, 10)
    if (!Number.isFinite(exId) || exId < 1) {
      toastError('Doğrulama', 'extraInfo.id ≥ 1 olmalıdır (PDF).')
      return
    }
    if (!name || name.length > 255) {
      toastError('Doğrulama', 'extraInfo.name zorunlu, ≤255 karakter (PDF).')
      return
    }
    if (!Number.isFinite(so) || so < 0 || so > 99) {
      toastError('Doğrulama', 'extraInfo.sortOrder 0–99 (PDF).')
      return
    }
    setSaving(true)
    try {
      const pres = await fetch(`${API_URL}/api/ideasoft/admin-api/products/${selectedProduct.id}`)
      const pdata = await parseJsonResponse<unknown>(pres)
      if (!pres.ok) {
        toastError(
          'Ürün',
          formatIdeasoftProxyErrorForUi(pdata as { error?: string; hint?: string }) || 'Ürün GET başarısız'
        )
        return
      }
      if (!pdata || typeof pdata !== 'object') {
        toastError('Ürün', 'Geçersiz ürün yanıtı')
        return
      }
      const body = {
        id: 0,
        value: val,
        extraInfo: {
          id: exId,
          name,
          sortOrder: so,
        },
        product: pdata as Record<string, unknown>,
      }
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Oluştur',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'POST başarısız'
        )
        return
      }
      toastSuccess('Ekstra bilgi oluşturuldu (POST, 201).')
      setInfoMode('list')
      setProductExtrasMarker((prev) => ({ ...prev, [selectedProduct.id]: true }))
      void fetchExtraInfosForProduct(selectedProduct.id, infoPage)
      void fetchProductList()
    } catch (e) {
      toastError('Oluştur', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setSaving(false)
    }
  }

  const submitEditInfo = async () => {
    if (!infoEditPayload || typeof infoEditPayload.id !== 'number') return
    const exId = parseInt(infoFormExId.trim(), 10)
    const name = infoFormExName.trim()
    const so = parseInt(infoFormExSort, 10)
    if (!Number.isFinite(exId) || exId < 1) {
      toastError('Doğrulama', 'extraInfo.id ≥ 1 olmalıdır (PDF).')
      return
    }
    if (!name || name.length > 255) {
      toastError('Doğrulama', 'extraInfo.name zorunlu, ≤255 karakter (PDF).')
      return
    }
    if (!Number.isFinite(so) || so < 0 || so > 99) {
      toastError('Doğrulama', 'extraInfo.sortOrder 0–99 (PDF).')
      return
    }
    const id = infoEditPayload.id
    const body = {
      ...infoEditPayload,
      value: infoFormValue,
      extraInfo: {
        id: exId,
        name,
        sortOrder: so,
      },
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products/${id}`, {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Kaydet',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'PUT başarısız'
        )
        return
      }
      toastSuccess('Ekstra bilgi güncellendi (PUT).')
      setInfoMode('list')
      setInfoEditPayload(null)
      if (selectedProduct) void fetchExtraInfosForProduct(selectedProduct.id, infoPage)
    } catch (e) {
      toastError('Kaydet', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteInfo = async () => {
    if (!infoEditPayload || typeof infoEditPayload.id !== 'number') return
    const id = infoEditPayload.id
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res).catch(() => ({}))
        toastError('Sil', formatIdeasoftProxyErrorForUi(data) || `HTTP ${res.status}`)
        return
      }
      toastSuccess('Ekstra bilgi silindi (DELETE, 204).')
      setDeleteInfoOpen(false)
      setInfoMode('list')
      setInfoEditPayload(null)
      if (selectedProduct) {
        void fetchExtraInfosForProduct(selectedProduct.id, infoPage)
        void refreshProductExtrasMarker(selectedProduct.id)
      }
    } catch (e) {
      toastError('Sil', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setDeleting(false)
    }
  }

  const extraTotalPages = Math.max(1, Math.ceil(extraTotal / EXTRA_PAGE_SIZE))
  const infoTotalPages = Math.max(1, Math.ceil(infoTotal / EXTRA_PAGE_SIZE))

  return (
    <PageLayout
      title="IdeaSoft — Ekstra özellikler"
      description="Ürünler Product LIST; yeşil nokta = product_extra_fields veya extra_info_to_products COUNT &gt; 0. Modal: ProductExtraField ve ProductExtraInfo (PDF)."
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => void fetchProductList()}
      headerActions={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ürün ara (s)…"
                value={search}
                onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                className="pl-8 w-52 h-9 rounded-r-none border-r-0"
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
              <TooltipContent>Filtreyi sıfırla</TooltipContent>
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
      <Collapsible open={docOpen} onOpenChange={setDocOpen} className="shrink-0 border-b border-border pb-3 mb-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 px-2 -ml-2 text-muted-foreground">
            <ChevronDown className={cn('h-4 w-4 transition-transform', docOpen && 'rotate-180')} />
            API özeti (PDF)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2 bg-muted/30">
            <CardContent className="pt-4 text-sm text-muted-foreground space-y-3">
              <p>
                <strong className="text-foreground">Ürün</strong> —{' '}
                <code className="text-xs">GET …/admin-api/products</code>,{' '}
                <code>GET …/admin-api/products/{"{id}"}</code> (Product LIST / GET PDF): <code>s</code>,{' '}
                <code>status</code>, sayfalama, <code>sort</code>.
              </p>
              <p>
                <strong className="text-foreground">ProductExtraField</strong> —{' '}
                <code className="text-xs">…/product_extra_fields</code>; kayıt: <code>id</code>,{' '}
                <code>product</code>, <code>varKey</code> (≤255), <code>varValue</code>. LIST/COUNT{' '}
                <code>product</code> filtresi; POST <code>id: 0</code> + tam <code>product</code> gövdesi; PUT/DELETE{' '}
                <code>{"{id}"}</code>.
              </p>
              <p>
                <strong className="text-foreground">ProductExtraInfo</strong> —{' '}
                <code className="text-xs">…/extra_info_to_products</code>; kayıt: <code>id</code>,{' '}
                <code>value</code>, <code>extraInfo</code> ( <code>id</code>, <code>name</code>,{' '}
                <code>sortOrder</code> 0–99), <code>product</code>. LIST/COUNT <code>product</code>; POST/PUT gövdesi
                PDF örneğiyle; DELETE <code>204</code>.
              </p>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

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
                  <th className="text-center p-2 font-medium w-10">
                    <span className="sr-only">Ekstra kayıt</span>
                  </th>
                  <th className="text-left p-2 font-medium w-20">ID</th>
                  <th className="text-left p-2 font-medium min-w-[200px]">Ad</th>
                  <th className="text-left p-2 font-medium w-36">SKU</th>
                  <th className="text-center p-2 font-medium w-24">Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Ürün yok. Satıra tıklayınca ekstra alan ve ekstra bilgi sekmeleri açılır.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const title = (row.fullName || row.name || '—').trim() || '—'
                    const hasMarker = productExtrasMarker[row.id] === true
                    return (
                      <tr
                        key={row.id}
                        tabIndex={0}
                        className="border-b border-border/60 hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        onClick={() => openExtras(row)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openExtras(row)
                          }
                        }}
                      >
                        <td className="p-2 text-center align-middle w-10">
                          {hasMarker ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex h-5 w-5 items-center justify-center"
                                  aria-label="Ekstra alan veya ekstra bilgi kaydı var"
                                >
                                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12)]" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                product_extra_fields veya extra_info_to_products için COUNT &gt; 0
                              </TooltipContent>
                            </Tooltip>
                          ) : extraFlagsLoading ? (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/20 animate-pulse mx-auto"
                              aria-hidden
                            />
                          ) : null}
                        </td>
                        <td className="p-2 tabular-nums">{row.id}</td>
                        <td className="p-2 max-w-md truncate" title={title}>
                          {title}
                        </td>
                        <td className="p-2 font-mono text-xs">{row.sku?.trim() || '—'}</td>
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

      <Dialog
        open={extrasOpen}
        onOpenChange={(o) => {
          if (!o) closeExtras()
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="pr-8">
              Ürün ek verileri
              {selectedProduct ? (
                <span className="block text-sm font-normal text-muted-foreground mt-1 truncate">
                  {productLine(selectedProduct)} — ürün #{selectedProduct.id}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={onDialogTabChange} className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid w-full grid-cols-2 shrink-0">
              <TabsTrigger value="fields">Ekstra alanlar (varKey / varValue)</TabsTrigger>
              <TabsTrigger value="info">Ekstra bilgi (extra_info_to_products)</TabsTrigger>
            </TabsList>

            <TabsContent
              value="fields"
              forceMount
              className="flex flex-col flex-1 min-h-0 mt-4 data-[state=inactive]:hidden"
            >
              {extraMode === 'list' && (
                <>
                  {extraError && (
                    <div className="text-sm text-destructive whitespace-pre-wrap shrink-0">{extraError}</div>
                  )}
                  <div className="flex items-center justify-between gap-2 shrink-0">
                    <p className="text-xs text-muted-foreground">
                      Toplam {extraTotal} kayıt · sayfa {extraPage}/{extraTotalPages}
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={startCreateField}>
                      <Plus className="h-4 w-4 mr-1" />
                      Yeni (POST)
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto border rounded-md mt-2">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/95 z-[1]">
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium w-20">id</th>
                          <th className="text-left p-2 font-medium">varKey</th>
                          <th className="text-left p-2 font-medium min-w-[200px]">varValue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extraLoading ? (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-muted-foreground">
                              Yükleniyor...
                            </td>
                          </tr>
                        ) : extraItems.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-muted-foreground">
                              Bu ürün için ekstra alan yok.
                            </td>
                          </tr>
                        ) : (
                          extraItems.map((ex) => (
                            <tr
                              key={ex.id}
                              tabIndex={0}
                              className="border-b border-border/60 hover:bg-muted/40 cursor-pointer"
                              onClick={() => void openEditField(ex.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  void openEditField(ex.id)
                                }
                              }}
                            >
                              <td className="p-2 tabular-nums">{ex.id}</td>
                              <td className="p-2 font-mono text-xs break-all">{ex.varKey ?? '—'}</td>
                              <td className="p-2 break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
                                {ex.varValue ?? '—'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <DialogFooter className="shrink-0 flex-row justify-between gap-2 sm:justify-between mt-4">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={extraPage <= 1 || extraLoading}
                        onClick={() => setExtraPage((p) => Math.max(1, p - 1))}
                      >
                        Önceki
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={extraPage >= extraTotalPages || extraLoading}
                        onClick={() => setExtraPage((p) => p + 1)}
                      >
                        Sonraki
                      </Button>
                    </div>
                    <Button type="button" variant="outline" onClick={closeExtras}>
                      Kapat
                    </Button>
                  </DialogFooter>
                </>
              )}

              {extraMode === 'create' && (
                <>
                  <div className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <Label htmlFor="pef-key">varKey</Label>
                      <Input
                        id="pef-key"
                        value={formVarKey}
                        onChange={(e) => setFormVarKey(e.target.value)}
                        maxLength={255}
                        placeholder="Anahtar (zorunlu)"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pef-val">varValue</Label>
                      <Textarea
                        id="pef-val"
                        value={formVarValue}
                        onChange={(e) => setFormVarValue(e.target.value)}
                        rows={4}
                        className="resize-y min-h-[80px]"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ürün <code>GET …/products/{"{id}"}</code> (Product GET PDF).
                    </p>
                  </div>
                  <DialogFooter className="gap-2 mt-4">
                    <Button type="button" variant="outline" onClick={() => setExtraMode('list')}>
                      İptal
                    </Button>
                    <Button
                      type="button"
                      variant="save"
                      disabled={saving}
                      onClick={() => void submitCreateField()}
                    >
                      {saving ? 'Gönderiliyor...' : 'Oluştur'}
                    </Button>
                  </DialogFooter>
                </>
              )}

              {extraMode === 'edit' && (
                <>
                  {fieldEditLoading ? (
                    <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Kayıt id: {typeof fieldEditPayload?.id === 'number' ? fieldEditPayload.id : '—'}
                      </p>
                      <div className="space-y-1">
                        <Label htmlFor="pef-e-key">varKey</Label>
                        <Input
                          id="pef-e-key"
                          value={formVarKey}
                          onChange={(e) => setFormVarKey(e.target.value)}
                          maxLength={255}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="pef-e-val">varValue</Label>
                        <Textarea
                          id="pef-e-val"
                          value={formVarValue}
                          onChange={(e) => setFormVarValue(e.target.value)}
                          rows={4}
                          className="resize-y min-h-[80px]"
                        />
                      </div>
                    </div>
                  )}
                  <DialogFooter className="shrink-0 flex-row justify-between gap-2 mt-4">
                    <Button
                      type="button"
                      variant="delete"
                      size="icon"
                      disabled={fieldEditLoading || !fieldEditPayload}
                      onClick={() => setDeleteFieldOpen(true)}
                      aria-label="Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setExtraMode('list')}>
                        Listeye dön
                      </Button>
                      <Button
                        type="button"
                        variant="save"
                        disabled={fieldEditLoading || !fieldEditPayload || saving}
                        onClick={() => void submitEditField()}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                      </Button>
                    </div>
                  </DialogFooter>
                </>
              )}
            </TabsContent>

            <TabsContent
              value="info"
              forceMount
              className="flex flex-col flex-1 min-h-0 mt-4 data-[state=inactive]:hidden"
            >
              {infoMode === 'list' && (
                <>
                  {infoError && (
                    <div className="text-sm text-destructive whitespace-pre-wrap shrink-0">{infoError}</div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <p className="text-xs text-muted-foreground">
                      Toplam {infoTotal} kayıt · sayfa {infoPage}/{infoTotalPages}
                      {selectedInfoIds.size > 0 ? (
                        <span className="ml-2 text-foreground font-medium">· {selectedInfoIds.size} seçili</span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={
                          selectedInfoIds.size === 0 || infoLoading || bulkInfoLoadLoading || !selectedProduct
                        }
                        onClick={() => void openBulkInfoEditor()}
                      >
                        <ListChecks className="h-4 w-4 mr-1" />
                        {bulkInfoLoadLoading ? 'Yükleniyor...' : 'Toplu düzenle'}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={startCreateInfo}>
                        <Plus className="h-4 w-4 mr-1" />
                        Yeni (POST)
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto border rounded-md mt-2">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/95 z-[1]">
                        <tr className="border-b">
                          <th className="text-center p-2 font-medium w-10">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer rounded border-input accent-primary align-middle"
                              checked={allInfoOnPageSelected}
                              disabled={infoLoading || infoItems.length === 0}
                              ref={(el) => {
                                if (el)
                                  el.indeterminate =
                                    someInfoOnPageSelected && !allInfoOnPageSelected
                              }}
                              onChange={() => toggleSelectAllInfoOnPage()}
                              aria-label="Sayfadaki tüm ekstra bilgi kayıtlarını seç"
                            />
                          </th>
                          <th className="text-left p-2 font-medium w-20">id</th>
                          <th className="text-left p-2 font-medium">extraInfo.name</th>
                          <th className="text-center p-2 font-medium w-16">sıra</th>
                          <th className="text-left p-2 font-medium min-w-[180px]">value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {infoLoading ? (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-muted-foreground">
                              Yükleniyor...
                            </td>
                          </tr>
                        ) : infoItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-muted-foreground">
                              Bu ürün için ekstra bilgi kaydı yok.
                            </td>
                          </tr>
                        ) : (
                          infoItems.map((it) => (
                            <tr
                              key={it.id}
                              tabIndex={0}
                              className={cn(
                                'border-b border-border/60 hover:bg-muted/40 cursor-pointer',
                                selectedInfoIds.has(it.id) && 'bg-muted/50'
                              )}
                              onClick={() => void openEditInfo(it.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  void openEditInfo(it.id)
                                }
                              }}
                            >
                              <td
                                className="p-2 text-center align-middle w-10"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary align-middle"
                                  checked={selectedInfoIds.has(it.id)}
                                  onChange={(e) =>
                                    toggleInfoRowSelected(it.id, e.target.checked)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Kayıt #${it.id} seç`}
                                />
                              </td>
                              <td className="p-2 tabular-nums">{it.id}</td>
                              <td className="p-2 truncate max-w-[140px]" title={it.extraInfo?.name}>
                                {it.extraInfo?.name ?? '—'}
                              </td>
                              <td className="p-2 text-center tabular-nums">{it.extraInfo?.sortOrder ?? '—'}</td>
                              <td className="p-2 break-words whitespace-pre-wrap max-h-24 overflow-y-auto text-xs">
                                {it.value ?? '—'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <DialogFooter className="shrink-0 flex-row justify-between gap-2 sm:justify-between mt-4">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={infoPage <= 1 || infoLoading}
                        onClick={() => setInfoPage((p) => Math.max(1, p - 1))}
                      >
                        Önceki
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={infoPage >= infoTotalPages || infoLoading}
                        onClick={() => setInfoPage((p) => p + 1)}
                      >
                        Sonraki
                      </Button>
                    </div>
                    <Button type="button" variant="outline" onClick={closeExtras}>
                      Kapat
                    </Button>
                  </DialogFooter>
                </>
              )}

              {infoMode === 'create' && (
                <>
                  <div className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <Label htmlFor="pei-val">value</Label>
                      <Textarea
                        id="pei-val"
                        value={infoFormValue}
                        onChange={(e) => setInfoFormValue(e.target.value)}
                        rows={4}
                        className="resize-y min-h-[80px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pei-exid">extraInfo.id</Label>
                      <Input
                        id="pei-exid"
                        type="number"
                        min={1}
                        value={infoFormExId}
                        onChange={(e) => setInfoFormExId(e.target.value)}
                        placeholder="Ek bilgi tanım id (≥1)"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pei-exname">extraInfo.name</Label>
                      <Input
                        id="pei-exname"
                        value={infoFormExName}
                        onChange={(e) => setInfoFormExName(e.target.value)}
                        maxLength={255}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pei-exsort">extraInfo.sortOrder (0–99)</Label>
                      <Input
                        id="pei-exsort"
                        type="number"
                        min={0}
                        max={99}
                        value={infoFormExSort}
                        onChange={(e) => setInfoFormExSort(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ürün <code>GET …/products/{"{id}"}</code>; gövde ProductExtraInfo POST PDF ile uyumlu.
                    </p>
                  </div>
                  <DialogFooter className="gap-2 mt-4">
                    <Button type="button" variant="outline" onClick={() => setInfoMode('list')}>
                      İptal
                    </Button>
                    <Button
                      type="button"
                      variant="save"
                      disabled={saving}
                      onClick={() => void submitCreateInfo()}
                    >
                      {saving ? 'Gönderiliyor...' : 'Oluştur'}
                    </Button>
                  </DialogFooter>
                </>
              )}

              {infoMode === 'edit' && (
                <>
                  {infoEditLoading ? (
                    <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Kayıt id: {typeof infoEditPayload?.id === 'number' ? infoEditPayload.id : '—'}
                      </p>
                      <div className="space-y-1">
                        <Label htmlFor="pei-e-val">value</Label>
                        <Textarea
                          id="pei-e-val"
                          value={infoFormValue}
                          onChange={(e) => setInfoFormValue(e.target.value)}
                          rows={4}
                          className="resize-y min-h-[80px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="pei-e-exid">extraInfo.id</Label>
                        <Input
                          id="pei-e-exid"
                          type="number"
                          min={1}
                          value={infoFormExId}
                          onChange={(e) => setInfoFormExId(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="pei-e-exname">extraInfo.name</Label>
                        <Input
                          id="pei-e-exname"
                          value={infoFormExName}
                          onChange={(e) => setInfoFormExName(e.target.value)}
                          maxLength={255}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="pei-e-exsort">extraInfo.sortOrder (0–99)</Label>
                        <Input
                          id="pei-e-exsort"
                          type="number"
                          min={0}
                          max={99}
                          value={infoFormExSort}
                          onChange={(e) => setInfoFormExSort(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  <DialogFooter className="shrink-0 flex-row justify-between gap-2 mt-4">
                    <Button
                      type="button"
                      variant="delete"
                      size="icon"
                      disabled={infoEditLoading || !infoEditPayload}
                      onClick={() => setDeleteInfoOpen(true)}
                      aria-label="Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setInfoMode('list')}>
                        Listeye dön
                      </Button>
                      <Button
                        type="button"
                        variant="save"
                        disabled={infoEditLoading || !infoEditPayload || saving}
                        onClick={() => void submitEditInfo()}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                      </Button>
                    </div>
                  </DialogFooter>
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkInfoDialogOpen} onOpenChange={(o) => !o && closeBulkInfoDialog()}>
        <DialogContent className="max-w-lg max-h-[min(90vh,720px)] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {bulkInfoStep === 'edit' && 'Toplu güncelleme — ekstra bilgi'}
              {bulkInfoStep === 'preview' && 'Önizleme ve uygulama'}
              {bulkInfoStep === 'results' && 'Toplu güncelleme sonuçları'}
            </DialogTitle>
          </DialogHeader>

          {bulkInfoStep === 'edit' && (
            <>
              <p className="text-xs text-muted-foreground shrink-0">
                Her kayıt için extraInfo.name, sıra ve value alanlarını düzenleyin; gerekirse extraInfo.id
                (tanım) değiştirilebilir.
              </p>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 mt-2">
                {bulkInfoDrafts.map((d, index) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-border bg-muted/20 p-3 space-y-3 text-sm"
                  >
                    <p className="text-xs font-medium text-muted-foreground tabular-nums">
                      Kayıt #{d.id} · extra_info_to_products
                    </p>
                    <div className="space-y-1">
                      <Label htmlFor={`bulk-exname-${d.id}`}>extraInfo.name</Label>
                      <Input
                        id={`bulk-exname-${d.id}`}
                        value={d.name}
                        onChange={(e) => updateBulkDraft(index, { name: e.target.value })}
                        maxLength={255}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`bulk-sort-${d.id}`}>Sıra (sortOrder, 0–99)</Label>
                      <Input
                        id={`bulk-sort-${d.id}`}
                        type="number"
                        min={0}
                        max={99}
                        value={d.sortOrderStr}
                        onChange={(e) => updateBulkDraft(index, { sortOrderStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`bulk-val-${d.id}`}>value</Label>
                      <Textarea
                        id={`bulk-val-${d.id}`}
                        value={d.value}
                        onChange={(e) => updateBulkDraft(index, { value: e.target.value })}
                        rows={3}
                        className="resize-y min-h-[72px] text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`bulk-exid-${d.id}`}>extraInfo.id (tanım)</Label>
                      <Input
                        id={`bulk-exid-${d.id}`}
                        type="number"
                        min={1}
                        value={d.extraInfoId}
                        onChange={(e) => updateBulkDraft(index, { extraInfoId: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter className="gap-2 shrink-0 mt-4">
                <Button type="button" variant="outline" onClick={closeBulkInfoDialog}>
                  İptal
                </Button>
                <Button type="button" variant="save" onClick={goBulkInfoPreview}>
                  Önizle
                </Button>
              </DialogFooter>
            </>
          )}

          {bulkInfoStep === 'preview' && (
            <>
              <p className="text-xs text-muted-foreground shrink-0">
                Aşağıdaki {bulkInfoDrafts.length} kayıt PUT ile güncellenecek. Onayladığınızda sırayla
                uygulanır.
              </p>
              <div className="flex-1 min-h-0 overflow-y-auto border rounded-md mt-2">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/95 z-[1]">
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium w-16">id</th>
                      <th className="text-left p-2 font-medium">extraInfo.name</th>
                      <th className="text-center p-2 font-medium w-14">sıra</th>
                      <th className="text-left p-2 font-medium min-w-[120px]">value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkInfoDrafts.map((d) => (
                      <tr key={d.id} className="border-b border-border/60 align-top">
                        <td className="p-2 tabular-nums">{d.id}</td>
                        <td className="p-2">
                          <span className="block whitespace-pre-wrap break-words text-xs">{d.name}</span>
                        </td>
                        <td className="p-2 text-center tabular-nums">{d.sortOrderStr}</td>
                        <td className="p-2">
                          <span
                            className="block whitespace-pre-wrap break-words text-xs max-h-20 overflow-y-auto"
                            title={d.value}
                          >
                            {d.value || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter className="gap-2 shrink-0 mt-4 flex-row justify-between sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setBulkInfoStep('edit')}>
                  Geri
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={closeBulkInfoDialog}>
                    İptal
                  </Button>
                  <Button
                    type="button"
                    variant="save"
                    disabled={bulkInfoApplyLoading}
                    onClick={() => void applyBulkInfoUpdates()}
                  >
                    {bulkInfoApplyLoading ? 'Uygulanıyor...' : 'Uygula'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}

          {bulkInfoStep === 'results' && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 text-sm mt-1">
                {bulkInfoResults.map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      'rounded-md border px-3 py-2 text-xs',
                      r.ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-destructive/40 bg-destructive/10'
                    )}
                  >
                    <span className="font-mono tabular-nums font-medium">#{r.id}</span>
                    {r.ok ? (
                      <span className="ml-2 text-emerald-700 dark:text-emerald-400">Güncellendi</span>
                    ) : (
                      <span className="ml-2 text-destructive whitespace-pre-wrap">{r.message ?? 'Hata'}</span>
                    )}
                  </div>
                ))}
              </div>
              <DialogFooter className="shrink-0 mt-4">
                <Button
                  type="button"
                  variant="save"
                  onClick={() => {
                    closeBulkInfoDialog()
                    setSelectedInfoIds(new Set())
                  }}
                >
                  Tamam
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteFieldOpen}
        onOpenChange={setDeleteFieldOpen}
        title="Ekstra alanı sil"
        description={`product_extra_fields #${typeof fieldEditPayload?.id === 'number' ? fieldEditPayload.id : '—'} silinecek (DELETE, 204).`}
        onConfirm={() => void handleDeleteField()}
        loading={deleting}
      />

      <ConfirmDeleteDialog
        open={deleteInfoOpen}
        onOpenChange={setDeleteInfoOpen}
        title="Ekstra bilgiyi sil"
        description={`extra_info_to_products #${typeof infoEditPayload?.id === 'number' ? infoEditPayload.id : '—'} silinecek (DELETE, 204).`}
        onConfirm={() => void handleDeleteInfo()}
        loading={deleting}
      />
    </PageLayout>
  )
}
