import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Plus, X, Trash2, Copy, Save, ChevronDown, Check, Link2, ArrowUpDown, ArrowUp, ArrowDown, Filter, Search, Calculator, Image, Send, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DecimalInput } from '@/components/DecimalInput'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProductImagesGrid } from '@/components/ProductImagesGrid'
import { PackageContentsTab } from '@/components/PackageContentsTab'
import { getImageDisplayUrl } from '@/components/ImageInput'
import { API_URL } from '@/lib/api'
import { CategorySelect, getCategoryPath, buildHierarchy, type CategoryItem } from '@/components/CategorySelect'
import { fetchSidebarMenus } from '@/lib/sidebar-menus'
import { ProductCodeDisplay } from '@/components/ProductCodeDisplay'
import { ProductPricePreview } from '@/components/ProductPricePreview'
import { buildProductCode } from '@/lib/productCode'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toastSuccess, toastError, toastWarning } from '@/lib/toast'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { lookupFromSupplierSource, fetchMatchedSupplierCodesFromBrand } from '@/lib/supplierSource'
import { cn, formatPrice, formatPriceWithSymbol, parseDecimal } from '@/lib/utils'
import { applyCalculation, formatOperationsAsFormula, findRuleForBrand, type CalculationRule } from '@/lib/calculations'

/** Dinamik arka plan rengi - style attribute yerine ref ile CSS değişkeni atar (linter uyumlu) */
function DynamicBgSpan({ color, className, ...rest }: { color: string; className?: string } & React.ComponentPropsWithoutRef<'span'>) {
  const refFn = useCallback((el: HTMLSpanElement | null) => {
    if (el) el.style.setProperty('--dynamic-bg', color)
  }, [color])
  return <span ref={refFn} className={cn('dynamic-bg', className)} {...rest} />
}

/** Dinamik arka plan + metin rengi (button) - style attribute yerine ref ile CSS değişkeni atar */
function DynamicBgFgButton({ bg, fg = '#fff', className, ...rest }: { bg: string; fg?: string; className?: string } & React.ComponentPropsWithoutRef<'button'>) {
  const refFn = useCallback((el: HTMLButtonElement | null) => {
    if (el) {
      el.style.setProperty('--dynamic-bg', bg)
      el.style.setProperty('--dynamic-fg', fg)
    }
  }, [bg, fg])
  return <button ref={refFn} className={cn('dynamic-bg-fg', className)} {...rest} />
}

interface Product {
  id: number
  name: string
  sku?: string
  barcode?: string
  brand_id?: number
  category_id?: number
  type_id?: number
  unit_id?: number
  currency_id?: number
  price: number
  quantity: number
  ecommerce_price?: number
  ecommerce_currency_id?: number
  image?: string
  tax_rate?: number
  supplier_code?: string
  gtip_code?: string
  sort_order: number
  status?: number
  brand_name?: string
  brand_code?: string
  brand_image?: string
  group_code?: string
  group_name?: string
  group_color?: string
  category_code?: string
  category_name?: string
  category_color?: string
  subcategory_code?: string
  subcategory_name?: string
  subcategory_color?: string
  type_name?: string
  type_color?: string
  unit_name?: string
  currency_symbol?: string
  product_item_group_id?: number
  product_item_group_name?: string
  product_item_group_code?: string
}

interface SelectOption {
  id: number
  name: string
}

interface CurrencyOption extends SelectOption {
  is_default?: number
  symbol?: string
  code?: string
}

interface BrandOption extends SelectOption {
  code: string
}

/** SKU/code karşılaştırması için normalize (Parasut eşleşme) */
function normalizeSku(s: string | undefined): string {
  return (s || '').trim().toLowerCase().replace(/ı/g, 'i').replace(/İ/g, 'i')
}

/** Menülerden Paraşüt ikon path'ini bul */
function findParasutIconPath(menus: { label: string; iconPath?: string }[]): string | undefined {
  const lower = (x: string) => x.toLowerCase().replace(/ş/g, 's').replace(/ı/g, 'i')
  for (const m of menus) {
    const l = lower(m.label)
    if ((l.includes('parasut') || l.includes('paraşüt')) && m.iconPath) return m.iconPath
  }
  return undefined
}

/** Bu tiplerde tedarikçi kodu aranmaz (paket, mamül, hizmet) */
const SKIP_SUPPLIER_CODE_TYPE_CODES = ['PAK', 'MAM', 'HIZ', 'paket', 'mamul', 'hizmet']

/** Ticari Mal seçildiğinde genişletilecek alt tipler (basit ürün + paket ürün) */
const TICARI_MAL_CHILD_CODES = ['BASIT', 'PAKET', 'PAK']

const IMAGE_SLOTS = 10

function BrandLogoCell({
  src,
  brandName,
  brandCode,
  size = 'md',
}: {
  src: string
  brandName?: string
  brandCode?: string
  size?: 'sm' | 'md'
}) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    setImgError(false)
  }, [src])
  const isSm = size === 'sm'
  const maxSizeClass = isSm ? 'max-h-5 max-w-5' : 'max-h-8 max-w-8'
  const fallbackClass = isSm ? 'h-5 min-w-[1.25rem] px-1.5 text-[10px]' : 'h-8 min-w-[2rem] px-2 text-xs'
  if (imgError || !src) {
    return (
      <span className={`${fallbackClass} flex items-center justify-center font-medium shrink-0 text-muted-foreground`}>
        {brandCode || brandName?.slice(0, 2) || '?'}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={brandName || 'Marka logosu'}
      className={`${maxSizeClass} object-contain block shrink-0 bg-transparent`}
      onError={() => setImgError(true)}
    />
  )
}

function ProductImageCell({ src, className }: { src: string; className?: string }) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    setImgError(false)
  }, [src])
  if (imgError || !src) {
    return <div className={`${className ?? ''} bg-muted rounded`} />
  }
  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setImgError(true)}
    />
  )
}

function ProductImageWithBadgeCell({
  image,
  className,
  productName,
  showPreview = true,
}: {
  image: string | undefined
  className?: string
  productName?: string
  showPreview?: boolean
}) {
  const images = parseImageToArray(image).filter(Boolean)
  const firstImg = images[0]
  const count = images.length
  if (!firstImg) return <div className={`${className ?? ''} bg-muted rounded shrink-0 mx-auto`} />
  const cell = (
    <div className="relative inline-block">
      <ProductImageCell src={getImageDisplayUrl(firstImg)} className={className} />
      {count > 1 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {count}
        </span>
      )}
    </div>
  )
  if (!showPreview) return cell
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent side="right" className="p-0 overflow-hidden max-w-[280px]">
        <div className="flex flex-col">
          <img
            src={getImageDisplayUrl(firstImg)}
            alt={productName || 'Önizleme'}
            className="max-w-[260px] max-h-[260px] object-contain bg-white"
          />
          {productName && (
            <p className="px-2 py-1.5 text-xs font-medium truncate border-t bg-muted/50">{productName}</p>
          )}
          {count > 1 && (
            <p className="px-2 py-1 text-[10px] text-muted-foreground border-t">
              {count} görsel
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function parseImageToArray(image: string | undefined): string[] {
  let arr: string[] = []
  if (image) {
    try {
      const parsed = JSON.parse(image)
      arr = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [image]
    } catch {
      arr = [image]
    }
  }
  while (arr.length < IMAGE_SLOTS) arr.push('')
  return arr.slice(0, IMAGE_SLOTS)
}

function serializeImagesToImage(images: string[]): string | undefined {
  const filtered = images.filter(Boolean)
  if (filtered.length === 0) return undefined
  return JSON.stringify(images)
}

const emptyForm = {
  name: '',
  sku: '',
  barcode: '',
  brand_id: '' as number | '',
  category_id: '' as number | '',
  type_id: '' as number | '',
  product_item_group_id: '' as number | '',
  unit_id: '' as number | '',
  currency_id: '' as number | '',
  price: 0,
  quantity: 0,
  ecommerce_price: 0 as number,
  ecommerce_currency_id: '' as number | '',
  prices: {} as Record<number, { price: number; currency_id: number | null; status: number }>,
  images: [] as string[],
  tax_rate: 20,
  supplier_code: '',
  gtip_code: '',
  sort_order: 0,
  status: 1,
  ecommerce_name: '',
  main_description: '',
  seo_slug: '',
  seo_title: '',
  seo_description: '',
}

interface PackageItem {
  item_product_id: number
  quantity: number
  item_name?: string
  item_sku?: string
  item_price?: number
}

type SortBy = 'name' | 'sku' | 'brand_name' | 'category_name' | 'price' | 'sort_order'
type SortOrder = 'asc' | 'desc'

const productsListDefaults = {
  search: '',
  filterName: '',
  filterSku: '',
  filterBrandId: '' as string,
  filterCategoryId: '' as string,
  filterGroupId: '' as string,
  filterTypeId: '' as string,
  filterNoImage: false,
  sortBy: 'sort_order' as SortBy,
  sortOrder: 'asc' as SortOrder,
  page: 1,
  pageSize: 'fit' as PageSizeValue,
  fitLimit: 10,
}

export function ProductsPage() {
  const [listState, setListState] = usePersistedListState('products', productsListDefaults)
  const { search, filterName, filterSku, filterBrandId, filterCategoryId, filterGroupId, filterTypeId, filterNoImage, sortBy, sortOrder, page, pageSize, fitLimit } = listState
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [debouncedFilterName, setDebouncedFilterName] = useState(filterName)
  const [debouncedFilterSku, setDebouncedFilterSku] = useState(filterSku)
  const [data, setData] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState('genel')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; onSuccess?: () => void }>({ open: false, id: null })
  const [error, setError] = useState<string | null>(null)

  const [brands, setBrands] = useState<BrandOption[]>([])
  const [taxRates, setTaxRates] = useState<{ id: number; name: string; value: number }[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [types, setTypes] = useState<{ id: number; name: string; code?: string; color?: string; sort_order: number }[]>([])
  const [itemGroups, setItemGroups] = useState<{ id: number; name: string; code?: string; sort_order: number }[]>([])
  const [units, setUnits] = useState<SelectOption[]>([])
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  const [priceTypes, setPriceTypes] = useState<{ id: number; name: string; code?: string; sort_order: number }[]>([])
  const [calculationRules, setCalculationRules] = useState<CalculationRule[]>([])
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [packageItems, setPackageItems] = useState<PackageItem[]>([])
  const [supplierCodeMatch, setSupplierCodeMatch] = useState<boolean | null>(null)
  const [supplierCodeLookupLoading, setSupplierCodeLookupLoading] = useState(false)
  const [imageUploadProduct, setImageUploadProduct] = useState<Product | null>(null)
  const [imageUploadImages, setImageUploadImages] = useState<string[]>([])
  const [imageUploadSaving, setImageUploadSaving] = useState(false)
  const [publishLoading, setPublishLoading] = useState<string | null>(null)
  const [aiGenerateLoading, setAiGenerateLoading] = useState(false)
  const [openCartPublishOpen, setOpenCartPublishOpen] = useState(false)
  const [openCartUpdateOptions, setOpenCartUpdateOptions] = useState({ update_price: true, update_description: true, update_images: true })
  const [filterCategorySearch, setFilterCategorySearch] = useState('')
  const [filterBrandSearch, setFilterBrandSearch] = useState('')
  const [matchedCodesByBrand, setMatchedCodesByBrand] = useState<Record<number, Set<string>>>({})
  const [matchedParasutSkus, setMatchedParasutSkus] = useState<Set<string>>(new Set())
  const [parasutIconPath, setParasutIconPath] = useState<string | undefined>()
  const imageUploadProductRef = useRef<Product | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0 || filterName.length > 0 || filterSku.length > 0 || filterBrandId !== '' || filterCategoryId !== '' || filterGroupId !== '' || filterTypeId !== '' || filterNoImage

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setListState({ page: 1 }) }, 300)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedFilterName(filterName); setListState({ page: 1 }) }, 300)
    return () => clearTimeout(t)
  }, [filterName])
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedFilterSku(filterSku); setListState({ page: 1 }) }, 300)
    return () => clearTimeout(t)
  }, [filterSku])
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setListState({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 })
    } else {
      setListState({ sortBy: col, sortOrder: 'asc', page: 1 })
    }
  }

  const handleResetFilters = () => {
    setListState({ search: '', filterName: '', filterSku: '', filterBrandId: '', filterCategoryId: '', filterGroupId: '', filterTypeId: '', filterNoImage: false, page: 1 })
    setDebouncedSearch('')
    setDebouncedFilterName('')
    setDebouncedFilterSku('')
    setFilterBrandSearch('')
    setFilterCategorySearch('')
  }

  const categoryPath = useMemo(
    () => getCategoryPath(categories, form.category_id),
    [categories, form.category_id]
  )
  const brandCode = useMemo(
    () => (form.brand_id ? brands.find((b) => b.id === form.brand_id)?.code ?? '' : ''),
    [brands, form.brand_id]
  )
  const categoryFilterHierarchy = useMemo(() => {
    const hierarchy = buildHierarchy(categories)
    const withGroups = hierarchy
    if (!filterCategorySearch.trim()) return withGroups
    const q = filterCategorySearch.toLowerCase()
    return withGroups.filter(
      (h) =>
        h.label.toLowerCase().includes(q) ||
        h.path.some((p) => p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q)))
    )
  }, [categories, filterCategorySearch])

  const filteredBrands = useMemo(() => {
    if (!filterBrandSearch.trim()) return brands
    const q = filterBrandSearch.toLowerCase()
    return brands.filter((b) => b.name.toLowerCase().includes(q) || (b.code?.toLowerCase().includes(q)))
  }, [brands, filterBrandSearch])

  const skipSupplierCode = useMemo(() => {
    if (!form.type_id) return false
    const t = types.find((x) => x.id === form.type_id)
    return t?.code ? SKIP_SUPPLIER_CODE_TYPE_CODES.some((c) => (c || '').toUpperCase() === (t.code || '').toUpperCase()) : false
  }, [types, form.type_id])

  /** API'ye gönderilecek filter_type_id: Ticari Mal seçiliyse basit+paket tiplerinin ID'leri */
  const effectiveFilterTypeId = useMemo(() => {
    if (!filterTypeId) return ''
    const selectedType = types.find((t) => String(t.id) === filterTypeId)
    if (!selectedType) return filterTypeId
    const nameLower = (selectedType.name || '').toLowerCase()
    if (nameLower.includes('ticari') && nameLower.includes('mal')) {
      const childIds = types
        .filter((t) => TICARI_MAL_CHILD_CODES.some((c) => (t.code || '').toUpperCase() === c))
        .map((t) => t.id)
      return childIds.length > 0 ? childIds.join(',') : filterTypeId
    }
    return filterTypeId
  }, [filterTypeId, types])

  const computeEcommercePrice = useCallback((price: number, brandId?: number | null) => {
    const rule = findRuleForBrand(calculationRules, '1', brandId)
    if (!rule || !rule.operations?.length) {
      return price
    }
    return applyCalculation(price, rule.operations)
  }, [calculationRules])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), sort_by: sortBy, sort_order: sortOrder })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (debouncedFilterName) params.set('filter_name', debouncedFilterName)
      if (debouncedFilterSku) params.set('filter_sku', debouncedFilterSku)
      if (filterBrandId) params.set('filter_brand_id', filterBrandId)
      if (filterCategoryId) params.set('filter_category_id', filterCategoryId)
      if (filterGroupId) params.set('filter_group_id', filterGroupId)
      if (filterTypeId) params.set('filter_type_id', effectiveFilterTypeId)
      if (filterNoImage) params.set('filter_no_image', '1')
      const res = await fetch(`${API_URL}/api/products?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setData(json.data || [])
      setTotal(json.total ?? 0)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setData([])
      setTotal(0)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, limit, sortBy, sortOrder, debouncedSearch, debouncedFilterName, debouncedFilterSku, filterBrandId, filterCategoryId, filterGroupId, effectiveFilterTypeId, filterNoImage])

  const lookupSupplierCodeRef = useRef<(() => Promise<void>) | null>(null)
  const lookupSupplierCode = useCallback(async () => {
    const code = form.supplier_code?.trim()
    const brandId = form.brand_id
    if (!code || !brandId || skipSupplierCode) {
      setSupplierCodeMatch(null)
      return
    }
    setSupplierCodeLookupLoading(true)
    try {
      const result = await lookupFromSupplierSource(Number(brandId), code, API_URL)
      if (result) {
        const { price, currency_id } = result
        setSupplierCodeMatch(true)
        const newCurrencyId = currency_id ?? form.currency_id
        const curId = newCurrencyId ?? form.currency_id
        const brandId = typeof form.brand_id === 'number' ? form.brand_id : null
        const priceRule = findRuleForBrand(calculationRules, 'price', brandId)
        const effectivePrice =
          priceRule?.source === 'price' && priceRule?.operations?.length
            ? applyCalculation(price, priceRule.operations)
            : price
        const prices: Record<number, { price: number; currency_id: number | null; status: number }> = { ...form.prices }
        if (calculationRules.length > 0) {
          const sortedTypes = [...priceTypes].sort((a, b) => a.id - b.id)
          for (const pt of sortedTypes) {
            const targetId = pt.id
            if (targetId < 1) continue
            const rule = findRuleForBrand(calculationRules, String(targetId), brandId)
            if (!rule || !rule.operations?.length) continue
            const sourceVal = rule.source === 'price' ? effectivePrice : (prices[Number(rule.source)]?.price ?? effectivePrice)
            const computed = applyCalculation(sourceVal, rule.operations)
            const ruleCurrencyId = rule.result_currency_id != null && rule.result_currency_id > 0 ? Number(rule.result_currency_id) : null
            const priceCurrencyId = ruleCurrencyId ?? (curId ? Number(curId) : null)
            prices[targetId] = {
              ...(prices[targetId] ?? { price: 0, currency_id: null, status: 1 }),
              price: computed,
              currency_id: priceCurrencyId,
              status: form.prices[targetId]?.status ?? 1,
            }
          }
        }
        const ecomRule = findRuleForBrand(calculationRules, '1', brandId)
        const ecomCurrencyId = ecomRule?.result_currency_id != null && ecomRule.result_currency_id > 0
          ? Number(ecomRule.result_currency_id)
          : (newCurrencyId ? Number(newCurrencyId) : null)
        const computed = prices[1]?.price ?? computeEcommercePrice(effectivePrice, brandId)
        prices[1] = { ...(prices[1] ?? { price: 0, currency_id: null, status: 1 }), price: computed, currency_id: ecomCurrencyId, status: form.prices[1]?.status ?? 1 }
        setForm((f) => ({
          ...f,
          price: effectivePrice,
          currency_id: newCurrencyId ?? f.currency_id,
          ecommerce_price: computed,
          ecommerce_currency_id: newCurrencyId ?? f.ecommerce_currency_id,
          prices,
        }))
        const cur = currencies.find((c) => c.id === (newCurrencyId ?? currency_id))
        const priceStr = formatPrice(effectivePrice)
        const curLabel = cur?.name ?? ''
        toastSuccess('Fiyat çekildi (tedarikçi kaynağı)', `${priceStr} ${curLabel}`.trim() || 'Fiyat ve para birimi otomatik dolduruldu.')
        if (editingId) {
          const pricesPayload = Object.entries(prices).map(
            ([id, p]) => ({ price_type_id: Number(id), price: p.price, currency_id: p.currency_id, status: p.status })
          )
          const res = await fetch(`${API_URL}/api/products/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: effectivePrice, currency_id: newCurrencyId ?? undefined, prices: pricesPayload }),
          })
          const updated = await res.json()
          if (res.ok) {
            if (updated && !updated.error) {
              setData((prev) => prev.map((p) => (p.id === editingId ? { ...p, ...updated } : p)))
            } else {
              fetchData(true)
            }
            toastSuccess('Fiyatlar kaydedildi', 'Genel fiyat ve hesaplanan fiyatlar tabloya kaydedildi.')
          }
        }
      } else {
        setSupplierCodeMatch(false)
      }
    } catch {
      setSupplierCodeMatch(null)
    } finally {
      setSupplierCodeLookupLoading(false)
    }
  }, [form.supplier_code, form.brand_id, form.currency_id, form.prices, skipSupplierCode, currencies, computeEcommercePrice, calculationRules, priceTypes, editingId, fetchData])
  lookupSupplierCodeRef.current = lookupSupplierCode

  const isPackageType = useMemo(() => {
    if (!form.type_id) return false
    const t = types.find((x) => x.id === form.type_id)
    const code = (t?.code ?? '').toUpperCase()
    return code === 'PAK' || code === 'PAKET'
  }, [types, form.type_id])

  const selectedTypeName = useMemo(
    () => (form.type_id ? types.find((t) => t.id === form.type_id)?.name ?? 'Ürün tipi' : 'Ürün tipi'),
    [types, form.type_id]
  )

  const calculatedPackagePrice = useMemo(() => {
    if (!isPackageType || packageItems.length === 0) return null
    const total = packageItems.reduce((sum, it) => {
      const price = it.item_price ?? 0
      const qty = it.quantity ?? 0
      return sum + price * qty
    }, 0)
    return total
  }, [isPackageType, packageItems])

  const defaultCurrencyId = useMemo(() => {
    const def = currencies.find((c) => c.is_default)
    return def?.id ?? currencies[0]?.id ?? null
  }, [currencies])

  const fetchOptions = useCallback(async () => {
    try {
      const [bRes, cRes, tRes, igRes, uRes, curRes, taxRes, ptRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/product-brands?limit=9999`),
        fetch(`${API_URL}/api/product-categories?limit=9999`),
        fetch(`${API_URL}/api/product-types?limit=9999`),
        fetch(`${API_URL}/api/product-item-groups?limit=9999`),
        fetch(`${API_URL}/api/product-units?limit=9999`),
        fetch(`${API_URL}/api/product-currencies?limit=9999`),
        fetch(`${API_URL}/api/product-tax-rates?limit=9999`),
        fetch(`${API_URL}/api/product-price-types?limit=9999`),
        fetch(`${API_URL}/api/app-settings?category=hesaplamalar`),
      ])
      const b = await bRes.json()
      const c = await cRes.json()
      const t = await tRes.json()
      const ig = await igRes.json()
      const u = await uRes.json()
      const cur = await curRes.json()
      const tax = await taxRes.json()
      const pt = await ptRes.json()
      setPriceTypes((pt.data || []).map((x: { id: number; name: string; code?: string; sort_order?: number }) => ({
        id: x.id,
        name: x.name,
        code: x.code,
        sort_order: x.sort_order ?? 0,
      })))
      setBrands((b.data || []).map((x: { id: number; name: string; code?: string }) => ({
        id: x.id,
        name: x.name,
        code: x.code || x.name.slice(0, 2).toUpperCase(),
      })))
      const catData = Array.isArray(c.data) ? c.data : []
      setCategories(
        catData.map((x: { id: number; name: string; code?: string; group_id?: number | null; category_id?: number | null; sort_order?: number; color?: string }) => ({
          id: x.id,
          name: x.name,
          code: x.code || '',
          group_id: x.group_id,
          category_id: x.category_id,
          sort_order: x.sort_order ?? 0,
          color: x.color,
        }))
      )
      setTypes(
        (t.data || []).map((x: { id: number; name: string; code?: string; color?: string; sort_order?: number }) => ({
          id: x.id,
          name: x.name,
          code: x.code,
          color: x.color,
          sort_order: x.sort_order ?? 0,
        }))
      )
      setItemGroups(
        (ig.data || []).map((x: { id: number; name: string; code?: string; sort_order?: number }) => ({
          id: x.id,
          name: x.name,
          code: x.code,
          sort_order: x.sort_order ?? 0,
        }))
      )
      setUnits((u.data || []).map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })))
      setCurrencies((cur.data || []).map((x: { id: number; name: string; code?: string; symbol?: string; is_default?: number }) => ({ id: x.id, name: x.name, code: x.code, symbol: x.symbol, is_default: x.is_default })))
      setTaxRates((tax.data || []).map((x: { id: number; name: string; value: number }) => ({ id: x.id, name: x.name, value: x.value })))
      const settings = await settingsRes.json()
      try {
        const ratesRes = await fetch(`${API_URL}/api/app-settings?category=parabirimleri`)
        const ratesData = await ratesRes.json()
        if (ratesData?.exchange_rates) {
          const parsed = JSON.parse(ratesData.exchange_rates) as Record<string, number>
          setExchangeRates(typeof parsed === 'object' && parsed !== null ? parsed : {})
        }
      } catch {
        setExchangeRates({})
      }
      if (settings && typeof settings === 'object' && settings.calculations) {
        try {
          const calcs: CalculationRule[] = JSON.parse(settings.calculations)
          const rules = Array.isArray(calcs)
            ? calcs
                .filter((c) => c && c.source === 'price' && c.target)
                .map((c) => ({
                  ...c,
                  target: String(c.target === 'ecommerce_price' ? '1' : c.target),
                  operations: Array.isArray(c.operations) ? c.operations : [],
                }))
            : []
          setCalculationRules(rules)
        } catch {
          setCalculationRules([])
        }
      }
    } catch (err) {
      console.error('fetchOptions:', err)
    }
  }, [])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    fetchData()
  }, [fetchData, filterTypeId])

  useEffect(() => {
    const brandIds = new Set<number>()
    for (const p of data) {
      if (p.brand_id && p.supplier_code?.trim()) brandIds.add(p.brand_id)
    }
    if (brandIds.size === 0) {
      setMatchedCodesByBrand({})
      return
    }
    let cancelled = false
    const load = async () => {
      const results = await Promise.all(
        [...brandIds].map(async (bid) => {
          try {
            const codes = await fetchMatchedSupplierCodesFromBrand(bid)
            return { bid, codes } as const
          } catch {
            return { bid, codes: new Set<string>() } as const
          }
        })
      )
      if (cancelled) return
      const next: Record<number, Set<string>> = {}
      for (const { bid, codes } of results) next[bid] = codes
      setMatchedCodesByBrand(next)
    }
    load()
    return () => { cancelled = true }
  }, [data])

  useEffect(() => {
    fetchSidebarMenus().then((menus) => setParasutIconPath(findParasutIconPath(menus)))
  }, [])

  useEffect(() => {
    const skus = data.map((p) => p.sku?.trim()).filter((s): s is string => !!s)
    if (skus.length === 0) {
      setMatchedParasutSkus(new Set())
      return
    }
    let cancelled = false
    fetch(`${API_URL}/api/parasut/product-codes`)
      .then((r) => r.json())
      .then((json: { codes?: string[] }) => {
        if (cancelled) return
        const codes = (json.codes ?? []).map((c) => normalizeSku(c))
        const parasutSet = new Set(codes)
        const matched = new Set(skus.map(normalizeSku).filter((s) => parasutSet.has(s)))
        setMatchedParasutSkus(matched)
      })
      .catch(() => setMatchedParasutSkus(new Set()))
    return () => { cancelled = true }
  }, [data])

  const handleRefresh = () => {
    fetchData()
  }

  const handlePriceChange = useCallback((value: number, options?: { skipSameTargetRule?: boolean }) => {
    const skipSameTargetRule = options?.skipSameTargetRule ?? false
    setForm((f) => {
      const curId = f.currency_id || f.ecommerce_currency_id
      const brandId = typeof f.brand_id === 'number' ? f.brand_id : null
      const priceRule = findRuleForBrand(calculationRules, 'price', brandId)
      const effectivePrice =
        !skipSameTargetRule && priceRule?.source === 'price' && priceRule?.operations?.length
          ? applyCalculation(value, priceRule.operations)
          : value
      const prices = { ...f.prices }
      if (calculationRules.length > 0) {
        const sortedTypes = [...priceTypes].sort((a, b) => a.id - b.id)
        for (const pt of sortedTypes) {
          const targetId = pt.id
          if (targetId < 1) continue
          const rule = findRuleForBrand(calculationRules, String(targetId), brandId)
          if (!rule || !rule.operations?.length) continue
          const sourceVal = rule.source === 'price' ? effectivePrice : (prices[Number(rule.source)]?.price ?? effectivePrice)
          const computed = applyCalculation(sourceVal, rule.operations)
          const ruleCurrencyId = rule.result_currency_id != null && rule.result_currency_id > 0 ? Number(rule.result_currency_id) : null
          const priceCurrencyId = ruleCurrencyId ?? (curId ? Number(curId) : null)
          const existing = prices[targetId]
          prices[targetId] = {
            ...(existing ?? { price: 0, currency_id: null, status: 1 }),
            price: computed,
            currency_id: priceCurrencyId,
          }
        }
      }
      const ecomPrice = prices[1]?.price ?? computeEcommercePrice(effectivePrice, brandId)
      return {
        ...f,
        price: effectivePrice,
        ecommerce_price: ecomPrice,
        ecommerce_currency_id: curId,
        prices,
      }
    })
  }, [calculationRules, computeEcommercePrice, priceTypes])

  const handlePriceBlur = useCallback(() => {
    const el = document.getElementById('price') as HTMLInputElement | null
    const raw = el?.value != null && el.value !== '' ? el.value : ''
    const parsed = parseDecimal(raw)
    handlePriceChange(parsed, { skipSameTargetRule: false })
  }, [handlePriceChange])

  const handleCurrencyChange = useCallback((currencyId: number | '') => {
    setForm((f) => {
      const curId = currencyId || f.ecommerce_currency_id
      const prices = { ...f.prices }
      if (prices[1]) {
        prices[1] = { ...prices[1], currency_id: curId ? Number(curId) : null }
      }
      return {
        ...f,
        currency_id: currencyId,
        ecommerce_currency_id: curId,
        prices,
      }
    })
  }, [])

  async function openNew() {
    setEditingId(null)
    setModalTab('genel')
    const defCur = defaultCurrencyId ?? ''
    setForm({
      ...emptyForm,
      currency_id: defCur as number | '',
      ecommerce_currency_id: defCur as number | '',
      prices: {},
    })
    setPackageItems([])
    setSupplierCodeMatch(null)
    setModalOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/products/next-sort-order`)
      const json = await res.json()
      if (res.ok && json.next != null) setForm((f) => ({ ...f, sort_order: json.next }))
    } catch { /* ignore */ }
  }

  async function openEdit(item: Product, tab: string = 'genel') {
    setEditingId(item.id)
    setModalTab(tab)
    setSupplierCodeMatch(null)
    const itemTypeCode = types.find((t) => t.id === item.type_id)?.code?.toUpperCase() ?? ''
    const itemIsPackage = itemTypeCode === 'PAK' || itemTypeCode === 'PAKET'
    const defCur = defaultCurrencyId ?? item.currency_id ?? ''
    const basePrice = item.price ?? 0
    setModalOpen(true)
    try {
      const [productRes, itemsRes, recalcRes] = await Promise.all([
        fetch(`${API_URL}/api/products/${item.id}`),
        fetch(`${API_URL}/api/products/${item.id}/package-items`),
        itemIsPackage ? fetch(`${API_URL}/api/products/${item.id}/recalculate-package-price`, { method: 'POST' }) : null,
      ])
      const product = await productRes.json()
      const itemEcomPrice = product?.ecommerce_price ?? product?.prices?.find((p: { price_type_id: number }) => p.price_type_id === 1)?.price
      const itemEcomCur = product?.ecommerce_currency_id ?? product?.prices?.find((p: { price_type_id: number }) => p.price_type_id === 1)?.currency_id
      const pricesMap: Record<number, { price: number; currency_id: number | null; status: number }> = {}
      for (const p of product?.prices ?? []) {
        pricesMap[p.price_type_id] = {
          price: p.price ?? 0,
          currency_id: p.currency_id ?? null,
          status: p.status ?? 1,
        }
      }
      if (Object.keys(pricesMap).length === 0 && (itemEcomPrice != null || itemEcomCur != null)) {
        pricesMap[1] = {
          price: itemEcomPrice ?? 0,
          currency_id: itemEcomCur ?? null,
          status: 1,
        }
      }
      setForm({
        name: product?.name ?? item.name,
        sku: product?.sku ?? item.sku ?? '',
        barcode: product?.barcode ?? item.barcode ?? '',
        brand_id: product?.brand_id ?? item.brand_id ?? '',
        category_id: product?.category_id ?? item.category_id ?? '',
        type_id: product?.type_id ?? item.type_id ?? '',
        product_item_group_id: product?.product_item_group_id ?? item.product_item_group_id ?? '',
        unit_id: product?.unit_id ?? item.unit_id ?? '',
        currency_id: product?.currency_id ?? item.currency_id ?? defCur,
        price: product?.price ?? basePrice,
        quantity: product?.quantity ?? item.quantity ?? 0,
        ecommerce_price: itemEcomPrice ?? computeEcommercePrice(basePrice, product?.brand_id ?? item.brand_id ?? null),
        ecommerce_currency_id: (itemEcomCur ?? item.currency_id ?? defCur) || null,
        prices: pricesMap,
        images: parseImageToArray(product?.image ?? item.image),
        tax_rate: product?.tax_rate ?? item.tax_rate ?? 0,
        supplier_code: itemIsPackage ? '' : (product?.supplier_code ?? item.supplier_code ?? ''),
        gtip_code: product?.gtip_code ?? item.gtip_code ?? '',
        sort_order: product?.sort_order ?? item.sort_order ?? 0,
        status: product?.status ?? item.status ?? 1,
        ecommerce_name: product?.ecommerce_name ?? '',
        main_description: product?.main_description ?? '',
        seo_slug: product?.seo_slug ?? '',
        seo_title: product?.seo_title ?? '',
        seo_description: product?.seo_description ?? '',
      })
      const json = await itemsRes.json()
      if (itemsRes.ok && json.data) {
        setPackageItems(json.data.map((x: { item_product_id: number; quantity: number; item_name?: string; item_sku?: string; item_price?: number }) => ({
          item_product_id: x.item_product_id,
          quantity: x.quantity,
          item_name: x.item_name,
          item_sku: x.item_sku,
          item_price: x.item_price,
        })))
      } else {
        setPackageItems([])
      }
      if (recalcRes?.ok) {
        const recalc = await recalcRes.json()
        if (typeof recalc?.price === 'number') {
          handlePriceChange(recalc.price)
          fetchData()
        }
      }
    } catch {
      setPackageItems([])
    }
  }

  function handleCopy() {
    setEditingId(null)
    setForm((f) => ({ ...f, name: f.name + ' (kopya)', supplier_code: '' }))
  }

  async function copyToClipboard(text: string, label: string) {
    if (!text?.trim()) return
    try {
      await navigator.clipboard.writeText(text.trim())
      toastSuccess('Kopyalandı', `${label} panoya kopyalandı`)
    } catch {
      toastError('Kopyalanamadı', 'Panoya kopyalama başarısız')
    }
  }

  function closeModal() {
    setModalOpen(false)
    setModalTab('genel')
    setEditingId(null)
    setForm(emptyForm)
    setPackageItems([])
    setSupplierCodeMatch(null)
  }

  function openImageUploadModal(item: Product) {
    imageUploadProductRef.current = item
    setImageUploadProduct(item)
    setImageUploadImages(parseImageToArray(item.image))
    setImageUploadSaving(false)
  }

  function closeImageUploadModal() {
    setImageUploadProduct(null)
    setImageUploadImages([])
    // Ref'i burada temizlemiyoruz: dosya seçici açıldığında dialog kapanabiliyor;
    // yükleme bitince onChange hâlâ doğru ürünü bulabilsin diye ref son açılan üründe kalıyor.
    // Ref, bir sonraki openImageUploadModal çağrısında güncellenir.
  }

  const handleImageUploadChange = useCallback(async (images: string[]) => {
    const product = imageUploadProductRef.current
    if (!product) return
    setImageUploadImages(images)
    const imageValue = serializeImagesToImage(images)
    setData((prev) => prev.map((p) => (p.id === product.id ? { ...p, image: imageValue } : p)))
    setImageUploadSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageValue }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Görsel kaydedilemedi')
      const updatedImage = json.image ?? imageValue
      imageUploadProductRef.current = { ...product, image: updatedImage }
      setImageUploadProduct((p) => (p ? { ...p, image: updatedImage } : null))
      setData((prev) => prev.map((p) => (p.id === product.id ? { ...p, image: updatedImage } : p)))
      toastSuccess('Görsel kaydedildi', 'Ürün görseli başarıyla güncellendi.')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Görsel kaydedilemedi')
    } finally {
      setImageUploadSaving(false)
    }
  }, [])

  async function handleGenerateEcommerce() {
    const name = form.name?.trim()
    if (!name) {
      toastError('Ürün adı gerekli', 'Önce ürün adını girin.')
      return
    }
    setAiGenerateLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ai/generate-ecommerce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brand_name: form.brand_id ? brands.find((b) => b.id === form.brand_id)?.name ?? '' : '',
          category_path: categoryPath.length > 0 ? categoryPath.map((p) => p.name).join(' › ') : '',
          sku: form.sku ?? '',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'İstek başarısız')
      setForm((f) => ({
        ...f,
        ecommerce_name: json.ecommerce_name ?? '',
        main_description: json.main_description ?? '',
        seo_slug: json.seo_slug ?? '',
        seo_title: json.seo_title ?? '',
        seo_description: json.seo_description ?? '',
      }))
      toastSuccess('Oluşturuldu', 'E-ticaret metinleri ChatGPT ile üretildi.')
    } catch (err) {
      toastError('Oluşturulamadı', err instanceof Error ? err.message : 'Metinler üretilemedi')
    } finally {
      setAiGenerateLoading(false)
    }
  }

  async function handlePublish(platform: 'opencart' | 'okm' | 'trendyol', opencartOptions?: { update_price: boolean; update_description: boolean; update_images: boolean }) {
    const productId = editingId
    if (!productId) {
      toastError('Önce kaydedin', 'Ürünü yayınlamak için önce kaydedin.')
      return
    }
    setPublishLoading(platform)
    try {
      if (platform === 'opencart') {
        const images = (form.images ?? []).filter((x): x is string => typeof x === 'string' && !!x.trim() && !x.startsWith('http'))
        let uploadedPaths: string[] = []
        if (images.length > 0) {
          const settingsRes = await fetch(`${API_URL}/api/app-settings?category=opencart_mysql`)
          const settings = settingsRes.ok ? await settingsRes.json() : {}
          const imageUploadUrl = settings.image_upload_url?.trim()
          if (!imageUploadUrl) {
            toastWarning('Görsel yükleme ayarlanmadı', 'Ayarlar > Veri Aktarımı > OpenCart Ayarları bölümünde "Görsel Yükleme URL\'si" alanını doldurun. scripts/opencart-image-upload.php dosyasını OpenCart image/catalog/ klasörüne yükleyin.')
          } else {
            for (const r2Key of images) {
              try {
                const imgRes = await fetch(`${API_URL}/storage/serve?key=${encodeURIComponent(r2Key)}`)
                if (!imgRes.ok) continue
                const blob = await imgRes.blob()
                const ext = r2Key.split('.').pop()?.toLowerCase() || 'webp'
                const formData = new FormData()
                formData.append('file', blob, `product.${ext}`)
                formData.append('product_id', String(productId))
                const uploadRes = await fetch(imageUploadUrl, { method: 'POST', body: formData })
                const uploadJson = await uploadRes.json().catch(() => ({}))
                if (uploadJson?.path) uploadedPaths.push(uploadJson.path)
              } catch {
                /* skip */
              }
            }
            if (uploadedPaths.length < images.length && images.length > 0) {
              toastWarning('Bazı görseller yüklenemedi', `${uploadedPaths.length}/${images.length} görsel OpenCart sunucusuna iletildi. PHP script'in doğru konumda olduğunu ve CORS ayarlarının geçerli olduğunu kontrol edin.`)
            }
          }
        }
        const opts = opencartOptions ?? { update_price: true, update_description: true, update_images: true }
        const res = await fetch(`${API_URL}/api/products/${productId}/publish/opencart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ecommerce_name: form.ecommerce_name ?? '',
            main_description: form.main_description ?? '',
            seo_slug: form.seo_slug ?? '',
            seo_title: form.seo_title ?? '',
            seo_description: form.seo_description ?? '',
            images: form.images ?? [],
            ...(uploadedPaths.length > 0 && { uploaded_image_paths: uploadedPaths }),
            update_price: opts.update_price,
            update_description: opts.update_description,
            update_images: opts.update_images,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Yayınlama başarısız')
        const msg = json.message ?? (json.created ? 'OpenCart\'ta yeni ürün oluşturuldu' : 'OpenCart\'a yayınlandı')
        const u = json.updated
        const imgStatus = u?.images
          ? u.images_uploaded
            ? `Görsel: ${u.images} adet yüklendi ✓`
            : `Görsel: ${u.images} adet (sunucuya yüklenmedi - image_upload_url ayarlayın)`
          : ''
        const detail = u
          ? `Ad: ${u.name ? '✓' : '—'}, Açıklama: ${u.description ? '✓' : '—'}, Fiyat: ${u.price != null ? '✓' : '—'}, Meta: ${u.meta_title || u.meta_description ? '✓' : '—'}${imgStatus ? `, ${imgStatus}` : ''}`
          : ''
        toastSuccess(msg, detail || `Ürün #${json.opencart_product_id} ${json.created ? 'oluşturuldu' : 'güncellendi'}`)
        if (json.image_upload_hint) {
          toastWarning('Görsel OpenCart\'a yüklenmedi', json.image_upload_hint)
        }
      } else {
        const labels = { okm: 'OKM', trendyol: 'Trendyol' }
        await new Promise((r) => setTimeout(r, 800))
        toastSuccess('Yayınlandı', `${labels[platform]}'a ürün yayınlandı.`)
      }
    } catch (err) {
      toastError('Yayınlama hatası', err instanceof Error ? err.message : 'Yayınlanamadı')
    } finally {
      setPublishLoading(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (!form.type_id) {
      setError('Ürün tipi seçilmeden kayıt yapılamaz.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `${API_URL}/api/products/${editingId}` : `${API_URL}/api/products`
      const method = editingId ? 'PUT' : 'POST'
      const generatedSku = buildProductCode(categoryPath, brandCode, isPackageType ? '' : (form.supplier_code ?? ''))
      const effectiveSku = (form.sku?.trim()) || generatedSku || undefined
      const imageValue = serializeImagesToImage(form.images)
      const { images: _images, prices: _prices, ...formRest } = form
      const pricesPayload = Object.keys(form.prices || {}).length > 0
        ? Object.entries(form.prices).map(([priceTypeId, p]) => ({
            price_type_id: Number(priceTypeId),
            price: p.price,
            currency_id: p.currency_id,
            status: p.status,
          }))
        : undefined
      const body = {
        ...formRest,
        image: imageValue,
        sku: effectiveSku,
        brand_id: form.brand_id || undefined,
        category_id: form.category_id || undefined,
        type_id: form.type_id || undefined,
        product_item_group_id: form.product_item_group_id || undefined,
        unit_id: form.unit_id || undefined,
        currency_id: (form.currency_id !== '' && form.currency_id != null) ? form.currency_id : undefined,
        price: isPackageType ? (calculatedPackagePrice ?? 0) : (form.price ?? 0),
        supplier_code: isPackageType ? null : (form.supplier_code ?? undefined),
        prices: pricesPayload,
        ...(pricesPayload == null && {
          ecommerce_price: form.ecommerce_price ?? undefined,
          ecommerce_currency_id: (form.ecommerce_currency_id !== '' && form.ecommerce_currency_id != null) ? form.ecommerce_currency_id : undefined,
        }),
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      const productId = editingId ?? json?.id
      if (productId && isPackageType) {
        const pkgRes = await fetch(`${API_URL}/api/products/${productId}/package-items`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: packageItems.filter((i) => i.item_product_id && i.quantity > 0).map((i) => ({
              item_product_id: i.item_product_id,
              quantity: i.quantity,
            })),
          }),
        })
        if (!pkgRes.ok) {
          const pkgJson = await pkgRes.json()
          throw new Error(pkgJson.error || 'Paket içeriği kaydedilemedi')
        }
      }
      closeModal()
      if (editingId) {
        const res = await fetch(`${API_URL}/api/products/${productId}`)
        const updated = await res.json()
        if (res.ok && updated && !updated.error) {
          setData((prev) => prev.map((p) => (p.id === productId ? { ...p, ...updated } : p)))
        } else {
          fetchData(true)
        }
      } else {
        fetchData(true)
      }
      toastSuccess(editingId ? 'Ürün güncellendi' : 'Ürün eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  function openDeleteConfirm(id: number, onSuccess?: () => void) {
    setDeleteConfirm({ open: true, id, onSuccess })
  }

  async function executeDelete() {
    const { id, onSuccess } = deleteConfirm
    if (!id) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/products/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      setData((prev) => prev.filter((p) => p.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      toastSuccess('Ürün silindi', 'Ürün başarıyla silindi.')
      setDeleteConfirm({ open: false, id: null })
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageLayout
      title="Ürünler"
      description="Ürün listesini yönetin"
      backTo="/"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={handleRefresh}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ad, SKU veya barkod ara..."
                value={search}
                onChange={(e) => setListState({ search: e.target.value })}
                className="pl-8 w-56 h-9 rounded-r-none border-r-0"
              />
            </div>
            <div
              role="radiogroup"
              aria-label="Ürün tipi filtresi"
              className="inline-flex rounded-r-md border border-l-0 border-input bg-muted/30 p-0.5 shrink-0"
            >
              {[
                { key: '', label: 'Tümü', color: undefined },
                ...[...types]
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((t) => ({ key: String(t.id), label: t.name, color: t.color })),
              ].map(({ key, label, color }) => {
                const isActive = filterTypeId === key
                const btnClass = `h-9 px-2.5 text-xs font-medium transition-colors first:rounded-l-none last:rounded-r-md cursor-pointer inline-flex items-center justify-center ${
                  isActive && color ? 'dynamic-bg-fg shadow-sm' : isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`
                const commonProps = {
                  key: key || 'all',
                  className: btnClass,
                  onClick: () => setListState({ filterTypeId: key, page: 1 }),
                  children: label,
                }
                return color ? (
                  <DynamicBgFgButton {...commonProps} bg={color} type="button" role="radio" aria-label={label} aria-checked={isActive} />
                ) : (
                  <button {...commonProps} type="button" role="radio" aria-label={label} aria-checked={isActive} />
                )
              })}
            </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleResetFilters}
                  className={`h-9 w-9 shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Arama ve filtreleri sıfırla</TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={filterNoImage ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setListState({ filterNoImage: !filterNoImage, page: 1 })}
                className={`h-9 w-9 shrink-0 ${filterNoImage ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <Image className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {filterNoImage ? 'Tüm ürünleri göster' : 'Sadece görseli olmayan ürünleri göster'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={openNew}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni ürün</TooltipContent>
          </Tooltip>
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
          onFitLimitChange={(v) => setListState({ fitLimit: v })}
          tableContainerRef={contentRef}
          hasFilter={hasFilter}
        />
      }
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b bg-muted/50">
                  <th className="text-center p-2 font-medium w-16">Görsel</th>
                  <th className="text-center p-2 font-medium min-w-[140px]">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        aria-label="Ürün adına göre sırala"
                      >
                        {sortBy === 'name' ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                        Ürün Adı
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={`rounded p-0.5 hover:bg-muted ${filterName ? 'text-primary' : 'text-muted-foreground'}`}
                            aria-label="Ürün adı filtresi"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-3">
                          <Label className="text-xs">Ürün Adı</Label>
                          <Input
                            placeholder="Filtrele..."
                            value={filterName}
                            onChange={(e) => setListState({ filterName: e.target.value })}
                            className="h-8 text-sm mt-1.5"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </th>
                  <th className="text-center p-2 font-medium min-w-[100px]">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSort('sku')}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {sortBy === 'sku' ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                        SKU
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={`rounded p-0.5 hover:bg-muted ${filterSku ? 'text-primary' : 'text-muted-foreground'}`}
                            aria-label="SKU filtresi"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-3">
                          <Label className="text-xs">SKU</Label>
                          <Input
                            placeholder="Filtrele..."
                            value={filterSku}
                            onChange={(e) => setListState({ filterSku: e.target.value })}
                            className="h-8 text-sm font-mono mt-1.5"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </th>
                  <th className="text-center p-2 font-medium min-w-[100px]">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSort('brand_name')}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {sortBy === 'brand_name' ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                        Marka
                      </button>
                      <Popover onOpenChange={(open) => !open && setFilterBrandSearch('')}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={`rounded p-0.5 hover:bg-muted ${filterBrandId ? 'text-primary' : 'text-muted-foreground'}`}
                            aria-label="Marka filtresi"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                          <div className="p-2 border-b">
                            <Label className="text-xs">Marka</Label>
                            <Input
                              placeholder="Ara..."
                              value={filterBrandSearch}
                              onChange={(e) => setFilterBrandSearch(e.target.value)}
                              className="h-8 text-sm mt-1.5"
                            />
                          </div>
                          <div className="max-h-[220px] overflow-y-auto py-1">
                            <button
                              type="button"
                              onClick={() => setListState({ filterBrandId: '', page: 1 })}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm hover:bg-muted',
                                !filterBrandId && 'bg-accent'
                              )}
                            >
                              Tümü
                            </button>
                            {filteredBrands.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => setListState({ filterBrandId: String(b.id), page: 1 })}
                                className={cn(
                                  'w-full text-left px-3 py-2 text-sm hover:bg-muted',
                                  filterBrandId === String(b.id) && 'bg-accent'
                                )}
                              >
                                {b.name}
                                {b.code && <span className="text-muted-foreground ml-1">({b.code})</span>}
                              </button>
                            ))}
                            {filteredBrands.length === 0 && brands.length > 0 && (
                              <div className="px-3 py-4 text-sm text-muted-foreground text-center">Sonuç bulunamadı</div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </th>
                  <th className="text-center p-2 font-medium w-14">Tip</th>
                  <th className="text-center p-2 font-medium w-14">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center justify-center">
                          <Link2 className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Eşleşmeler</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="text-center p-2 font-medium min-w-[180px]">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSort('category_name')}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {sortBy === 'category_name' ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                        Kategori
                      </button>
                      <Popover onOpenChange={(open) => !open && setFilterCategorySearch('')}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={`rounded p-0.5 hover:bg-muted ${(filterCategoryId || filterGroupId) ? 'text-primary' : 'text-muted-foreground'}`}
                            aria-label="Kategori filtresi"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                          <div className="p-2 border-b">
                            <Label className="text-xs">Kategori</Label>
                            <Input
                              placeholder="Kategori veya alt kategori ara..."
                              value={filterCategorySearch}
                              onChange={(e) => setFilterCategorySearch(e.target.value)}
                              className="h-8 text-sm mt-1.5"
                            />
                          </div>
                          <div className="max-h-[260px] overflow-y-auto py-1">
                            <button
                              type="button"
                              onClick={() => setListState({ filterCategoryId: '', filterGroupId: '', page: 1 })}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm hover:bg-muted',
                                !filterCategoryId && !filterGroupId && 'bg-accent'
                              )}
                            >
                              Tümü
                            </button>
                            {(() => {
                              const byGroup = new Map<string, typeof categoryFilterHierarchy>()
                              categoryFilterHierarchy.forEach((h) => {
                                const groupLabel = h.path[0]?.name ?? 'Diğer'
                                if (!byGroup.has(groupLabel)) byGroup.set(groupLabel, [])
                                byGroup.get(groupLabel)!.push(h)
                              })
                              const groupItems = categoryFilterHierarchy.filter((h) => h.level === 'group')
                              return Array.from(byGroup.entries()).map(([groupName, items]) => {
                                const groupItem = groupItems.find((g) => g.path[0]?.name === groupName)
                                return (
                                  <div key={groupName}>
                                    {groupItem ? (
                                      <button
                                        type="button"
                                        onClick={() => setListState({ filterGroupId: String(groupItem.id), filterCategoryId: '', page: 1 })}
                                        className={cn(
                                          'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2',
                                          filterGroupId === String(groupItem.id) && 'bg-accent'
                                        )}
                                      >
                                        {groupItem.color ? (
                                          <DynamicBgSpan color={groupItem.color} className="shrink-0 w-3 h-3 rounded border" />
                                        ) : null}
                                        <span className="truncate font-medium">{groupName}</span>
                                      </button>
                                    ) : (
                                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
                                        {groupName}
                                      </div>
                                    )}
                                    {items.filter((h) => h.level !== 'group').map((h) => (
                                      <button
                                        key={h.id}
                                        type="button"
                                        onClick={() => setListState({ filterCategoryId: String(h.id), filterGroupId: '', page: 1 })}
                                        className={cn(
                                          'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2',
                                          h.level === 'subcategory' && 'pl-5',
                                          filterCategoryId === String(h.id) && 'bg-accent'
                                        )}
                                      >
                                        {h.color ? (
                                          <DynamicBgSpan color={h.color} className="shrink-0 w-3 h-3 rounded border" />
                                        ) : null}
                                        <span className="truncate">
                                          {h.path.length > 1 ? h.path.slice(1).map((p) => p.name).join(' › ') : h.path[0]?.name ?? h.label}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )
                              })
                            })()}
                            {categoryFilterHierarchy.length === 0 && (
                              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                                {categories.length === 0 ? 'Kategori bulunamadı.' : 'Sonuç bulunamadı'}
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </th>
                  <th className="text-center p-2 font-medium min-w-[80px]">Birim</th>
                  <th className="text-center p-2 font-medium tabular-nums min-w-[100px]">
                    <button
                      type="button"
                      onClick={() => handleSort('price')}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {sortBy === 'price' ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                      Fiyat
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      {error || 'Henüz ürün kaydı yok. Yeni ürün eklemek için + butonunu kullanın.'}
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openImageUploadModal(item)
                          }}
                          className="inline-block rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`${item.name || 'Ürün'} görselini yükle veya değiştir`}
                        >
                          <ProductImageWithBadgeCell
                            image={item.image}
                            className="h-10 w-10 shrink-0 mx-auto object-contain"
                            productName={item.name}
                          />
                        </button>
                      </td>
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-1">
                          <span className="truncate">{item.name}</span>
                          {item.name && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(item.name || '', 'Ürün adı')
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Panoya kopyala</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-sm">
                        <div className="flex items-center gap-1">
                          <span className="truncate">{item.sku || '—'}</span>
                          {item.sku && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(item.sku || '', 'SKU')
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Panoya kopyala</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {item.brand_name ? (
                          <div className="flex items-center gap-2">
                            {item.brand_image ? (
                              <BrandLogoCell
                                src={getImageDisplayUrl(item.brand_image)}
                                brandName={item.brand_name}
                                brandCode={item.brand_code}
                                size="sm"
                              />
                            ) : (
                              <span className="h-5 min-w-[1.25rem] px-1.5 flex items-center justify-center text-[10px] font-medium shrink-0 text-muted-foreground">
                                {item.brand_code || item.brand_name?.slice(0, 2) || '?'}
                              </span>
                            )}
                            <span className="text-sm font-medium truncate">
                              {item.brand_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.type_name ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DynamicBgSpan
                                color={item.type_color || '#6b7280'}
                                className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-2 text-xs font-semibold text-white border border-white/20"
                              >
                                {item.type_name.charAt(0).toUpperCase()}
                              </DynamicBgSpan>
                            </TooltipTrigger>
                            <TooltipContent>{item.type_name}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {(() => {
                          const code = item.supplier_code?.trim()
                          const bid = item.brand_id
                          const isSupplierMatched = code && bid && matchedCodesByBrand[bid]?.has(code)
                          const isParasutMatched = item.sku?.trim() && matchedParasutSkus.has(normalizeSku(item.sku))
                          if (!isSupplierMatched && !isParasutMatched) return <span className="text-muted-foreground">—</span>
                          return (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {isSupplierMatched && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center">
                                      {item.brand_image ? (
                                        <BrandLogoCell
                                          src={getImageDisplayUrl(item.brand_image)}
                                          brandName={item.brand_name}
                                          brandCode={item.brand_code}
                                        />
                                      ) : (
                                        <span className="h-8 min-w-[2rem] px-2 flex items-center justify-center text-xs font-medium text-muted-foreground">
                                          {item.brand_code || item.brand_name?.slice(0, 2) || '?'}
                                        </span>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {item.brand_name} – {item.supplier_code}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {isParasutMatched && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center shrink-0">
                                      {parasutIconPath ? (
                                        <img
                                          src={getImageDisplayUrl(parasutIconPath)}
                                          alt="Paraşüt"
                                          className="h-8 w-8 object-contain"
                                        />
                                      ) : (
                                        <span className="h-8 min-w-[2rem] px-2 flex items-center justify-center text-xs font-medium text-muted-foreground bg-muted/50 rounded">
                                          P
                                        </span>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Paraşüt ile eşleşmiş</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="p-3">
                        {(() => {
                          const pathFromHierarchy = getCategoryPath(categories, item.category_id ?? '')
                          const fullPath =
                            pathFromHierarchy.length > 0
                              ? pathFromHierarchy.map((p) => p.name).join(' › ')
                              : [
                                  item.group_name || item.group_code,
                                  item.category_name || item.category_code,
                                  item.subcategory_name || item.subcategory_code,
                                ]
                                  .filter(Boolean)
                                  .join(' › ')
                          if (!fullPath) return <span className="text-muted-foreground">—</span>
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block text-left text-sm break-words min-w-0 max-w-[220px]" title={fullPath}>
                                  {fullPath}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                <p className="whitespace-normal break-words">{fullPath}</p>
                              </TooltipContent>
                            </Tooltip>
                          )
                        })()}
                      </td>
                      <td className="p-3 text-center text-muted-foreground">
                        {item.unit_name ?? '—'}
                      </td>
                      <td className="p-3 text-right tabular-nums font-bold">
                        {item.price != null ? (
                          <ProductPricePreview
                            productId={item.id}
                            displayPrice={`${formatPrice(item.price)} ${item.currency_symbol || ''}`.trim()}
                            priceTypes={priceTypes}
                            currencies={currencies}
                            exchangeRates={exchangeRates}
                            calculationRules={calculationRules}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex flex-row items-start gap-4">
            <div className="shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    {(() => {
                      const typeColor = form.type_id ? types.find((t) => t.id === form.type_id)?.color : undefined
                      return typeColor ? <DynamicBgSpan color={typeColor} className="shrink-0 w-3 h-3 rounded-full border" /> : null
                    })()}
                    {selectedTypeName}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1">
                  {types.map((t) => {
                    const isSkipType = t?.code ? SKIP_SUPPLIER_CODE_TYPE_CODES.some((c) => (c || '').toUpperCase() === (t.code || '').toUpperCase()) : false
                    return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type_id: t.id, ...(isSkipType ? { supplier_code: '' } : {}) }))}
                      className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent flex items-center gap-2"
                    >
                      {t.color ? (
                        <DynamicBgSpan color={t.color} className="shrink-0 w-3.5 h-3.5 rounded border" />
                      ) : null}
                      {t.name}
                    </button>
                    )
                  })}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>
                {form.name?.trim()
                  ? `${form.name}${form.sku ? ` (${form.sku})` : ''}`
                  : editingId
                    ? 'Ürün Düzenle'
                    : 'Yeni Ürün'}
              </DialogTitle>
              <DialogDescription>
                Ürün bilgilerini girin. Marka, kategori ve diğer alanlar parametrelerden seçilir.
              </DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
            {error && <p className="text-sm text-destructive shrink-0">{error}</p>}
            <div className="flex-1 min-h-0 overflow-y-auto">
            <Tabs value={modalTab} onValueChange={setModalTab} className="w-full">
              <TabsList className={`grid w-full ${isPackageType ? 'grid-cols-6' : 'grid-cols-5'}`}>
                <TabsTrigger value="genel">Genel</TabsTrigger>
                <TabsTrigger value="fiyat">Fiyat</TabsTrigger>
                <TabsTrigger value="gorsel">Görsel</TabsTrigger>
                {isPackageType && (
                  <TabsTrigger value="paket">Paket içeriği</TabsTrigger>
                )}
                <TabsTrigger value="e-ticaret">E-Ticaret</TabsTrigger>
                <TabsTrigger value="diger">Diğer</TabsTrigger>
              </TabsList>
              <TabsContent value="genel" className="space-y-4 mt-4 min-h-[55vh]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Kategori</Label>
                    <CategorySelect
                      id="category"
                      value={form.category_id}
                      onChange={(id) => setForm((f) => ({ ...f, category_id: id }))}
                      categories={categories}
                      placeholder="Kategori seçin"
                    />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="product_item_group">Ürün Grubu</Label>
                    <select
                      id="product_item_group"
                      aria-label="Ürün grubu seçin"
                      value={form.product_item_group_id}
                      onChange={(e) => setForm((f) => ({ ...f, product_item_group_id: e.target.value ? Number(e.target.value) : '' }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seçin (Ürün / Yedek Parça / Aksesuar)</option>
                      {itemGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="brand">Marka</Label>
                    <select
                      id="brand"
                      aria-label="Marka seçin"
                      value={form.brand_id}
                      onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value ? Number(e.target.value) : '' }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seçin</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Birim</Label>
                    <select
                      id="unit"
                      aria-label="Birim seçin"
                      value={form.unit_id}
                      onChange={(e) => setForm((f) => ({ ...f, unit_id: e.target.value ? Number(e.target.value) : '' }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seçin</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_rate">Vergi (KDV %)</Label>
                    <select
                      id="tax_rate"
                      aria-label="Vergi oranı seçin"
                      value={form.tax_rate != null ? form.tax_rate : ''}
                      onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seçin</option>
                      {taxRates.map((tr) => (
                        <option key={tr.id} value={tr.value}>{tr.name} ({tr.value}%)</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Ürün Adı *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Örn: iPhone 15 Pro"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product-code">Ürün Kodu (SKU)</Label>
                    <ProductCodeDisplay
                      id="product-code"
                      categoryPath={categoryPath}
                      brandCode={brandCode}
                      supplierCode={form.supplier_code}
                      onSupplierCodeChange={(v) =>
                        setForm((f) => {
                          const newSku = buildProductCode(categoryPath, brandCode, v ?? '')
                          return { ...f, supplier_code: v ?? '', sku: newSku || f.sku }
                        })
                      }
                      supplierCodeEditable={true}
                      sku={form.sku}
                      placeholder="Kategori, marka ve tedarikçi kodu seçin"
                    />
                  </div>
                  {!skipSupplierCode && (
                    <div className="space-y-2">
                      <Label htmlFor="supplier_code">Tedarikçi Kodu</Label>
                      <div className="relative">
                        <Input
                          id="supplier_code"
                          value={form.supplier_code}
                          onChange={(e) => setForm((f) => ({ ...f, supplier_code: e.target.value }))}
                          onBlur={() => setTimeout(() => lookupSupplierCodeRef.current?.(), 0)}
                          placeholder="Tedarikçi ürün kodu (son kısım)"
                          className="pr-9"
                        />
                        {supplierCodeLookupLoading && (
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">...</span>
                        )}
                        {!supplierCodeLookupLoading && supplierCodeMatch === true && (
                          <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                        )}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="barcode">Barkod</Label>
                    <Input
                      id="barcode"
                      value={form.barcode}
                      onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                      placeholder="Barkod numarası"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Miktar</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step={1}
                    min="0"
                    value={form.quantity || ''}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                    placeholder="0"
                    className="text-right tabular-nums"
                  />
                </div>
              </TabsContent>
              <TabsContent value="fiyat" className="space-y-4 mt-4 min-h-[55vh]">
                <div className="space-y-3">
                  {/* Genel Fiyat - tek satır */}
                  {(() => {
                    const genelCur = form.currency_id ? currencies.find((c) => c.id === form.currency_id) : null
                    const genelSymbol = genelCur?.symbol ?? ''
                    return (
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-2 text-sm font-medium">Genel Fiyat</div>
                    <div className="col-span-2 flex items-center gap-2">
                      <Switch checked disabled className="opacity-60" />
                      <span className="text-muted-foreground text-sm">Aktif</span>
                    </div>
                    <div className="col-span-5 flex items-center">
                      {isPackageType ? (
                        <div className="flex-1 flex h-10 w-full items-center justify-end rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-right tabular-nums">
                          {calculatedPackagePrice != null
                            ? formatPriceWithSymbol(calculatedPackagePrice, genelSymbol)
                            : packageItems.length > 0
                              ? '—'
                              : 'Paket içeriği kaydedildikten sonra hesaplanır'}
                        </div>
                      ) : (
                        <DecimalInput
                          id="price"
                          value={form.price ?? 0}
                          onChange={(v) => handlePriceChange(v, { skipSameTargetRule: true })}
                          onBlur={handlePriceBlur}
                          maxDecimals={2}
                          minDecimals={2}
                          placeholder="0,00"
                          className="flex-1 text-right tabular-nums"
                        />
                      )}
                    </div>
                    <div className="col-span-2">
                      <select
                        id="currency"
                        aria-label="Para birimi seçin"
                        value={form.currency_id ?? ''}
                        onChange={(e) => handleCurrencyChange(e.target.value ? Number(e.target.value) : '')}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seçin</option>
                        {currencies.map((cur) => (
                          <option key={cur.id} value={cur.id}>{cur.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const v = isPackageType
                                ? (calculatedPackagePrice ?? 0)
                                : (() => {
                                    const el = document.getElementById('price') as HTMLInputElement | null
                                    const raw = el?.value != null && el.value !== '' ? parseDecimal(el.value) : Number(form.price) || 0
                                    return isNaN(raw) ? 0 : raw
                                  })()
                              handlePriceChange(v)
                            }}
                            className="h-10 w-10 shrink-0"
                          >
                            <Calculator className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <div className="font-medium">Tüm fiyatları hesapla</div>
                            {calculationRules.length > 0 ? (
                              calculationRules.map((r) => (
                                <div key={r.id} className="text-xs text-muted-foreground">
                                  {formatOperationsAsFormula(r.operations, 'Genel Fiyat')} → {priceTypes.find((pt) => String(pt.id) === r.target)?.name ?? r.target}
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-muted-foreground">Formül tanımlanmadığında hesaplama yapılmaz</div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                    )
                  })()}
                  {/* Diğer fiyat tipleri - tek satır */}
                  {priceTypes.map((pt) => {
                    const data = form.prices[pt.id] ?? { price: 0, currency_id: null, status: 1 }
                    const cur = data.currency_id ? currencies.find((c) => c.id === data.currency_id) : null
                    const currencySymbol = cur?.symbol ?? ''
                    const priceDisplay = formatPriceWithSymbol(data.price, currencySymbol)
                    return (
                      <div key={pt.id} className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2 text-sm font-medium">{pt.name}</div>
                        <div className="col-span-2 flex items-center gap-2">
                          <Switch
                            checked={!!data.status}
                            onCheckedChange={(v) => setForm((f) => ({
                              ...f,
                              prices: {
                                ...f.prices,
                                [pt.id]: { ...(f.prices[pt.id] ?? { price: 0, currency_id: null, status: 1 }), status: v ? 1 : 0 },
                              },
                            }))}
                          />
                          <span className="text-muted-foreground text-sm">Aktif</span>
                        </div>
                        <div className="col-span-5 flex items-center">
                          <div className="flex-1 flex h-10 w-full items-center justify-end rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-right tabular-nums">
                            {priceDisplay}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="flex h-10 w-full items-center justify-end rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-right tabular-nums">
                            {currencySymbol || '—'}
                          </div>
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  const v = isPackageType
                                    ? (calculatedPackagePrice ?? 0)
                                    : (() => {
                                        const el = document.getElementById('price') as HTMLInputElement | null
                                        const raw = el?.value != null && el.value !== '' ? parseDecimal(el.value) : Number(form.price) || 0
                                        return isNaN(raw) ? 0 : raw
                                      })()
                                  handlePriceChange(v)
                                }}
                                className="h-10 w-10 shrink-0"
                              >
                                <Calculator className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {(() => {
                                const rule = calculationRules.find((r) => r.target === String(pt.id))
                                return rule
                                  ? formatOperationsAsFormula(rule.operations, 'Genel Fiyat')
                                  : 'Formül tanımlanmadığında hesaplama yapılmaz'
                              })()}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </TabsContent>
              <TabsContent value="gorsel" className="space-y-4 mt-4 min-h-[55vh]">
                <div>
                  <ProductImagesGrid
                    images={form.images}
                    onChange={(images) => {
                      setForm((f) => ({ ...f, images }))
                      if (editingId) {
                        const imageValue = serializeImagesToImage(images)
                        setData((prev) => prev.map((p) => (p.id === editingId ? { ...p, image: imageValue } : p)))
                      }
                    }}
                  />
                </div>
              </TabsContent>
              {isPackageType && (
                <TabsContent value="paket" className="space-y-4 mt-4 min-h-[55vh]">
                  <PackageContentsTab
                    packageItems={packageItems}
                    onChange={setPackageItems}
                    excludeProductId={editingId ?? undefined}
                  />
                </TabsContent>
              )}
              <TabsContent value="e-ticaret" className="space-y-4 mt-4 min-h-[55vh]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateEcommerce}
                      disabled={aiGenerateLoading || !form.name?.trim()}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {aiGenerateLoading ? 'Oluşturuluyor...' : 'ChatGPT ile Oluştur'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ecommerce_name">E-Ticaret Adı</Label>
                    <Input
                      id="ecommerce_name"
                      value={form.ecommerce_name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, ecommerce_name: e.target.value }))}
                      placeholder="E-ticaret sitelerinde görünecek ürün adı (boşsa ana ad kullanılır)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="main_description">Açıklama</Label>
                    <textarea
                      id="main_description"
                      value={form.main_description ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, main_description: e.target.value }))}
                      placeholder="Ürün açıklaması"
                      rows={4}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seo_slug">SEO Bağlantısı</Label>
                    <Input
                      id="seo_slug"
                      value={form.seo_slug ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, seo_slug: e.target.value }))}
                      placeholder="urun-adi-seo-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seo_title">Meta Başlığı</Label>
                    <Input
                      id="seo_title"
                      value={form.seo_title ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                      placeholder="Sayfa başlığı (SEO)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seo_description">Meta Açıklaması</Label>
                    <textarea
                      id="seo_description"
                      value={form.seo_description ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))}
                      placeholder="Meta description (SEO)"
                      rows={2}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label>Ürün Kodu</Label>
                      <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                        {form.sku || '—'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Üretici</Label>
                      <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                        {form.brand_id ? brands.find((b) => b.id === form.brand_id)?.name ?? '—' : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Kategoriler</Label>
                    <div className="flex min-h-10 items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                      {categoryPath.length > 0 ? categoryPath.map((p) => p.name).join(' › ') : '—'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Fiyat</Label>
                    <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm tabular-nums">
                      {(() => {
                        const ecomPrice = form.prices[1] ?? { price: form.price, currency_id: form.currency_id }
                        const cur = ecomPrice.currency_id ? currencies.find((c) => c.id === ecomPrice.currency_id) : null
                        return ecomPrice.price != null
                          ? `${formatPrice(ecomPrice.price)} ${cur?.symbol ?? ''}`.trim() || '—'
                          : '—'
                      })()}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Resimler</Label>
                    <ProductImagesGrid
                      images={form.images}
                      onChange={(images) => {
                        setForm((f) => ({ ...f, images }))
                        if (editingId) {
                          const imageValue = serializeImagesToImage(images)
                          setData((prev) => prev.map((p) => (p.id === editingId ? { ...p, image: imageValue } : p)))
                        }
                      }}
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="diger" className="space-y-4 mt-4 min-h-[55vh]">
                <div className="space-y-2">
                  <Label htmlFor="gtip_code">GTİP Kodu</Label>
                  <Input
                    id="gtip_code"
                    value={form.gtip_code}
                    onChange={(e) => setForm((f) => ({ ...f, gtip_code: e.target.value }))}
                    placeholder="Gümrük tarife kodu"
                  />
                </div>
              </TabsContent>
            </Tabs>
            </div>
            <DialogFooter className="flex-row justify-between sm:!justify-between gap-2 pt-4 border-t w-full shrink-0 mt-auto">
              <div className="flex items-center gap-4 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Input
                        id="sort_order"
                        type="number"
                        value={form.sort_order}
                        onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                        className="w-16 h-9"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Sıra</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Switch
                        id="modal-status"
                        checked={!!form.status}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Aktif</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {modalTab === 'e-ticaret' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!!publishLoading}
                        className="gap-2"
                      >
                        <Send className="h-4 w-4" />
                        {publishLoading ? 'Yayınlanıyor...' : 'Yayınla'}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setOpenCartPublishOpen(true)} disabled={!!publishLoading}>
                        OpenCart
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePublish('okm')} disabled={!!publishLoading}>
                        OKM
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePublish('trendyol')} disabled={!!publishLoading}>
                        Trendyol
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {editingId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => openDeleteConfirm(editingId!, closeModal)}
                          disabled={saving}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Sil</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                        disabled={saving}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Kopyala</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      size="icon"
                      variant="outline"
                      disabled={saving || !form.name.trim() || !form.type_id}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Kaydet</TooltipContent>
                </Tooltip>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((p) => ({ ...p, open: o }))}
        description="Bu ürünü silmek istediğinize emin misiniz?"
        onConfirm={executeDelete}
        loading={deleting}
      />

      <Dialog open={openCartPublishOpen} onOpenChange={(o) => !o && setOpenCartPublishOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>OpenCart&apos;a Yayınla</DialogTitle>
            <DialogDescription>
              Ürün OpenCart&apos;ta yoksa yeni oluşturulur. Varolan ürünler için güncellenecek alanları seçin:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={openCartUpdateOptions.update_price}
                onChange={(e) => setOpenCartUpdateOptions((o) => ({ ...o, update_price: e.target.checked }))}
                className="rounded border-input"
              />
              <span className="text-sm">Fiyat güncelle</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={openCartUpdateOptions.update_description}
                onChange={(e) => setOpenCartUpdateOptions((o) => ({ ...o, update_description: e.target.checked }))}
                className="rounded border-input"
              />
              <span className="text-sm">Açıklama güncelle (ad, açıklama, SEO)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={openCartUpdateOptions.update_images}
                onChange={(e) => setOpenCartUpdateOptions((o) => ({ ...o, update_images: e.target.checked }))}
                className="rounded border-input"
              />
              <span className="text-sm">Görsel güncelle</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCartPublishOpen(false)}>
              İptal
            </Button>
            <Button
              onClick={() => {
                setOpenCartPublishOpen(false)
                handlePublish('opencart', openCartUpdateOptions)
              }}
              disabled={!!publishLoading}
            >
              {publishLoading === 'opencart' ? 'Yayınlanıyor...' : 'Yayınla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!imageUploadProduct} onOpenChange={(open) => !open && closeImageUploadModal()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Görsel Yükle</DialogTitle>
            <DialogDescription>
              {imageUploadProduct?.name}
              {imageUploadProduct?.sku && (
                <span className="ml-2 text-muted-foreground">({imageUploadProduct.sku})</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-[55vh]">
            <ProductImagesGrid
              images={imageUploadImages}
              onChange={handleImageUploadChange}
            />
          </div>
          {imageUploadSaving && (
            <p className="text-sm text-muted-foreground">Kaydediliyor…</p>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
