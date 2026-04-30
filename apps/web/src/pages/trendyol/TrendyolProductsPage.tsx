import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Loader2, Search, Trash2, X } from 'lucide-react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { toastError, toastSuccess } from '@/lib/toast'
import {
  fetchTrendyolBrands,
  fetchTrendyolCategories,
  fetchTrendyolMasterPriceOptions,
  deleteTrendyolProduct,
  linkTrendyolBrandToMaster,
  linkTrendyolCategoryToMaster,
  linkTrendyolProductToMaster,
  submitTrendyolProductCreate,
  updateTrendyolPriceStock,
  type TrendyolBrandRow,
  type TrendyolCategoryFlatRow,
  type TrendyolCreateBody,
  type TrendyolPriceOption,
} from '@/lib/trendyol-api'
import { cn } from '@/lib/utils'

type ProductRow = {
  id: number
  name: string
  sku?: string
  price: number
  quantity?: number | null
  currency_symbol?: string
  barcode?: string | null
  productMainId?: string | null
  stockCode?: string | null
  title?: string | null
  brandName?: string | null
  brandId?: number | null
  categoryName?: string | null
  categoryId?: number | null
  salePrice?: number | null
  listPrice?: number | null
  approved?: boolean | null
  onSale?: boolean | null
  archived?: boolean | null
  masterProduct?: {
    id: number
    name: string
    sku?: string | null
    barcode?: string | null
    trendyol_product_id?: string | null
    trendyol_category_id?: number | null
    isLinked: boolean
  } | null
  masterBrand?: {
    id: number
    name: string
    code?: string | null
    trendyol_brand_id?: number | null
    isLinked: boolean
  } | null
  masterCategory?: {
    id: number
    name: string
    code?: string | null
    color?: string | null
    trendyol_category_id?: number | null
    isLinked: boolean
  } | null
}

function readEffectiveTrendyolBrandId(row: ProductRow | null): number | null {
  const direct = Number(row?.brandId)
  if (Number.isFinite(direct) && direct > 0) return direct
  const linked = Number(row?.masterBrand?.trendyol_brand_id)
  return Number.isFinite(linked) && linked > 0 ? linked : null
}

function readEffectiveTrendyolCategoryId(row: ProductRow | null): number | null {
  const direct = Number(row?.categoryId)
  if (Number.isFinite(direct) && direct > 0) return direct
  const linked = Number(row?.masterCategory?.trendyol_category_id)
  return Number.isFinite(linked) && linked > 0 ? linked : null
}

type MasterProductOption = {
  id: number
  name: string
  sku?: string | null
  barcode?: string | null
  brand_id?: number | null
  brand_code?: string | null
  brand_name?: string | null
  category_id?: number | null
  category_code?: string | null
  category_color?: string | null
  category_name?: string | null
  subcategory_name?: string | null
  trendyol_product_id?: string | null
  trendyol_category_id?: number | null
}

type MasterCategoryOption = {
  id: number
  name: string
  code?: string | null
  category_id?: number | null
  group_id?: number | null
  category_name?: string | null
  color?: string | null
  trendyol_category_id?: number | null
  hierarchy_names?: string[]
  parent_hierarchy_names?: string[]
}

type MasterBrandOption = {
  id: number
  name: string
  code?: string | null
  trendyol_brand_id?: number | null
}

const listDefaults = {
  search: '',
  productNameSearch: '',
  saleStatus: 'active' as 'all' | 'active' | 'passive',
  brandId: '',
  brandSearch: '',
  categoryId: '',
  categorySearch: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 12,
}

function parseAttributesJson(raw: string): { ok: true; value: TrendyolCreateBody['attributes'] } | { ok: false; error: string } {
  const t = raw.trim()
  if (!t) return { ok: false, error: 'Özellik listesi boş' }
  try {
    const v = JSON.parse(t) as unknown
    if (!Array.isArray(v)) return { ok: false, error: 'Özellikler bir dizi (array) olmalı' }
    return { ok: true, value: v as TrendyolCreateBody['attributes'] }
  } catch {
    return { ok: false, error: 'Geçersiz JSON' }
  }
}

function normalizeBadgeColor(c: string | undefined | null): string | null {
  const s = (c ?? '').trim()
  if (!s) return null
  if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return s.toLowerCase()
  if (/^#[0-9A-Fa-f]{3}$/i.test(s)) {
    const x = s.slice(1)
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase()
  }
  if (/^[0-9A-Fa-f]{6}$/i.test(s)) return `#${s}`.toLowerCase()
  if (/^[0-9A-Fa-f]{3}$/i.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase()
  return null
}

function textOnBadgeColor(bg: string): string {
  const hex = normalizeBadgeColor(bg)
  if (!hex || hex.length < 7) return '#171717'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return y > 0.55 ? '#171717' : '#ffffff'
}

function colorFromText(seed: string): string {
  const palette = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#16a34a', '#4f46e5', '#be123c']
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

function shortCodeFromText(value: string | undefined | null): string {
  const text = (value ?? '').trim()
  if (!text) return ''
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g, ''))
    .filter(Boolean)
  if (words.length >= 2) return words.slice(0, 3).map((word) => word[0]).join('').toLocaleUpperCase('tr-TR')
  return (words[0] ?? text).slice(0, 4).toLocaleUpperCase('tr-TR')
}

function ShortCodeBadge({
  code,
  color,
  fallbackClassName,
}: {
  code: string
  color?: string | null
  fallbackClassName?: string
}) {
  const bg = normalizeBadgeColor(color ?? '')
  const fg = bg ? textOnBadgeColor(bg) : ''
  return (
    <span
      className={cn(
        'inline-flex max-w-[4.5rem] shrink-0 items-center truncate rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none',
        !bg && fallbackClassName
      )}
      style={bg ? { backgroundColor: bg, color: fg } : undefined}
      title={code}
    >
      {code}
    </span>
  )
}

export function TrendyolProductsPage() {
  const [listState, setListState] = usePersistedListState('trendyol-products-v2', listDefaults)
  const {
    search,
    productNameSearch,
    saleStatus,
    brandId: brandFilterId,
    brandSearch,
    categoryId: categoryFilterId,
    categorySearch,
    page,
    pageSize,
    fitLimit,
  } = listState
  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [categories, setCategories] = useState<TrendyolCategoryFlatRow[]>([])
  const [categoryOptionsLoading, setCategoryOptionsLoading] = useState(false)
  const [brandOptions, setBrandOptions] = useState<TrendyolBrandRow[]>([])
  const [brandOptionsLoading, setBrandOptionsLoading] = useState(false)
  const [linkingId, setLinkingId] = useState<number | null>(null)
  const [linkingBrandId, setLinkingBrandId] = useState<number | null>(null)
  const [linkingCategoryId, setLinkingCategoryId] = useState<number | null>(null)
  const [masterLinkModalOpen, setMasterLinkModalOpen] = useState(false)
  const [masterLinkRow, setMasterLinkRow] = useState<ProductRow | null>(null)
  const [masterProductSearch, setMasterProductSearch] = useState('')
  const [masterProductOptions, setMasterProductOptions] = useState<MasterProductOption[]>([])
  const [masterProductOptionsLoading, setMasterProductOptionsLoading] = useState(false)
  const [masterProductOptionsError, setMasterProductOptionsError] = useState<string | null>(null)
  const [categoryLinkModalOpen, setCategoryLinkModalOpen] = useState(false)
  const [categoryLinkRow, setCategoryLinkRow] = useState<ProductRow | null>(null)
  const [masterCategorySearch, setMasterCategorySearch] = useState('')
  const [masterCategoryOptions, setMasterCategoryOptions] = useState<MasterCategoryOption[]>([])
  const [masterCategoryOptionsLoading, setMasterCategoryOptionsLoading] = useState(false)
  const [masterCategoryOptionsError, setMasterCategoryOptionsError] = useState<string | null>(null)
  const [brandLinkModalOpen, setBrandLinkModalOpen] = useState(false)
  const [brandLinkRow, setBrandLinkRow] = useState<ProductRow | null>(null)
  const [masterBrandSearch, setMasterBrandSearch] = useState('')
  const [masterBrandOptions, setMasterBrandOptions] = useState<MasterBrandOption[]>([])
  const [masterBrandOptionsLoading, setMasterBrandOptionsLoading] = useState(false)
  const [masterBrandOptionsError, setMasterBrandOptionsError] = useState<string | null>(null)
  const [priceStockModalOpen, setPriceStockModalOpen] = useState(false)
  const [priceStockRow, setPriceStockRow] = useState<ProductRow | null>(null)
  const [priceOptions, setPriceOptions] = useState<TrendyolPriceOption[]>([])
  const [priceOptionsLoading, setPriceOptionsLoading] = useState(false)
  const [priceOptionsError, setPriceOptionsError] = useState<string | null>(null)
  const [selectedPriceKey, setSelectedPriceKey] = useState('')
  const [priceStockQuantity, setPriceStockQuantity] = useState('')
  const [priceStockSavingId, setPriceStockSavingId] = useState<number | null>(null)
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null)
  const [highlightedRowIds, setHighlightedRowIds] = useState<Set<number>>(() => new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedProduct] = useState<ProductRow | null>(null)
  const [detailLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const highlightTimersRef = useRef<Map<number, number>>(new Map())

  const [categoryId, setCategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [cargoId, setCargoId] = useState('')
  const [desi, setDesi] = useState('1')
  const [productMainId, setProductMainId] = useState('')
  const [barcode, setBarcode] = useState('')
  const [stockCode, setStockCode] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [listPrice, setListPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [attributesJson, setAttributesJson] = useState(
    '[\n  { "attributeId": 0, "attributeValueId": 0 }\n]',
  )

  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize as number))
  const hasFilter =
    search.trim().length > 0 ||
    productNameSearch.trim().length > 0 ||
    saleStatus !== listDefaults.saleStatus ||
    brandFilterId.trim().length > 0 ||
    categoryFilterId.trim().length > 0

  const loadList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search.trim()) params.set('search', search.trim())
      if (productNameSearch.trim()) params.set('productName', productNameSearch.trim())
      if (saleStatus === 'active') params.set('onSale', 'true')
      if (saleStatus === 'passive') params.set('onSale', 'false')
      if (brandFilterId.trim()) params.set('brandId', brandFilterId.trim())
      if (categoryFilterId.trim()) params.set('categoryId', categoryFilterId.trim())
      const res = await fetch(`${API_URL}/api/trendyol/products?${params}`)
      const data = await parseJsonResponse<{
        data?: ProductRow[]
        total?: number
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Liste alınamadı')
      const list = data.data
      setRows(Array.isArray(list) ? list : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Hata')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, productNameSearch, saleStatus, brandFilterId, categoryFilterId])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    return () => {
      for (const timer of highlightTimersRef.current.values()) window.clearTimeout(timer)
      highlightTimersRef.current.clear()
    }
  }, [])

  const highlightRow = useCallback((rowId: number) => {
    const existingTimer = highlightTimersRef.current.get(rowId)
    if (existingTimer) window.clearTimeout(existingTimer)
    setHighlightedRowIds((prev) => new Set(prev).add(rowId))
    const timer = window.setTimeout(() => {
      setHighlightedRowIds((prev) => {
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })
      highlightTimersRef.current.delete(rowId)
    }, 1800)
    highlightTimersRef.current.set(rowId, timer)
  }, [])

  const updateRowById = useCallback(
    (rowId: number, updater: (row: ProductRow) => ProductRow) => {
      setRows((prev) => prev.map((row) => (row.id === rowId ? updater(row) : row)))
      highlightRow(rowId)
    },
    [highlightRow]
  )

  useEffect(() => {
    let cancelled = false
    setCategoryOptionsLoading(true)
    void (async () => {
      try {
        const { flat } = await fetchTrendyolCategories()
        if (!cancelled) setCategories(flat)
      } catch {
        if (!cancelled) setCategories([])
      } finally {
        if (!cancelled) setCategoryOptionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const q = brandSearch.trim()
    if (q.length < 2) {
      setBrandOptions([])
      setBrandOptionsLoading(false)
      return
    }
    setBrandOptionsLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await fetchTrendyolBrands(q)
          if (!cancelled) setBrandOptions(list)
        } catch {
          if (!cancelled) setBrandOptions([])
        } finally {
          if (!cancelled) setBrandOptionsLoading(false)
        }
      })()
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [brandSearch])

  function validateModal(): string | null {
    if (!selectedProduct) return 'Ürün seçilmedi'
    const ci = parseInt(categoryId, 10)
    const bi = parseInt(brandId, 10)
    const cg = parseInt(cargoId, 10)
    const dw = parseFloat(String(desi).replace(',', '.'))
    if (!Number.isFinite(ci) || ci <= 0) return 'Trendyol kategori ID pozitif tam sayı olmalı'
    if (!Number.isFinite(bi) || bi <= 0) return 'Trendyol marka ID pozitif tam sayı olmalı'
    if (!Number.isFinite(cg) || cg <= 0) return 'Kargo şirketi ID (cargoCompanyId) gerekli'
    if (!Number.isFinite(dw) || dw <= 0) return 'Desi (dimensionalWeight) pozitif olmalı'
    const attr = parseAttributesJson(attributesJson)
    if (!attr.ok) return attr.error
    if (!attr.value?.length) return 'En az bir kategori özelliği (attributes) gerekli'
    const pm = productMainId.trim()
    if (!pm) return 'Ürün ana kodu (productMainId) gerekli'
    if (!barcode.trim()) return 'Barkod gerekli'
    if (!stockCode.trim()) return 'Stok kodu gerekli'
    if (!title.trim()) return 'Başlık gerekli'
    if (!description.trim()) return 'Açıklama gerekli'
    const sp = parseFloat(String(salePrice).replace(',', '.'))
    const lp = listPrice.trim() ? parseFloat(String(listPrice).replace(',', '.')) : 0
    if (!Number.isFinite(sp) || sp <= 0) return 'Satış fiyatı geçerli olmalı'
    if (listPrice.trim() && (!Number.isFinite(lp) || lp < sp)) return 'Liste fiyatı satış fiyatından küçük olamaz'
    return null
  }

  async function handleSubmit() {
    const err = validateModal()
    if (err) {
      toastError('Kontrol', err)
      return
    }
    if (!selectedProduct) return
    const attr = parseAttributesJson(attributesJson)
    if (!attr.ok || !attr.value) return

    setSubmitLoading(true)
    try {
      const sp = parseFloat(String(salePrice).replace(',', '.'))
      const lpRaw = listPrice.trim() ? parseFloat(String(listPrice).replace(',', '.')) : undefined
      await submitTrendyolProductCreate({
        product_id: selectedProduct.id,
        image_origin: API_URL.replace(/\/+$/, ''),
        trendyol_category_id: parseInt(categoryId, 10),
        trendyol_brand_id: parseInt(brandId, 10),
        cargo_company_id: parseInt(cargoId, 10),
        dimensional_weight: parseFloat(String(desi).replace(',', '.')),
        attributes: attr.value,
        product_main_id: productMainId.trim(),
        barcode: barcode.trim(),
        stock_code: stockCode.trim(),
        title: title.trim(),
        description: description.trim(),
        sale_price: sp,
        list_price: lpRaw !== undefined && Number.isFinite(lpRaw) && lpRaw > 0 ? lpRaw : undefined,
      })
      toastSuccess('Trendyol', 'Ürün oluşturma isteği gönderildi. Onay ve batch durumu için Trendyol panel / batch API kullanın.')
      setModalOpen(false)
    } catch (e) {
      toastError('Trendyol', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setSubmitLoading(false)
    }
  }

  const fmtPrice = useMemo(
    () => (row: ProductRow) => {
      const n = Number(row.salePrice ?? row.price)
      if (!Number.isFinite(n)) return '—'
      const sym = row.currency_symbol?.trim()
      return sym ? `${n.toLocaleString('tr-TR')} ${sym}` : n.toLocaleString('tr-TR')
    },
    [],
  )

  const categoryOptions = useMemo(() => {
    const q = categorySearch.trim().toLocaleLowerCase('tr')
    const filtered = q
      ? categories.filter((cat) => cat.name.toLocaleLowerCase('tr').includes(q) || String(cat.id).includes(q))
      : categories
    return filtered.slice(0, 200)
  }, [categories, categorySearch])

  const selectedPriceOption = useMemo(
    () => priceOptions.find((option) => option.key === selectedPriceKey) ?? null,
    [priceOptions, selectedPriceKey]
  )

  const formatTry = useCallback((value: number | null | undefined) => {
    const n = Number(value ?? 0)
    if (!Number.isFinite(n)) return '—'
    return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
  }, [])

  const openPriceStockModal = useCallback((row: ProductRow) => {
    if (!row.masterProduct?.isLinked || row.masterProduct.id == null) {
      toastError('Master eşleşme gerekli', 'Fiyat/stok güncellemesi için önce master ürün eşleşmesi yapın.')
      return
    }
    if (!row.barcode) {
      toastError('Barkod gerekli', 'Trendyol fiyat/stok güncellemesi için barkod bulunamadı.')
      return
    }
    setPriceStockRow(row)
    setPriceOptions([])
    setSelectedPriceKey('')
    setPriceStockQuantity(String(row.quantity ?? 0))
    setPriceOptionsError(null)
    setPriceStockModalOpen(true)
  }, [])

  const openBrandLinkModal = useCallback((row: ProductRow) => {
    if (!readEffectiveTrendyolBrandId(row)) {
      toastError('Trendyol marka ID bulunamadı', 'Bu satırda eşleştirilecek Trendyol marka ID yok.')
      return
    }
    setBrandLinkRow(row)
    setMasterBrandSearch(row.brandName || '')
    setMasterBrandOptions([])
    setMasterBrandOptionsError(null)
    setBrandLinkModalOpen(true)
  }, [])

  useEffect(() => {
    if (!priceStockModalOpen || !priceStockRow?.masterProduct?.id) return
    let cancelled = false
    setPriceOptionsLoading(true)
    setPriceOptionsError(null)
    void (async () => {
      try {
        const data = await fetchTrendyolMasterPriceOptions(priceStockRow.masterProduct!.id)
        if (cancelled) return
        setPriceOptions(data.options)
        setSelectedPriceKey(data.options[0]?.key ?? '')
        if (data.product?.quantity != null) setPriceStockQuantity(String(data.product.quantity))
      } catch (e) {
        if (!cancelled) {
          setPriceOptions([])
          setSelectedPriceKey('')
          setPriceOptionsError(e instanceof Error ? e.message : 'Fiyat seçenekleri alınamadı')
        }
      } finally {
        if (!cancelled) setPriceOptionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [priceStockModalOpen, priceStockRow])

  const openMasterProductModal = useCallback((row: ProductRow) => {
    setMasterLinkRow(row)
    setMasterProductSearch(row.barcode || row.stockCode || row.sku || '')
    setMasterProductOptions([])
    setMasterProductOptionsError(null)
    setMasterLinkModalOpen(true)
  }, [])

  const openCategoryLinkModal = useCallback((row: ProductRow) => {
    if (!readEffectiveTrendyolCategoryId(row)) {
      toastError('Trendyol kategori ID bulunamadı', 'Bu satırda eşleştirilecek Trendyol kategori ID yok.')
      return
    }
    setCategoryLinkRow(row)
    setMasterCategorySearch(row.categoryName || '')
    setMasterCategoryOptions([])
    setMasterCategoryOptionsError(null)
    setCategoryLinkModalOpen(true)
  }, [])

  useEffect(() => {
    if (!brandLinkModalOpen || !readEffectiveTrendyolBrandId(brandLinkRow)) return
    let cancelled = false
    setMasterBrandOptionsLoading(true)
    setMasterBrandOptionsError(null)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            page: '1',
            limit: '30',
          })
          if (masterBrandSearch.trim()) params.set('search', masterBrandSearch.trim())
          const res = await fetch(`${API_URL}/api/product-brands?${params}`)
          const data = await parseJsonResponse<{
            data?: MasterBrandOption[]
            error?: string
          }>(res)
          if (!res.ok) throw new Error(data.error || 'Master markalar alınamadı')
          if (!cancelled) setMasterBrandOptions(Array.isArray(data.data) ? data.data : [])
        } catch (e) {
          if (!cancelled) {
            setMasterBrandOptions([])
            setMasterBrandOptionsError(e instanceof Error ? e.message : 'Master markalar alınamadı')
          }
        } finally {
          if (!cancelled) setMasterBrandOptionsLoading(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [brandLinkModalOpen, brandLinkRow, masterBrandSearch])

  useEffect(() => {
    if (!categoryLinkModalOpen || !readEffectiveTrendyolCategoryId(categoryLinkRow)) return
    let cancelled = false
    setMasterCategoryOptionsLoading(true)
    setMasterCategoryOptionsError(null)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            page: '1',
            limit: '30',
            include_inactive: '1',
            include_hierarchy: '1',
          })
          if (masterCategorySearch.trim()) params.set('search', masterCategorySearch.trim())
          const res = await fetch(`${API_URL}/api/product-categories?${params}`)
          const data = await parseJsonResponse<{
            data?: MasterCategoryOption[]
            error?: string
          }>(res)
          if (!res.ok) throw new Error(data.error || 'Master kategoriler alınamadı')
          if (!cancelled) setMasterCategoryOptions(Array.isArray(data.data) ? data.data : [])
        } catch (e) {
          if (!cancelled) {
            setMasterCategoryOptions([])
            setMasterCategoryOptionsError(e instanceof Error ? e.message : 'Master kategoriler alınamadı')
          }
        } finally {
          if (!cancelled) setMasterCategoryOptionsLoading(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [categoryLinkModalOpen, categoryLinkRow, masterCategorySearch])

  useEffect(() => {
    if (!masterLinkModalOpen || !masterLinkRow) return
    let cancelled = false
    setMasterProductOptionsLoading(true)
    setMasterProductOptionsError(null)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            page: '1',
            limit: '30',
          })
          if (masterProductSearch.trim()) params.set('search', masterProductSearch.trim())
          const res = await fetch(`${API_URL}/api/products?${params}`)
          const data = await parseJsonResponse<{
            data?: MasterProductOption[]
            error?: string
          }>(res)
          if (!res.ok) throw new Error(data.error || 'Master ürünler alınamadı')
          if (!cancelled) setMasterProductOptions(Array.isArray(data.data) ? data.data : [])
        } catch (e) {
          if (!cancelled) {
            setMasterProductOptions([])
            setMasterProductOptionsError(e instanceof Error ? e.message : 'Master ürünler alınamadı')
          }
        } finally {
          if (!cancelled) setMasterProductOptionsLoading(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [masterLinkModalOpen, masterLinkRow, masterProductSearch])

  const saveMasterLink = useCallback(
    async (masterProduct: MasterProductOption) => {
      if (!masterLinkRow) return
      setLinkingId(masterLinkRow.id)
      const trendyolBrandId = readEffectiveTrendyolBrandId(masterLinkRow)
      const trendyolCategoryId = readEffectiveTrendyolCategoryId(masterLinkRow)
      try {
        await linkTrendyolProductToMaster(masterProduct.id, masterLinkRow.id, trendyolCategoryId, trendyolBrandId)
        toastSuccess('Trendyol eşleşmesi kaydedildi', `Master #${masterProduct.id} → Trendyol #${masterLinkRow.id}`)
        updateRowById(masterLinkRow.id, (row) => ({
          ...row,
          masterProduct: {
            id: masterProduct.id,
            name: masterProduct.name,
            sku: masterProduct.sku,
            barcode: masterProduct.barcode,
            trendyol_product_id: String(masterLinkRow.id),
            trendyol_category_id: trendyolCategoryId,
            isLinked: true,
          },
          masterBrand:
            masterProduct.brand_id && trendyolBrandId
              ? {
                  id: masterProduct.brand_id,
                  name: masterProduct.brand_name || 'Master marka',
                  code: masterProduct.brand_code,
                  trendyol_brand_id: trendyolBrandId,
                  isLinked: true,
                }
              : row.masterBrand,
          masterCategory:
            masterProduct.category_id && trendyolCategoryId
              ? {
                  id: masterProduct.category_id,
                  name: masterProduct.category_name || 'Master kategori',
                  code: masterProduct.category_code,
                  color: masterProduct.category_color,
                  trendyol_category_id: trendyolCategoryId,
                  isLinked: true,
                }
              : row.masterCategory,
        }))
        setMasterLinkModalOpen(false)
        setMasterLinkRow(null)
      } catch (e) {
        toastError('Trendyol eşleşmesi kaydedilemedi', e)
      } finally {
        setLinkingId(null)
      }
    },
    [masterLinkRow, updateRowById]
  )

  const saveBrandSelection = useCallback(
    async (brand: MasterBrandOption) => {
      const row = brandLinkRow
      const trendyolId = readEffectiveTrendyolBrandId(row)
      if (!trendyolId) return
      if (!row) return
      setLinkingBrandId(row.id)
      try {
        await linkTrendyolBrandToMaster(brand.id, trendyolId)
        toastSuccess('Marka eşleşmesi kaydedildi', `${brand.name} → ${row.brandName ?? trendyolId}`)
        updateRowById(row.id, (current) => ({
          ...current,
          masterBrand: {
            id: brand.id,
            name: brand.name,
            code: brand.code,
            trendyol_brand_id: trendyolId,
            isLinked: true,
          },
        }))
        setBrandLinkModalOpen(false)
        setBrandLinkRow(null)
      } catch (e) {
        toastError('Marka eşleşmesi kaydedilemedi', e)
      } finally {
        setLinkingBrandId(null)
      }
    },
    [brandLinkRow, updateRowById]
  )

  const saveCategorySelection = useCallback(
    async (category: MasterCategoryOption) => {
      const row = categoryLinkRow
      const trendyolId = readEffectiveTrendyolCategoryId(row)
      if (!trendyolId) return
      if (!row) return
      setLinkingCategoryId(row.id)
      try {
        await linkTrendyolCategoryToMaster(category.id, trendyolId)
        toastSuccess('Kategori eşleşmesi kaydedildi', `${category.name} → ${row.categoryName ?? trendyolId}`)
        updateRowById(row.id, (current) => ({
          ...current,
          masterCategory: {
            id: category.id,
            name: category.name,
            code: category.code,
            color: category.color,
            trendyol_category_id: trendyolId,
            isLinked: true,
          },
        }))
        setCategoryLinkModalOpen(false)
        setCategoryLinkRow(null)
      } catch (e) {
        toastError('Kategori eşleşmesi kaydedilemedi', e)
      } finally {
        setLinkingCategoryId(null)
      }
    },
    [categoryLinkRow, updateRowById]
  )

  const savePriceStockUpdate = useCallback(async () => {
    if (!priceStockRow || !selectedPriceOption) return
    const qty = Math.max(0, Math.floor(Number(priceStockQuantity)))
    if (!Number.isFinite(qty)) {
      toastError('Miktar geçersiz', 'Miktar 0 veya daha büyük tam sayı olmalı.')
      return
    }
    const barcode = String(priceStockRow.barcode ?? '').trim()
    if (!barcode) {
      toastError('Barkod gerekli', 'Trendyol fiyat/stok güncellemesi için barkod bulunamadı.')
      return
    }
    setPriceStockSavingId(priceStockRow.id)
    try {
      await updateTrendyolPriceStock({
        barcode,
        quantity: qty,
        sale_price: selectedPriceOption.try_price,
        list_price: selectedPriceOption.try_price,
      })
      updateRowById(priceStockRow.id, (row) => ({
        ...row,
        quantity: qty,
        salePrice: selectedPriceOption.try_price,
        listPrice: selectedPriceOption.try_price,
        price: selectedPriceOption.try_price,
      }))
      toastSuccess('Fiyat/stok güncellendi', `${barcode} için ${formatTry(selectedPriceOption.try_price)} ve ${qty} adet gönderildi.`)
      setPriceStockModalOpen(false)
      setPriceStockRow(null)
    } catch (e) {
      toastError('Fiyat/stok güncellenemedi', e)
    } finally {
      setPriceStockSavingId(null)
    }
  }, [formatTry, priceStockQuantity, priceStockRow, selectedPriceOption, updateRowById])

  const deleteProductFromTrendyol = useCallback(
    async (row: ProductRow) => {
      const barcode = String(row.barcode ?? '').trim()
      if (!barcode) {
        toastError('Barkod gerekli', 'Trendyol ürün silme işlemi barkod ile yapılır.')
        return
      }
      const ok = window.confirm(
        `${row.title ?? row.name}\n\nBu ürün Trendyol silme API'sine gönderilecek. İşlem Trendyol şartlarına bağlı olarak batch sonucunda tamamlanır. Devam edilsin mi?`
      )
      if (!ok) return
      setDeletingProductId(row.id)
      try {
        const result = await deleteTrendyolProduct(barcode)
        updateRowById(row.id, (current) => ({ ...current }))
        toastSuccess(
          'Silme isteği gönderildi',
          result.batchRequestId ? `Batch ID: ${result.batchRequestId}` : 'Trendyol silme isteğini kabul etti.'
        )
      } catch (e) {
        toastError('Trendyol ürünü silinemedi', e)
      } finally {
        setDeletingProductId(null)
      }
    },
    [updateRowById]
  )

  return (
    <PageLayout
      title="Trendyol — Ürünler"
      description="Trendyol ürün entegrasyonu filterProducts servisiyle mağazadaki ürünleri listeler. Arama alanı barkod filtresi olarak gönderilir."
      backTo="/trendyol"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => void loadList()}
      headerActions={
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="relative flex-1 min-w-[12rem] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-9"
              placeholder="Barkod ara…"
              value={search}
              onChange={(e) => setListState({ search: e.target.value, page: 1 })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadList()
              }}
            />
            {hasFilter && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setListState({ search: '', page: 1 })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Aramayı temizle</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="relative flex-1 min-w-[14rem] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-9"
              placeholder="Ürün adı ara…"
              value={productNameSearch}
              onChange={(e) => setListState({ productNameSearch: e.target.value, page: 1 })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadList()
              }}
            />
            {productNameSearch.trim() ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setListState({ productNameSearch: '', page: 1 })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ürün adı aramasını temizle</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <select
            aria-label="Aktif pasif filtresi"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={saleStatus}
            onChange={(e) => {
              const value = e.target.value
              setListState({
                saleStatus: value === 'active' || value === 'passive' ? value : 'all',
                page: 1,
              })
            }}
          >
            <option value="all">Tümü</option>
            <option value="active">Aktif / satışta</option>
            <option value="passive">Pasif / satışta değil</option>
          </select>
          <div className="flex min-w-[13rem] flex-col gap-1">
            <Input
              className="h-9"
              placeholder="Marka ara…"
              value={brandSearch}
              onChange={(e) => setListState({ brandSearch: e.target.value, brandId: '', page: 1 })}
            />
            <select
              aria-label="Marka filtresi"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={brandFilterId}
              onChange={(e) => {
                const id = e.target.value
                const selected = brandOptions.find((brand) => String(brand.id) === id)
                setListState({ brandId: id, brandSearch: selected?.name ?? brandSearch, page: 1 })
              }}
            >
              <option value="">{brandOptionsLoading ? 'Markalar yükleniyor…' : 'Marka seç'}</option>
              {brandOptions.map((brand) => (
                <option key={brand.id} value={String(brand.id)}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[15rem] flex-col gap-1">
            <Input
              className="h-9"
              placeholder="Kategori ara…"
              value={categorySearch}
              onChange={(e) => setListState({ categorySearch: e.target.value, categoryId: '', page: 1 })}
            />
            <select
              aria-label="Kategori filtresi"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={categoryFilterId}
              disabled={categoryOptionsLoading}
              onChange={(e) => {
                const id = e.target.value
                const selected = categories.find((cat) => String(cat.id) === id)
                setListState({ categoryId: id, categorySearch: selected?.name ?? categorySearch, page: 1 })
              }}
            >
              <option value="">{categoryOptionsLoading ? 'Kategoriler yükleniyor…' : 'Kategori seç'}</option>
              {categoryOptions.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          {hasFilter ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setListState({
                  search: '',
                  productNameSearch: '',
                  saleStatus: listDefaults.saleStatus,
                  brandId: '',
                  brandSearch: '',
                  categoryId: '',
                  categorySearch: '',
                  page: 1,
                })
              }
            >
              Filtreleri temizle
            </Button>
          ) : null}
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
          onFitLimitChange={(n) => setListState({ fitLimit: n })}
          tableContainerRef={contentRef}
          hasFilter={hasFilter}
        />
      }
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardHeader className="shrink-0">
          <CardTitle>Ürün listesi</CardTitle>
          <CardDescription>
            Liste Trendyol <code className="text-[11px] bg-muted px-1 rounded">filterProducts</code> servisiyle
            çekilir. Ürün oluşturma ve güncelleme servisleri Trendyol dokümantasyonundaki ürün entegrasyonu akışına
            bağlıdır.{' '}
            <a
              href="https://developers.trendyol.com/docs/getting-started"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline font-medium"
            >
              Trendyol entegrasyon dokümantasyonu
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {loading && (
            <div className="flex flex-1 min-h-[8rem] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" />
              Yükleniyor…
            </div>
          )}
          {!loading && listError && (
            <p className="text-sm text-destructive py-4 px-4 shrink-0">{listError}</p>
          )}
          {!loading && !listError && (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto border-t border-border rounded-b-md">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-2 font-medium w-24">İçerik ID</th>
                    <th className="p-2 font-medium min-w-[320px]">Ürün</th>
                    <th className="p-2 font-medium min-w-[220px]">Marka / Kategori</th>
                    <th className="p-2 font-medium text-right">Satış</th>
                    <th className="p-2 font-medium text-right">Miktar</th>
                    <th className="p-2 font-medium text-center">Durum</th>
                    <th className="p-2 font-medium min-w-[180px]">Master eşleşme</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.id}-${row.barcode ?? row.stockCode ?? row.sku ?? ''}`}
                      className={cn(
                        'border-b border-border/60 transition-colors duration-700 hover:bg-muted/30',
                        row.masterProduct?.isLinked && 'bg-sky-500/5 hover:bg-sky-500/10',
                        highlightedRowIds.has(row.id) && 'bg-emerald-500/15 hover:bg-emerald-500/20'
                      )}
                    >
                      <td className="p-2 tabular-nums text-muted-foreground">{row.id}</td>
                      <td className="p-2">
                        <div className="max-w-[460px]">
                          <div className="truncate font-medium" title={row.title ?? row.name}>
                            {row.title ?? row.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                            <span>Barkod: {row.barcode || '—'}</span>
                            <span>Kod: {row.stockCode || row.sku || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-12 shrink-0 text-[11px] font-medium text-muted-foreground">Marka</span>
                            <span className="min-w-0 truncate" title={row.brandName ?? undefined}>
                              {row.brandName || '—'}
                            </span>
                            {row.masterBrand ? (
                              <ShortCodeBadge
                                code={row.masterBrand.code?.trim() || shortCodeFromText(row.masterBrand.name)}
                                color={colorFromText(`brand:${row.masterBrand.id}`)}
                              />
                            ) : null}
                            {readEffectiveTrendyolBrandId(row) ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant={row.masterBrand?.isLinked ? 'secondary' : 'outline'}
                                    className="h-7 w-7 shrink-0"
                                    disabled={linkingBrandId === row.id}
                                    onClick={() => openBrandLinkModal(row)}
                                    aria-label={
                                      row.masterBrand?.isLinked
                                        ? 'Marka eşleşmiş'
                                        : 'Trendyol markasını master marka seçerek eşleştir'
                                    }
                                  >
                                    <Link2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {row.masterBrand?.isLinked
                                    ? `Master marka bağlı: ${row.masterBrand.name}`
                                    : row.masterBrand
                                      ? `Master marka değiştir: ${row.masterBrand.name}`
                                      : 'Master marka seç'}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-12 shrink-0 text-[11px] font-medium text-muted-foreground">Kategori</span>
                            <span className="min-w-0 truncate" title={row.categoryName ?? undefined}>
                              {row.categoryName || '—'}
                            </span>
                            {row.masterCategory ? (
                              <ShortCodeBadge
                                code={row.masterCategory.code?.trim() || shortCodeFromText(row.masterCategory.name)}
                                fallbackClassName="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              />
                            ) : null}
                          {readEffectiveTrendyolCategoryId(row) ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant={row.masterCategory?.isLinked ? 'secondary' : 'outline'}
                                    className="h-7 w-7 shrink-0"
                                    disabled={linkingCategoryId === row.id}
                                    onClick={() => openCategoryLinkModal(row)}
                                    aria-label={
                                      row.masterCategory?.isLinked
                                        ? 'Kategori eşleşmiş'
                                        : 'Trendyol kategorisini master kategori seçerek eşleştir'
                                    }
                                  >
                                    <Link2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {row.masterCategory?.isLinked
                                    ? `Master kategori bağlı: ${row.masterCategory.name}`
                                    : row.masterCategory
                                      ? `Master kategori değiştir: ${row.masterCategory.name}`
                                      : 'Master kategori seç'}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmtPrice(row)}</td>
                      <td className="p-2">
                        <div className="flex items-center justify-end gap-2">
                          <span className="tabular-nums">{row.quantity ?? '—'}</span>
                          {row.masterProduct?.isLinked ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={priceStockSavingId === row.id}
                              onClick={() => openPriceStockModal(row)}
                            >
                              {priceStockSavingId === row.id ? 'Gönderiliyor…' : 'Fiyat/Stok'}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs',
                          row.approved ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
                        )}>
                          {row.approved ? 'Onaylı' : 'Onaysız'}
                        </span>
                        {row.onSale ? (
                          <span className="ml-1 inline-flex rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                            Satışta
                          </span>
                        ) : null}
                        {row.archived ? (
                          <span className="ml-1 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                            Arşiv
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={row.masterProduct?.isLinked ? 'update' : 'save'}
                                  className={cn(
                                    'h-7 w-fit px-2 text-xs',
                                    row.masterProduct?.isLinked
                                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-200'
                                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200'
                                  )}
                                  disabled={linkingId === row.id}
                                  onClick={() => openMasterProductModal(row)}
                                >
                                  {linkingId === row.id
                                    ? 'Kaydediliyor…'
                                    : row.masterProduct?.isLinked
                                      ? 'Değiştir'
                                      : 'Eşleştir'}
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {row.masterProduct?.isLinked
                                ? `Bağlı: ${row.masterProduct.name}`
                                : 'Master ürün eşleştir'}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="destructive"
                                  className="h-7 w-7"
                                  disabled={deletingProductId === row.id || !row.barcode}
                                  onClick={() => void deleteProductFromTrendyol(row)}
                                  aria-label="Trendyol ürününü sil"
                                >
                                  {deletingProductId === row.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {row.barcode ? 'Trendyol silme isteği gönder' : 'Silme için barkod gerekli'}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground p-6 text-center">Kayıt yok.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={priceStockModalOpen} onOpenChange={setPriceStockModalOpen}>
        <DialogContent className="max-w-lg max-h-[min(92vh,720px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fiyat ve miktar güncelle</DialogTitle>
            <DialogDescription>
              {priceStockRow ? (
                <>
                  <span className="font-medium text-foreground">{priceStockRow.title ?? priceStockRow.name}</span> için
                  kayıtlı master fiyatlardan birini seçin. Seçilen fiyat TL’ye çevrilip Trendyol’a gönderilir.
                </>
              ) : (
                'Fiyat ve miktar güncelle'
              )}
            </DialogDescription>
          </DialogHeader>
          {priceOptionsLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Fiyat seçenekleri yükleniyor…
            </div>
          ) : priceOptionsError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {priceOptionsError}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="ty-price-option">Master fiyat</Label>
                <select
                  id="ty-price-option"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={selectedPriceKey}
                  onChange={(e) => setSelectedPriceKey(e.target.value)}
                >
                  <option value="">Fiyat seç</option>
                  {priceOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label} - {option.price.toLocaleString('tr-TR')} {option.currency_symbol || option.currency_code || ''} → {formatTry(option.try_price)}
                    </option>
                  ))}
                </select>
              </div>
              {selectedPriceOption ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Kayıtlı fiyat</span>
                    <span className="font-medium">
                      {selectedPriceOption.price.toLocaleString('tr-TR')} {selectedPriceOption.currency_symbol || selectedPriceOption.currency_code}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="text-muted-foreground">Kur</span>
                    <span className="font-medium">{selectedPriceOption.exchange_rate_to_try.toLocaleString('tr-TR')}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="text-muted-foreground">Trendyol’a gönderilecek TL fiyat</span>
                    <span className="font-semibold">{formatTry(selectedPriceOption.try_price)}</span>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="ty-stock-qty">Miktar</Label>
                <Input
                  id="ty-stock-qty"
                  inputMode="numeric"
                  value={priceStockQuantity}
                  onChange={(e) => setPriceStockQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Trendyol servisine <code>salePrice</code> ve <code>listPrice</code> aynı TL değerle gönderilir.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPriceStockModalOpen(false)} disabled={priceStockSavingId != null}>
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="save"
              onClick={() => void savePriceStockUpdate()}
              disabled={!selectedPriceOption || priceStockSavingId != null || priceOptionsLoading}
            >
              {priceStockSavingId != null ? 'Gönderiliyor…' : 'Gönder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={brandLinkModalOpen} onOpenChange={setBrandLinkModalOpen}>
        <DialogContent className="max-w-2xl max-h-[min(92vh,720px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Master marka eşleştir</DialogTitle>
            <DialogDescription>
              {brandLinkRow ? (
                <>
                  <span className="font-medium text-foreground">{brandLinkRow.brandName ?? brandLinkRow.brandId}</span>{' '}
                  Trendyol markası için master marka seçin.
                </>
              ) : (
                'Master marka seçin'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Master marka adı, kodu veya ID ara…"
                value={masterBrandSearch}
                onChange={(e) => setMasterBrandSearch(e.target.value)}
              />
            </div>
            {masterBrandOptionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Master markalar yükleniyor…
              </div>
            ) : masterBrandOptionsError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {masterBrandOptionsError}
              </p>
            ) : masterBrandOptions.length === 0 ? (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                Master marka bulunamadı.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/60 text-left text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Master marka</th>
                      <th className="p-2 font-medium">Kod</th>
                      <th className="p-2 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masterBrandOptions.map((brand) => {
                      const trendyolBrandId = readEffectiveTrendyolBrandId(brandLinkRow)
                      const isLinked =
                        trendyolBrandId != null &&
                        Number(brand.trendyol_brand_id) === trendyolBrandId
                      const isSaving = linkingBrandId === brandLinkRow?.id
                      return (
                        <tr
                          key={brand.id}
                          role="button"
                          tabIndex={isLinked || isSaving ? -1 : 0}
                          className={cn(
                            'border-t border-border/60 transition-colors',
                            isLinked
                              ? 'bg-sky-500/10 text-sky-950 dark:text-sky-100'
                              : isSaving
                                ? 'opacity-60'
                                : 'cursor-pointer hover:bg-muted/60'
                          )}
                          onClick={() => {
                            if (!isLinked && !isSaving) void saveBrandSelection(brand)
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && !isLinked && !isSaving) {
                              e.preventDefault()
                              void saveBrandSelection(brand)
                            }
                          }}
                        >
                          <td className="p-2">
                            <div className="font-medium">{brand.name}</div>
                            <div className="text-xs text-muted-foreground">Master #{brand.id}</div>
                          </td>
                          <td className="p-2 font-mono text-xs text-muted-foreground">
                            {brand.code || '—'}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {isLinked ? 'Bağlı' : isSaving ? 'Kaydediliyor…' : brand.trendyol_brand_id ? `TY #${brand.trendyol_brand_id}` : 'Tıklayın'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBrandLinkModalOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryLinkModalOpen} onOpenChange={setCategoryLinkModalOpen}>
        <DialogContent className="max-w-2xl max-h-[min(92vh,720px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Master kategori eşleştir</DialogTitle>
            <DialogDescription>
              {categoryLinkRow ? (
                <>
                  <span className="font-medium text-foreground">{categoryLinkRow.categoryName ?? categoryLinkRow.categoryId}</span>{' '}
                  Trendyol kategorisi için master kategori seçin.
                </>
              ) : (
                'Master kategori seçin'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Master kategori adı, kodu veya ID ara…"
                value={masterCategorySearch}
                onChange={(e) => setMasterCategorySearch(e.target.value)}
              />
            </div>
            {masterCategoryOptionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Master kategoriler yükleniyor…
              </div>
            ) : masterCategoryOptionsError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {masterCategoryOptionsError}
              </p>
            ) : masterCategoryOptions.length === 0 ? (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                Master kategori bulunamadı.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/60 text-left text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Master kategori</th>
                      <th className="p-2 font-medium">Kod</th>
                      <th className="p-2 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masterCategoryOptions.map((category) => {
                      const trendyolCategoryId = readEffectiveTrendyolCategoryId(categoryLinkRow)
                      const isLinked =
                        trendyolCategoryId != null &&
                        Number(category.trendyol_category_id) === trendyolCategoryId
                      const isSaving = linkingCategoryId === categoryLinkRow?.id
                      const parentPath = Array.isArray(category.parent_hierarchy_names)
                        ? category.parent_hierarchy_names.filter(Boolean).join(' > ')
                        : ''
                      return (
                        <tr
                          key={category.id}
                          role="button"
                          tabIndex={isLinked || isSaving ? -1 : 0}
                          className={cn(
                            'border-t border-border/60 transition-colors',
                            isLinked
                              ? 'bg-sky-500/10 text-sky-950 dark:text-sky-100'
                              : isSaving
                                ? 'opacity-60'
                                : 'cursor-pointer hover:bg-muted/60'
                          )}
                          onClick={() => {
                            if (!isLinked && !isSaving) void saveCategorySelection(category)
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && !isLinked && !isSaving) {
                              e.preventDefault()
                              void saveCategorySelection(category)
                            }
                          }}
                        >
                          <td className="p-2">
                            <div className="font-medium">{category.name}</div>
                            {parentPath ? (
                              <div className="text-xs text-muted-foreground">Üst: {parentPath}</div>
                            ) : null}
                            <div className="text-xs text-muted-foreground">Master #{category.id}</div>
                          </td>
                          <td className="p-2 font-mono text-xs text-muted-foreground">
                            {category.code || '—'}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {isLinked ? 'Bağlı' : isSaving ? 'Kaydediliyor…' : category.trendyol_category_id ? `TY #${category.trendyol_category_id}` : 'Tıklayın'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCategoryLinkModalOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={masterLinkModalOpen} onOpenChange={setMasterLinkModalOpen}>
        <DialogContent className="max-w-3xl max-h-[min(92vh,760px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Master ürün eşleştir</DialogTitle>
            <DialogDescription>
              {masterLinkRow ? (
                <>
                  <span className="font-medium text-foreground">{masterLinkRow.title ?? masterLinkRow.name}</span> için
                  master ürün seçin. Ürün eşleşince Trendyol marka ve kategori ID'leri de seçilen master ürünün marka/kategorisine bağlanır.
                </>
              ) : (
                'Master ürün seçin'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {masterLinkRow ? (
              <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <span className="font-medium text-foreground">Marka:</span>{' '}
                  {masterLinkRow.masterBrand?.name ?? '—'}
                </div>
                <div>
                  <span className="font-medium text-foreground">Kategori:</span>{' '}
                  {masterLinkRow.masterCategory?.name ?? '—'}
                </div>
                <div>
                  <span className="font-medium text-foreground">Barkod:</span>{' '}
                  {masterLinkRow.barcode || '—'}
                </div>
                <div>
                  <span className="font-medium text-foreground">Kod:</span>{' '}
                  {masterLinkRow.stockCode || masterLinkRow.sku || '—'}
                </div>
              </div>
            ) : null}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Master ürün adı, SKU veya barkod ara…"
                value={masterProductSearch}
                onChange={(e) => setMasterProductSearch(e.target.value)}
              />
            </div>
            {masterProductOptionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Master ürünler yükleniyor…
              </div>
            ) : masterProductOptionsError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {masterProductOptionsError}
              </p>
            ) : masterProductOptions.length === 0 ? (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                Master ürün bulunamadı.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/60 text-left text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Master ürün</th>
                      <th className="p-2 font-medium">Kodlar</th>
                      <th className="p-2 font-medium">Kategori</th>
                      <th className="p-2 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masterProductOptions.map((product) => {
                      const isLinked =
                        masterLinkRow != null &&
                        String(product.trendyol_product_id ?? '') === String(masterLinkRow.id)
                      const isSaving = linkingId === masterLinkRow?.id
                      return (
                        <tr
                          key={product.id}
                          role="button"
                          tabIndex={isLinked || isSaving ? -1 : 0}
                          className={cn(
                            'border-t border-border/60 transition-colors',
                            isLinked
                              ? 'bg-sky-500/10 text-sky-950 dark:text-sky-100'
                              : isSaving
                                ? 'opacity-60'
                                : 'cursor-pointer hover:bg-muted/60'
                          )}
                          onClick={() => {
                            if (!isLinked && !isSaving) void saveMasterLink(product)
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && !isLinked && !isSaving) {
                              e.preventDefault()
                              void saveMasterLink(product)
                            }
                          }}
                        >
                          <td className="p-2">
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs text-muted-foreground">Master #{product.id}</div>
                          </td>
                          <td className="p-2 font-mono text-xs text-muted-foreground">
                            <div>SKU: {product.sku || '—'}</div>
                            <div>Barkod: {product.barcode || '—'}</div>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {product.subcategory_name || product.category_name || '—'}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {isLinked ? 'Bağlı' : isSaving ? 'Kaydediliyor…' : product.trendyol_product_id ? `TY #${product.trendyol_product_id}` : 'Tıklayın'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMasterLinkModalOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[min(92vh,760px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trendyol’a aktar</DialogTitle>
            <DialogDescription>
              {selectedProduct ? (
                <>
                  <span className="font-medium text-foreground">{selectedProduct.name}</span> — Zorunlu alanlar Trendyol
                  kurallarına göre kontrol edilir (barkod, başlık ≤100, fiyat, desi, kargo, özellikler, https görsel).
                </>
              ) : (
                'Ürün seçin'
              )}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Ürün yükleniyor…
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ty-cat">Trendyol kategori ID *</Label>
                  <Input
                    id="ty-cat"
                    inputMode="numeric"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    placeholder="ör. 411"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ty-brand">Trendyol marka ID *</Label>
                  <Input
                    id="ty-brand"
                    inputMode="numeric"
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    placeholder="Brand list API"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ty-cargo">Kargo şirketi ID *</Label>
                  <Input
                    id="ty-cargo"
                    inputMode="numeric"
                    value={cargoId}
                    onChange={(e) => setCargoId(e.target.value)}
                    placeholder="cargoCompanyId"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ty-desi">Desi *</Label>
                  <Input
                    id="ty-desi"
                    inputMode="decimal"
                    value={desi}
                    onChange={(e) => setDesi(e.target.value)}
                    placeholder="ör. 2"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ty-attr">Kategori özellikleri (JSON) *</Label>
                <Textarea
                  id="ty-attr"
                  className="font-mono text-xs min-h-[100px]"
                  value={attributesJson}
                  onChange={(e) => setAttributesJson(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Kategori niteliklerinden en az bir çift. Örnek:{' '}
                  <code className="bg-muted px-1 rounded">{'{ "attributeId": 338, "attributeValueId": 6980 }'}</code>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ty-pm">Ürün ana kodu (productMainId) *</Label>
                  <Input id="ty-pm" value={productMainId} onChange={(e) => setProductMainId(e.target.value)} maxLength={40} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ty-bc">Barkod *</Label>
                  <Input id="ty-bc" value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={40} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ty-sk">Stok kodu (stockCode) *</Label>
                <Input id="ty-sk" value={stockCode} onChange={(e) => setStockCode(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ty-title">Başlık (≤100) *</Label>
                <Input id="ty-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ty-desc">Açıklama *</Label>
                <Textarea
                  id="ty-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[100px] text-sm"
                  maxLength={30000}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ty-sale">Satış fiyatı (TRY) *</Label>
                  <Input
                    id="ty-sale"
                    inputMode="decimal"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ty-list">Liste fiyatı (TRY)</Label>
                  <Input
                    id="ty-list"
                    inputMode="decimal"
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    placeholder="Boş: satış × 1,08"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 p-2">
                Görseller: ürün kartındaki görseller, API kökü ile{' '}
                <code className="text-[10px]">https://…/storage/serve?key=…</code> adresine dönüştürülür (
                <code className="text-[10px]">{API_URL}</code>). Trendyol sunucusunun bu adresi indirebilmesi gerekir.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={submitLoading}>
              İptal
            </Button>
            <Button type="button" variant="save" onClick={() => void handleSubmit()} disabled={submitLoading || detailLoading}>
              {submitLoading ? 'Gönderiliyor…' : 'Trendyol’a gönder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
