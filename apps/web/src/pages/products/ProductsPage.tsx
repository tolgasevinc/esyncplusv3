import { useState, useEffect, useCallback, useRef, useMemo, forwardRef } from 'react'
import type { ComponentPropsWithoutRef, MutableRefObject, FormEvent, ChangeEvent } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import {
  Plus,
  X,
  Trash2,
  Copy,
  Save,
  ChevronDown,
  Check,
  Link2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Search,
  Calculator,
  Image,
  Send,
  Sparkles,
  Layers,
  Store,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
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
import { API_URL, parseJsonResponse } from '@/lib/api'
import {
  CategorySelect,
  getCategoryPath,
  formatCategoryPathDisplay,
  splitCategoryPathForListColumn,
  type CategoryItem,
} from '@/components/CategorySelect'
import {
  fetchSidebarMenus,
  getIdeasoftSidebarIconSrc,
  getParasutSidebarIconSrc,
  getSidebarMenus,
  SIDEBAR_MENUS_UPDATED_EVENT,
} from '@/lib/sidebar-menus'
import { ProductCodeDisplay } from '@/components/ProductCodeDisplay'
import { ProductPricePreview } from '@/components/ProductPricePreview'
import { buildProductCode } from '@/lib/productCode'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
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
const DynamicBgSpan = forwardRef<HTMLSpanElement, { color: string; className?: string } & ComponentPropsWithoutRef<'span'>>(
  function DynamicBgSpan({ color, className, ...rest }, ref) {
    const refFn = useCallback(
      (el: HTMLSpanElement | null) => {
        if (el) el.style.setProperty('--dynamic-bg', color)
        if (typeof ref === 'function') ref(el)
        else if (ref) (ref as MutableRefObject<HTMLSpanElement | null>).current = el
      },
      [color]
    )
    return <span ref={refFn} className={cn('dynamic-bg', className)} {...rest} />
  }
)

/** Dinamik arka plan + metin rengi (button) - style attribute yerine ref ile CSS değişkeni atar */
function DynamicBgFgButton({ bg, fg = '#fff', className, ...rest }: { bg: string; fg?: string; className?: string } & ComponentPropsWithoutRef<'button'>) {
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
  ecommerce_enabled?: number
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
  seo_keywords?: string
  type_name?: string
  type_color?: string
  unit_name?: string
  currency_symbol?: string
  product_item_group_id?: number
  product_item_group_name?: string
  product_item_group_code?: string
  /** Kayıtlı Paraşüt ürün ID (metin) */
  parasut_product_id?: string | null
  /** Kayıtlı IdeaSoft ürün ID */
  ideasoft_product_id?: number | null
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

/** IdeaSoft sütun ikonu — sidebar ikonu yoksa gösterilir */
function IdeasoftMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-sky-500" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="white"
        fontSize="15"
        fontWeight="700"
        fontFamily="system-ui,Segoe UI,sans-serif"
      >
        i
      </text>
    </svg>
  )
}

function normalizeCategoryColor(c: string | undefined | null): string | null {
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

function textOnCategoryColor(bg: string): string {
  const hex = normalizeCategoryColor(bg)
  if (!hex || hex.length < 7) return '#171717'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return y > 0.55 ? '#171717' : '#ffffff'
}

function CategoryListCodeBadge({ code, color }: { code: string; color?: string | null }) {
  const bg = normalizeCategoryColor(color ?? '')
  const fg = bg ? textOnCategoryColor(bg) : ''
  return (
    <span
      className={cn(
        'inline-flex max-w-full min-w-0 items-center truncate rounded border border-transparent px-1.5 py-0.5 font-mono text-[11px] leading-none',
        !bg && 'bg-secondary text-secondary-foreground'
      )}
      style={bg ? { backgroundColor: bg, color: fg } : undefined}
    >
      {code}
    </span>
  )
}

/** SKU/code karşılaştırması için normalize (Parasut eşleşme) */
function normalizeSku(s: string | undefined): string {
  return (s || '').trim().toLowerCase().replace(/ı/g, 'i').replace(/İ/g, 'i')
}

/** IdeaSoft toplu aktarım hata gövdesi (bazen JSON string) */
function formatIdeasoftBulkErrorLine(raw: string | undefined): string {
  if (!raw?.trim()) return 'Bilinmeyen hata'
  const t = raw.trim()
  try {
    const j = JSON.parse(t) as { errorMessage?: string; message?: string; code?: number }
    if (j && typeof j === 'object') {
      const msg = (j.errorMessage || j.message || '').trim()
      if (msg) return j.code != null ? `[${j.code}] ${msg}` : msg
    }
  } catch {
    /* düz metin */
  }
  return t.length > 280 ? `${t.slice(0, 280)}…` : t
}

const PARASUT_ATTR_LABELS: Record<string, string> = {
  code: 'Kod',
  name: 'Ürün adı',
  list_price: 'Satış fiyatı',
  currency: 'Para birimi',
  buying_price: 'Alış fiyatı',
  buying_currency: 'Alış para birimi',
  unit: 'Birim',
  vat_rate: 'KDV oranı',
  stock_count: 'Stok miktarı',
  initial_stock_count: 'Stok (Paraşüt)',
  barcode: 'Barkod',
  gtip: 'GTIP',
  supplier_code: 'Tedarikçi kodu',
  photo: 'Ana görsel',
}

function parasutFetchErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|networkerror|load failed|network request failed|aborted/i.test(msg)) {
    return 'Sunucuya ulaşılamadı veya istek yarım kaldı (zaman aşımı / ağ / güvenlik duvarı). API veya Paraşüt yanıtı uzun sürdüyse tekrar deneyin. Yeni ürün oluşturmada görsel şimdilik atlanır; gerekirse Paraşüt › Ürünler’den güncelleyin.'
  }
  return msg
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

function hasProductImagePaths(image: string | undefined): boolean {
  return parseImageToArray(image).some((s) => s.trim().length > 0)
}

/** Modal / form: görseller `images[]` slot dizisinde tutulur (`image` kolonu ayrı alan değil). */
function hasFormProductImages(images: string[] | undefined): boolean {
  return (images ?? []).some((s) => typeof s === 'string' && s.trim().length > 0)
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
  ecommerce_enabled: true,
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
  seo_keywords: '',
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
  /** Ürün listesi: eşleştirme sütunu sunucu filtresi */
  filterIntegration: '' as '' | 'parasut' | 'ideasoft',
  sortBy: 'sort_order' as SortBy,
  sortOrder: 'asc' as SortOrder,
  page: 1,
  pageSize: 'fit' as PageSizeValue,
  fitLimit: 10,
}

/** Kategori filtresi paneli: grup → kategori → alt kategori ağacı */
interface FilterCatNode {
  cat: CategoryItem
  subs: CategoryItem[]
}

interface FilterGroupNode {
  group: CategoryItem
  cats: FilterCatNode[]
}

interface CategoryFilterPanelModel {
  groups: FilterGroupNode[]
  orphans: FilterCatNode[]
}

function buildCategoryFilterPanelModel(categories: CategoryItem[]): CategoryFilterPanelModel {
  const groups = categories.filter(
    (c) => (!c.group_id || c.group_id === 0) && (!c.category_id || c.category_id === 0)
  )
  const cats = categories.filter((c) => !c.category_id || c.category_id === 0)
  const subCats = categories.filter((c) => c.category_id && c.category_id > 0)

  const byGroup = new Map<number, CategoryItem[]>()
  cats.forEach((c) => {
    const gid = c.group_id ?? 0
    if (gid > 0) {
      if (!byGroup.has(gid)) byGroup.set(gid, [])
      byGroup.get(gid)!.push(c)
    }
  })

  const byParent = new Map<number, CategoryItem[]>()
  subCats.forEach((c) => {
    const pid = c.category_id!
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(c)
  })

  const groupNodes: FilterGroupNode[] = groups
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .map((group) => {
      const groupCats = byGroup.get(group.id) || []
      const catNodes: FilterCatNode[] = groupCats
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
        .map((cat) => ({
          cat,
          subs: (byParent.get(cat.id) || [])
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
        }))
      return { group, cats: catNodes }
    })

  const noGroupCats = cats.filter((c) => c.group_id == null && !groups.some((g) => g.id === c.id))
  const orphans: FilterCatNode[] = noGroupCats
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .map((cat) => ({
      cat,
      subs: (byParent.get(cat.id) || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    }))

  return { groups: groupNodes, orphans }
}

/** Cascade 1. sütun: grupsuz kategoriler için sanal grup anahtarı */
const CATEGORY_FILTER_ORPHAN_GROUP_KEY = '__orphans__'

function resolveProductListCategoryCascade(
  categories: CategoryItem[],
  filterGroupId: string,
  filterCategoryId: string
): { groupKey: string; categoryId: string; subId: string } {
  const empty = { groupKey: '', categoryId: '', subId: '' }
  if (!filterCategoryId && !filterGroupId) return empty
  if (filterGroupId && !filterCategoryId) {
    return { groupKey: filterGroupId, categoryId: '', subId: '' }
  }
  const id = parseInt(filterCategoryId, 10)
  if (Number.isNaN(id)) return empty
  const row = categories.find((c) => c.id === id)
  if (!row) return { groupKey: filterGroupId || '', categoryId: filterCategoryId, subId: '' }

  if (row.category_id && row.category_id > 0) {
    const parent = categories.find((c) => c.id === row.category_id)
    const groupKey =
      parent && (parent.group_id ?? 0) > 0 ? String(parent.group_id) : CATEGORY_FILTER_ORPHAN_GROUP_KEY
    return { groupKey, categoryId: String(row.category_id), subId: String(id) }
  }

  const groupKey = (row.group_id ?? 0) > 0 ? String(row.group_id) : CATEGORY_FILTER_ORPHAN_GROUP_KEY
  return { groupKey, categoryId: String(id), subId: '' }
}

export function ProductsPage() {
  const [listState, setListState] = usePersistedListState('products', productsListDefaults)
  const { search, filterName, filterSku, filterBrandId, filterCategoryId, filterGroupId, filterTypeId, filterNoImage, filterIntegration, sortBy, sortOrder, page, pageSize, fitLimit } = listState
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
  const [aiSeoLoading, setAiSeoLoading] = useState(false)
  const [aiEcommerceLoading, setAiEcommerceLoading] = useState(false)
  const [competitorUrlsText, setCompetitorUrlsText] = useState('')
  const [openCartPublishOpen, setOpenCartPublishOpen] = useState(false)
  const [openCartUpdateOptions, setOpenCartUpdateOptions] = useState({ update_price: true, update_description: true, update_images: true })
  const [parasutTransferLoading, setParasutTransferLoading] = useState(false)
  const [parasutPreviewLoading, setParasutPreviewLoading] = useState(false)
  const [parasutTransferModalOpen, setParasutTransferModalOpen] = useState(false)
  const [parasutPending, setParasutPending] = useState<{
    parasut_id: string
    sku_used: string
    parasut_product: { id?: string; code: string; name: string } | null
    attributes_display: Record<string, unknown>
    selected_fields: { parasut: string; master: string }[]
    has_photo: boolean
  } | null>(null)
  const [parasutSyncProductInfo, setParasutSyncProductInfo] = useState(true)
  const [parasutSyncPhoto, setParasutSyncPhoto] = useState(true)
  const [parasutSyncPrice, setParasutSyncPrice] = useState(true)
  const [ideasoftTransferLoading, setIdeasoftTransferLoading] = useState(false)
  const [ideasoftTransferModalOpen, setIdeasoftTransferModalOpen] = useState(false)
  const [ideasoftSyncGeneral, setIdeasoftSyncGeneral] = useState(false)
  const [ideasoftSyncPrice, setIdeasoftSyncPrice] = useState(false)
  const [ideasoftSyncImages, setIdeasoftSyncImages] = useState(false)
  const [ideasoftSyncSeo, setIdeasoftSyncSeo] = useState(false)
  const [ideasoftTransferStock, setIdeasoftTransferStock] = useState('20')
  const [ideasoftTransferDiscountPct, setIdeasoftTransferDiscountPct] = useState('55')
  /** API isteğinde 0=yüzde, 1=sabit; sunucu IdeaSoft ürün discountType değerini ters eşler */
  const [ideasoftTransferDiscountType, setIdeasoftTransferDiscountType] = useState<0 | 1>(0)
  const [ideasoftApplyTransferStock, setIdeasoftApplyTransferStock] = useState(true)
  const [ideasoftApplyTransferDiscount, setIdeasoftApplyTransferDiscount] = useState(true)
  /** Modal kategori: grupsuz zinciri ve alt seçimi bekleyen orta kategori */
  const [modalCategoryOrphanBucket, setModalCategoryOrphanBucket] = useState(false)
  const [modalCategoryMiddlePending, setModalCategoryMiddlePending] = useState<number | ''>('')
  /** category_id boşken seçilen grup (liste filtresindeki filter_group_id ile aynı rol) */
  const [modalCategoryGroupKey, setModalCategoryGroupKey] = useState('')
  /** Liste: grupsuz kategoriler sanal grubu (sunucu parametresi yok; UI durumu) */
  const [categoryFilterOrphanBucket, setCategoryFilterOrphanBucket] = useState(false)
  const [filterBrandSearch, setFilterBrandSearch] = useState('')
  const [matchedCodesByBrand, setMatchedCodesByBrand] = useState<Record<number, Set<string>>>({})
  const [matchedParasutSkus, setMatchedParasutSkus] = useState<Set<string>>(new Set())
  const [parasutIconSrc, setParasutIconSrc] = useState<string | undefined>()
  const [ideasoftIconSrc, setIdeasoftIconSrc] = useState<string | undefined>()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkModal, setBulkModal] = useState<
    'category' | 'type' | 'itemGroup' | 'brand' | 'unit' | 'tax' | 'quantity' | null
  >(null)
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('')
  const [bulkTypeId, setBulkTypeId] = useState<number | ''>('')
  const [bulkItemGroupId, setBulkItemGroupId] = useState<number | ''>('')
  const [bulkBrandId, setBulkBrandId] = useState<number | ''>('')
  const [bulkUnitId, setBulkUnitId] = useState<number | ''>('')
  const [bulkTaxRate, setBulkTaxRate] = useState<string>('20')
  const [bulkQuantity, setBulkQuantity] = useState<string>('0')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [ideasoftBulkLoading, setIdeasoftBulkLoading] = useState(false)
  const [ideasoftBulkTransferModalOpen, setIdeasoftBulkTransferModalOpen] = useState(false)
  const [ideasoftBulkSyncGeneral, setIdeasoftBulkSyncGeneral] = useState(false)
  const [ideasoftBulkSyncPrice, setIdeasoftBulkSyncPrice] = useState(false)
  const [ideasoftBulkSyncImages, setIdeasoftBulkSyncImages] = useState(false)
  const [ideasoftBulkSyncSeo, setIdeasoftBulkSyncSeo] = useState(false)
  const [ideasoftBulkTransferStock, setIdeasoftBulkTransferStock] = useState('20')
  const [ideasoftBulkTransferDiscountPct, setIdeasoftBulkTransferDiscountPct] = useState('55')
  const [ideasoftBulkTransferDiscountType, setIdeasoftBulkTransferDiscountType] = useState<0 | 1>(0)
  const [ideasoftBulkApplyTransferStock, setIdeasoftBulkApplyTransferStock] = useState(true)
  const [ideasoftBulkApplyTransferDiscount, setIdeasoftBulkApplyTransferDiscount] = useState(true)
  const [ideasoftBulkSummary, setIdeasoftBulkSummary] = useState<{
    succeeded: number
    failed: number
    rows: {
      product_id: number
      nameLabel: string
      skuLabel: string
      ok: boolean
      ideasoft_product_id?: number
      detail: string
    }[]
  } | null>(null)

  const ideasoftSingleCanSubmit = useMemo(() => {
    const hasSync =
      ideasoftSyncGeneral || ideasoftSyncPrice || ideasoftSyncImages || ideasoftSyncSeo
    if (hasSync) return true
    if (ideasoftApplyTransferStock) return true
    if (ideasoftApplyTransferDiscount) {
      const raw = String(ideasoftTransferDiscountPct).trim()
      if (!raw) return false
      const n = parseFloat(raw.replace(',', '.'))
      return Number.isFinite(n) && n > 0
    }
    return false
  }, [
    ideasoftSyncGeneral,
    ideasoftSyncPrice,
    ideasoftSyncImages,
    ideasoftSyncSeo,
    ideasoftApplyTransferStock,
    ideasoftApplyTransferDiscount,
    ideasoftTransferDiscountPct,
  ])

  const ideasoftBulkCanSubmit = useMemo(() => {
    const hasSync =
      ideasoftBulkSyncGeneral || ideasoftBulkSyncPrice || ideasoftBulkSyncImages || ideasoftBulkSyncSeo
    if (hasSync) return true
    if (ideasoftBulkApplyTransferStock) return true
    if (ideasoftBulkApplyTransferDiscount) {
      const raw = String(ideasoftBulkTransferDiscountPct).trim()
      if (!raw) return false
      const n = parseFloat(raw.replace(',', '.'))
      return Number.isFinite(n) && n > 0
    }
    return false
  }, [
    ideasoftBulkSyncGeneral,
    ideasoftBulkSyncPrice,
    ideasoftBulkSyncImages,
    ideasoftBulkSyncSeo,
    ideasoftBulkApplyTransferStock,
    ideasoftBulkApplyTransferDiscount,
    ideasoftBulkTransferDiscountPct,
  ])

  const imageUploadProductRef = useRef<Product | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter =
    search.length > 0 ||
    filterName.length > 0 ||
    filterSku.length > 0 ||
    filterBrandId !== '' ||
    filterCategoryId !== '' ||
    filterGroupId !== '' ||
    categoryFilterOrphanBucket ||
    filterTypeId !== '' ||
    filterNoImage ||
    filterIntegration !== ''

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
  useEffect(() => {
    if (filterCategoryId || filterGroupId) setCategoryFilterOrphanBucket(false)
  }, [filterCategoryId, filterGroupId])
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setListState({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 })
    } else {
      setListState({ sortBy: col, sortOrder: 'asc', page: 1 })
    }
  }

  const handleResetFilters = () => {
    setListState({
      search: '',
      filterName: '',
      filterSku: '',
      filterBrandId: '',
      filterCategoryId: '',
      filterGroupId: '',
      filterTypeId: '',
      filterNoImage: false,
      filterIntegration: '',
      page: 1,
    })
    setDebouncedSearch('')
    setDebouncedFilterName('')
    setDebouncedFilterSku('')
    setFilterBrandSearch('')
    setCategoryFilterOrphanBucket(false)
  }

  const handleEcommerceToggle = useCallback(async (productId: number, enabled: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecommerce_enabled: enabled }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Güncellenemedi')
      setData((prev) => prev.map((p) => (p.id === productId ? { ...p, ecommerce_enabled: enabled ? 1 : 0 } : p)))
      toastSuccess(enabled ? 'E-ticarete açıldı' : 'E-ticarete kapatıldı', 'Ürün dışa aktarım ve entegrasyonlara dahil edilecek.')
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Güncellenemedi')
    }
  }, [])

  const buildParasutOverridesFromDisplay = useCallback(
    (disp: Record<string, unknown>) => {
      const nameVal = disp.name != null ? String(disp.name).trim() : ''
      if (!nameVal) {
        toastError('Paraşüt aktarımı', 'Ürün adı boş; önce ürünü kaydedin.')
        return null
      }
      const numericKeys = new Set(['list_price', 'vat_rate', 'initial_stock_count', 'stock_count'])
      const overrides: Record<string, unknown> = {}
      for (const [k, raw] of Object.entries(disp)) {
        if (k === 'buying_price' || k === 'buying_currency') continue
        if (raw === null || raw === undefined) {
          overrides[k] = ''
          continue
        }
        if (typeof raw === 'number' && numericKeys.has(k)) {
          overrides[k] = raw
          continue
        }
        const s = typeof raw === 'string' ? raw.trim() : String(raw)
        if (s === '' && typeof raw !== 'number') {
          overrides[k] = ''
          continue
        }
        if (numericKeys.has(k)) {
          const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : parseFloat(s.replace(',', '.'))
          if (Number.isNaN(n)) {
            toastError('Paraşüt aktarımı', `"${PARASUT_ATTR_LABELS[k] ?? k}" için geçersiz sayı.`)
            return null
          }
          overrides[k] = n
        } else {
          overrides[k] = typeof raw === 'string' ? s : raw
        }
      }
      return overrides
    },
    []
  )

  const executeParasutPush = useCallback(
    async (opts: {
      createNew: boolean
      parasutId?: string
      selected_fields: { parasut: string; master: string }[]
      attributes_display: Record<string, unknown>
      sync?: { product: boolean; photo: boolean; price: boolean }
    }) => {
      if (!editingId) return
      const overrides = buildParasutOverridesFromDisplay(opts.attributes_display)
      if (!overrides) return
      const body: Record<string, unknown> = {
        product_id: editingId,
        create_new: opts.createNew,
        selected_fields: opts.selected_fields,
        attribute_overrides: overrides,
      }
      if (!opts.createNew && opts.parasutId) body.parasut_id = opts.parasutId
      if (!opts.createNew && opts.sync) {
        body.sync_product_info = opts.sync.product
        body.sync_photo = opts.sync.photo
        body.sync_price = opts.sync.price
      }
      const pushRes = await fetch(`${API_URL}/api/parasut/products/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const pushData = await parseJsonResponse<{ error?: string; message?: string }>(pushRes)
      if (!pushRes.ok) throw new Error(pushData.error || 'Aktarım başarısız')
      toastSuccess(
        'Paraşüt',
        pushData.message ||
          (opts.createNew ? 'Paraşüt’te yeni ürün oluşturuldu.' : 'Ürün Paraşüt’e aktarıldı.')
      )
    },
    [editingId, buildParasutOverridesFromDisplay]
  )

  /** SKU ile Paraşüt’te kayıt varsa modal ile kümeler; yoksa doğrudan tam aktarım. */
  const runParasutTransfer = useCallback(async () => {
    if (!editingId) return
    setParasutPreviewLoading(true)
    try {
      const prevRes = await fetch(`${API_URL}/api/parasut/products/push-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: editingId }),
      })
      const prevData = await parseJsonResponse<{
        error?: string
        parasut_id?: string | null
        parasut_product?: { id?: string; code: string; name: string } | null
        sku_used?: string
        attributes_display?: Record<string, unknown>
        selected_fields?: { parasut: string; master: string }[]
        has_photo?: boolean
      }>(prevRes)
      if (!prevRes.ok) throw new Error(prevData.error || 'Önizleme alınamadı')

      const rawPid = prevData.parasut_id
      const fromProduct = prevData.parasut_product?.id
      const parasutIdResolved =
        rawPid != null && String(rawPid).trim() !== ''
          ? String(rawPid).trim()
          : fromProduct != null && String(fromProduct).trim() !== ''
            ? String(fromProduct).trim()
            : ''

      const selected = Array.isArray(prevData.selected_fields) ? prevData.selected_fields : []
      const disp = prevData.attributes_display ?? {}

      if (!parasutIdResolved) {
        setParasutTransferLoading(true)
        try {
          await executeParasutPush({
            createNew: true,
            selected_fields: selected,
            attributes_display: disp,
          })
        } finally {
          setParasutTransferLoading(false)
        }
        return
      }

      setParasutPending({
        parasut_id: parasutIdResolved,
        sku_used: String(prevData.sku_used ?? ''),
        parasut_product: prevData.parasut_product ?? null,
        attributes_display: disp,
        selected_fields: selected,
        has_photo: !!prevData.has_photo,
      })
      setParasutSyncProductInfo(true)
      setParasutSyncPhoto(true)
      setParasutSyncPrice(true)
      setParasutTransferModalOpen(true)
    } catch (e) {
      toastError('Paraşüt aktarımı', parasutFetchErrorMessage(e))
    } finally {
      setParasutPreviewLoading(false)
    }
  }, [editingId, executeParasutPush])

  const confirmParasutTransferModal = useCallback(async () => {
    if (!editingId || !parasutPending) return
    if (!parasutSyncProductInfo && !parasutSyncPhoto && !parasutSyncPrice) {
      toastError('Paraşüt aktarımı', 'En az bir seçenek işaretleyin.')
      return
    }
    setParasutTransferLoading(true)
    try {
      await executeParasutPush({
        createNew: false,
        parasutId: parasutPending.parasut_id,
        selected_fields: parasutPending.selected_fields,
        attributes_display: parasutPending.attributes_display,
        sync: {
          product: parasutSyncProductInfo,
          photo: parasutSyncPhoto,
          price: parasutSyncPrice,
        },
      })
      setParasutTransferModalOpen(false)
      setParasutPending(null)
    } catch (e) {
      toastError('Paraşüt aktarımı', parasutFetchErrorMessage(e))
    } finally {
      setParasutTransferLoading(false)
    }
  }, [
    editingId,
    parasutPending,
    parasutSyncProductInfo,
    parasutSyncPhoto,
    parasutSyncPrice,
    executeParasutPush,
  ])

  const openIdeasoftTransferModal = useCallback(() => {
    setIdeasoftSyncGeneral(false)
    setIdeasoftSyncPrice(false)
    setIdeasoftSyncImages(false)
    setIdeasoftSyncSeo(false)
    setIdeasoftTransferStock('20')
    setIdeasoftTransferDiscountPct('55')
    setIdeasoftTransferDiscountType(0)
    setIdeasoftApplyTransferStock(true)
    setIdeasoftApplyTransferDiscount(true)
    setIdeasoftTransferModalOpen(true)
  }, [])

  const selectAllIdeasoftSyncSingle = useCallback(() => {
    setIdeasoftSyncGeneral(true)
    setIdeasoftSyncPrice(true)
    setIdeasoftSyncImages(true)
    setIdeasoftSyncSeo(true)
    setIdeasoftApplyTransferStock(true)
    setIdeasoftApplyTransferDiscount(true)
  }, [])

  const confirmIdeasoftTransfer = useCallback(async () => {
    if (!editingId) return
    let stockN: number | undefined
    if (ideasoftApplyTransferStock) {
      stockN = parseFloat(String(ideasoftTransferStock).replace(',', '.'))
      if (!Number.isFinite(stockN) || stockN < 0) {
        toastError('IdeaSoft', 'Stok miktarı 0 veya üzeri geçerli bir sayı olmalıdır.')
        return
      }
    }
    let discN: number | undefined
    if (ideasoftApplyTransferDiscount) {
      const rawDisc = String(ideasoftTransferDiscountPct).trim()
      if (rawDisc !== '') {
        const n = parseFloat(rawDisc.replace(',', '.'))
        if (!Number.isFinite(n) || n <= 0) {
          toastError('IdeaSoft', 'İndirim için 0’dan büyük geçerli bir sayı girin (boş: gönderilmez).')
          return
        }
        if (ideasoftTransferDiscountType === 0 && n > 100) {
          toastError('IdeaSoft', 'Yüzde indirim en fazla 100 olabilir.')
          return
        }
        discN = n
      }
    }
    const hasSyncGroup =
      ideasoftSyncGeneral || ideasoftSyncPrice || ideasoftSyncImages || ideasoftSyncSeo
    const willSendStock = ideasoftApplyTransferStock
    const willSendDiscount = ideasoftApplyTransferDiscount && discN !== undefined && discN > 0
    if (!hasSyncGroup && !willSendStock && !willSendDiscount) {
      toastError(
        'IdeaSoft',
        'En az bir bilgi grubu seçin veya “Stok gönder” / geçerli indirim ile güncelleme yapın.',
      )
      return
    }
    setIdeasoftTransferLoading(true)
    try {
      const payload: Record<string, unknown> = {
        sync_general: ideasoftSyncGeneral,
        sync_price: ideasoftSyncPrice,
        sync_images: ideasoftSyncImages,
        sync_seo: ideasoftSyncSeo,
      }
      if (ideasoftApplyTransferStock && stockN !== undefined) payload.ideasoft_stock_amount = stockN
      if (ideasoftApplyTransferDiscount && discN !== undefined && discN > 0) {
        payload.ideasoft_discount_percent = discN
        payload.ideasoft_discount_type = ideasoftTransferDiscountType
      }
      const res = await fetch(`${API_URL}/api/products/${editingId}/ideasoft-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await parseJsonResponse<{ error?: string; hint?: string; message?: string }>(res)
      if (!res.ok) {
        const msg = data.error || 'IdeaSoft aktarımı başarısız'
        const h = data.hint?.trim()
        throw new Error(h ? `${msg}\n\n${h}` : msg)
      }
      toastSuccess('IdeaSoft', data.message || 'Ürün IdeaSoft’a aktarıldı.')
      setIdeasoftTransferModalOpen(false)
    } catch (e) {
      toastError('Hata', parasutFetchErrorMessage(e))
    } finally {
      setIdeasoftTransferLoading(false)
    }
  }, [
    editingId,
    ideasoftSyncGeneral,
    ideasoftSyncPrice,
    ideasoftSyncImages,
    ideasoftSyncSeo,
    ideasoftTransferStock,
    ideasoftTransferDiscountPct,
    ideasoftTransferDiscountType,
    ideasoftApplyTransferStock,
    ideasoftApplyTransferDiscount,
  ])

  const categoryPath = useMemo(
    () => getCategoryPath(categories, form.category_id),
    [categories, form.category_id]
  )
  const brandCode = useMemo(
    () => (form.brand_id ? brands.find((b) => b.id === form.brand_id)?.code ?? '' : ''),
    [brands, form.brand_id]
  )
  const isPackageType = useMemo(() => {
    if (!form.type_id) return false
    const t = types.find((x) => x.id === form.type_id)
    const code = (t?.code ?? '').toUpperCase()
    return code === 'PAK' || code === 'PAKET'
  }, [types, form.type_id])
  const categoryFilterPanelModel = useMemo(() => buildCategoryFilterPanelModel(categories), [categories])

  const listFilterCascadeUi = useMemo(
    () => resolveProductListCategoryCascade(categories, filterGroupId, filterCategoryId),
    [categories, filterGroupId, filterCategoryId]
  )

  const listFilterGroupSelectValue = useMemo(
    () =>
      listFilterCascadeUi.groupKey ||
      (categoryFilterOrphanBucket ? CATEGORY_FILTER_ORPHAN_GROUP_KEY : ''),
    [listFilterCascadeUi.groupKey, categoryFilterOrphanBucket]
  )

  const listFilterMiddleOptions = useMemo(() => {
    const gk = listFilterGroupSelectValue
    if (!gk) return [] as FilterCatNode[]
    if (gk === CATEGORY_FILTER_ORPHAN_GROUP_KEY) return categoryFilterPanelModel.orphans
    const gid = parseInt(gk, 10)
    if (Number.isNaN(gid)) return []
    return categoryFilterPanelModel.groups.find((x) => x.group.id === gid)?.cats ?? []
  }, [listFilterGroupSelectValue, categoryFilterPanelModel])

  const listFilterSubOptions = useMemo(() => {
    if (!listFilterCascadeUi.categoryId) return [] as CategoryItem[]
    const cid = parseInt(listFilterCascadeUi.categoryId, 10)
    if (Number.isNaN(cid)) return []
    return listFilterMiddleOptions.find((n) => n.cat.id === cid)?.subs ?? []
  }, [listFilterCascadeUi.categoryId, listFilterMiddleOptions])

  const onListCategoryGroupChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value
      if (!v) {
        setCategoryFilterOrphanBucket(false)
        setListState({ filterGroupId: '', filterCategoryId: '', page: 1 })
        return
      }
      if (v === CATEGORY_FILTER_ORPHAN_GROUP_KEY) {
        setCategoryFilterOrphanBucket(true)
        setListState({ filterGroupId: '', filterCategoryId: '', page: 1 })
        return
      }
      setCategoryFilterOrphanBucket(false)
      setListState({ filterGroupId: v, filterCategoryId: '', page: 1 })
    },
    [setListState]
  )

  const onListCategoryCategoryChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value
      const gk = listFilterGroupSelectValue
      if (!gk) return
      if (!v) {
        if (gk === CATEGORY_FILTER_ORPHAN_GROUP_KEY) {
          setCategoryFilterOrphanBucket(false)
          setListState({ filterGroupId: '', filterCategoryId: '', page: 1 })
        } else {
          setListState({ filterGroupId: gk, filterCategoryId: '', page: 1 })
        }
        return
      }
      setCategoryFilterOrphanBucket(false)
      setListState({ filterGroupId: '', filterCategoryId: v, page: 1 })
    },
    [setListState, listFilterGroupSelectValue]
  )

  const onListCategorySubChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value
      const mid = listFilterCascadeUi.categoryId
      if (!mid) return
      setCategoryFilterOrphanBucket(false)
      if (v) {
        setListState({ filterGroupId: '', filterCategoryId: v, page: 1 })
        return
      }
      setListState({ filterGroupId: '', filterCategoryId: mid, page: 1 })
    },
    [setListState, listFilterCascadeUi.categoryId]
  )

  const formCategoryCascadeUi = useMemo(
    () =>
      resolveProductListCategoryCascade(
        categories,
        form.category_id ? '' : modalCategoryGroupKey,
        form.category_id ? String(form.category_id) : ''
      ),
    [categories, form.category_id, modalCategoryGroupKey]
  )

  const formCategoryGroupSelectValue = useMemo(
    () =>
      formCategoryCascadeUi.groupKey ||
      (modalCategoryOrphanBucket ? CATEGORY_FILTER_ORPHAN_GROUP_KEY : ''),
    [formCategoryCascadeUi.groupKey, modalCategoryOrphanBucket]
  )

  const formCascadeMiddleOptions = useMemo(() => {
    const gk = formCategoryGroupSelectValue
    if (!gk) return [] as FilterCatNode[]
    if (gk === CATEGORY_FILTER_ORPHAN_GROUP_KEY) return categoryFilterPanelModel.orphans
    const gid = parseInt(gk, 10)
    if (Number.isNaN(gid)) return []
    return categoryFilterPanelModel.groups.find((x) => x.group.id === gid)?.cats ?? []
  }, [formCategoryGroupSelectValue, categoryFilterPanelModel])

  const formMiddleSelectString = useMemo(() => {
    if (formCategoryCascadeUi.categoryId) return formCategoryCascadeUi.categoryId
    if (modalCategoryMiddlePending !== '') return String(modalCategoryMiddlePending)
    return ''
  }, [formCategoryCascadeUi.categoryId, modalCategoryMiddlePending])

  const formCascadeSubOptions = useMemo(() => {
    if (!formMiddleSelectString) return [] as CategoryItem[]
    const cid = parseInt(formMiddleSelectString, 10)
    if (Number.isNaN(cid)) return []
    return formCascadeMiddleOptions.find((n) => n.cat.id === cid)?.subs ?? []
  }, [formMiddleSelectString, formCascadeMiddleOptions])

  const applyFormCategoryId = useCallback(
    (id: number | '') => {
      setModalCategoryMiddlePending('')
      if (typeof id === 'number' && id > 0) {
        setModalCategoryGroupKey('')
      }
      const newPath = getCategoryPath(categories, id)
      setForm((f) => {
        const newSku = buildProductCode(newPath, brandCode, isPackageType ? '' : (f.supplier_code ?? ''))
        return { ...f, category_id: id, sku: newSku || f.sku }
      })
    },
    [categories, brandCode, isPackageType]
  )

  const onFormCategoryGroupChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value
      setModalCategoryMiddlePending('')
      if (!v) {
        setModalCategoryOrphanBucket(false)
        setModalCategoryGroupKey('')
        applyFormCategoryId('')
        return
      }
      if (v === CATEGORY_FILTER_ORPHAN_GROUP_KEY) {
        setModalCategoryOrphanBucket(true)
        setModalCategoryGroupKey('')
        applyFormCategoryId('')
        return
      }
      setModalCategoryOrphanBucket(false)
      setModalCategoryGroupKey(v)
      applyFormCategoryId('')
    },
    [applyFormCategoryId]
  )

  const onFormCategoryCategoryChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value
      const gk = formCategoryGroupSelectValue
      if (!gk) return
      if (!v) {
        setModalCategoryMiddlePending('')
        if (gk === CATEGORY_FILTER_ORPHAN_GROUP_KEY) {
          setModalCategoryOrphanBucket(false)
          setModalCategoryGroupKey('')
        } else if (gk) {
          setModalCategoryGroupKey(gk)
        }
        applyFormCategoryId('')
        return
      }
      const catId = parseInt(v, 10)
      const node = formCascadeMiddleOptions.find((n) => n.cat.id === catId)
      if (node && node.subs.length > 0) {
        setModalCategoryOrphanBucket(false)
        setModalCategoryMiddlePending(catId)
        if (gk && gk !== CATEGORY_FILTER_ORPHAN_GROUP_KEY) {
          setModalCategoryGroupKey(gk)
        }
        setForm((f) => {
          const newPath = getCategoryPath(categories, '')
          const newSku = buildProductCode(newPath, brandCode, isPackageType ? '' : (f.supplier_code ?? ''))
          return { ...f, category_id: '', sku: newSku || f.sku }
        })
        return
      }
      setModalCategoryOrphanBucket(false)
      setModalCategoryMiddlePending('')
      applyFormCategoryId(catId)
    },
    [applyFormCategoryId, formCategoryGroupSelectValue, formCascadeMiddleOptions, categories, brandCode, isPackageType]
  )

  const onFormCategorySubChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value
      const mid = formMiddleSelectString
      if (!mid) return
      if (v) {
        setModalCategoryOrphanBucket(false)
        setModalCategoryMiddlePending('')
        applyFormCategoryId(parseInt(v, 10))
        return
      }
      setModalCategoryOrphanBucket(false)
      setModalCategoryMiddlePending('')
      applyFormCategoryId(parseInt(mid, 10))
    },
    [applyFormCategoryId, formMiddleSelectString]
  )

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
      if (filterIntegration === 'parasut' || filterIntegration === 'ideasoft') {
        params.set('filter_integration', filterIntegration)
      }
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
  }, [
    page,
    limit,
    sortBy,
    sortOrder,
    debouncedSearch,
    debouncedFilterName,
    debouncedFilterSku,
    filterBrandId,
    filterCategoryId,
    filterGroupId,
    effectiveFilterTypeId,
    filterNoImage,
    filterIntegration,
  ])

  const lookupSupplierCodeRef = useRef<(() => Promise<void>) | null>(null)
  /** Ürün düzenleme modalı açılınca tetiklenen ilk otomatik tedarikçi fiyat aramasında toast gösterme */
  const suppressSupplierPriceLookupToastsRef = useRef(false)
  const lookupSupplierCode = useCallback(async () => {
    const allowSupplierLookupToasts = !suppressSupplierPriceLookupToastsRef.current
    const code = form.supplier_code?.trim()
    const brandId = form.brand_id
    if (!code || !brandId || skipSupplierCode) {
      setSupplierCodeMatch(null)
      suppressSupplierPriceLookupToastsRef.current = false
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
        if (allowSupplierLookupToasts) {
          toastSuccess('Fiyat çekildi (tedarikçi kaynağı)', `${priceStr} ${curLabel}`.trim() || 'Fiyat ve para birimi otomatik dolduruldu.')
        }
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
            if (allowSupplierLookupToasts) {
              toastSuccess('Fiyatlar kaydedildi', 'Genel fiyat ve hesaplanan fiyatlar tabloya kaydedildi.')
            }
          }
        }
      } else {
        setSupplierCodeMatch(false)
      }
    } catch (e) {
      setSupplierCodeMatch(null)
      if (allowSupplierLookupToasts) {
        toastError(
          'Tedarikçi fiyatı',
          e instanceof Error ? e.message : 'Kaynak dosyası veya ağ hatası; tedarikçi listesi okunamadı.'
        )
      }
    } finally {
      setSupplierCodeLookupLoading(false)
      suppressSupplierPriceLookupToastsRef.current = false
    }
  }, [form.supplier_code, form.brand_id, form.currency_id, form.prices, skipSupplierCode, currencies, computeEcommercePrice, calculationRules, priceTypes, editingId, fetchData])
  lookupSupplierCodeRef.current = lookupSupplierCode

  /** Tedarikçi kodu / marka değişince (ürün kodu modalı dahil) debounce ile fiyat ara; yalnızca blur’da değil. */
  const supplierLookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (supplierLookupDebounceRef.current) {
      clearTimeout(supplierLookupDebounceRef.current)
      supplierLookupDebounceRef.current = null
    }
    if (skipSupplierCode) return
    const code = form.supplier_code?.trim()
    const brandId = form.brand_id
    if (!code || !brandId) return

    supplierLookupDebounceRef.current = setTimeout(() => {
      supplierLookupDebounceRef.current = null
      void lookupSupplierCodeRef.current?.()
    }, 450)

    return () => {
      if (supplierLookupDebounceRef.current) {
        clearTimeout(supplierLookupDebounceRef.current)
        supplierLookupDebounceRef.current = null
      }
    }
  }, [form.supplier_code, form.brand_id, skipSupplierCode])

  /** Modal açıkken otomatik arama yapılmayacaksa bastırma bayrağını sıfırla (aksi halde ref true kalır) */
  useEffect(() => {
    if (!modalOpen) {
      suppressSupplierPriceLookupToastsRef.current = false
      return
    }
    if (skipSupplierCode || !String(form.supplier_code ?? '').trim() || !form.brand_id) {
      suppressSupplierPriceLookupToastsRef.current = false
    }
  }, [modalOpen, skipSupplierCode, form.supplier_code, form.brand_id])

  useEffect(() => {
    if (!modalOpen) {
      setModalCategoryOrphanBucket(false)
      setModalCategoryMiddlePending('')
      setModalCategoryGroupKey('')
    }
  }, [modalOpen])

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
    const applySidebarIcons = () => {
      const menus = getSidebarMenus()
      setParasutIconSrc(getParasutSidebarIconSrc(menus))
      setIdeasoftIconSrc(getIdeasoftSidebarIconSrc(menus))
    }
    applySidebarIcons()
    fetchSidebarMenus().then((menus) => {
      setParasutIconSrc(getParasutSidebarIconSrc(menus))
      setIdeasoftIconSrc(getIdeasoftSidebarIconSrc(menus))
    })
    window.addEventListener(SIDEBAR_MENUS_UPDATED_EVENT, applySidebarIcons)
    window.addEventListener('storage', applySidebarIcons)
    return () => {
      window.removeEventListener(SIDEBAR_MENUS_UPDATED_EVENT, applySidebarIcons)
      window.removeEventListener('storage', applySidebarIcons)
    }
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
    setModalCategoryOrphanBucket(false)
    setModalCategoryMiddlePending('')
    setModalCategoryGroupKey('')
    setEditingId(null)
    setModalTab('genel')
    const defCur = defaultCurrencyId ?? ''
    setCompetitorUrlsText('')
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
    setModalCategoryOrphanBucket(false)
    setModalCategoryMiddlePending('')
    setModalCategoryGroupKey('')
    setEditingId(item.id)
    setModalTab(tab)
    setSupplierCodeMatch(null)
    setCompetitorUrlsText('')
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
      suppressSupplierPriceLookupToastsRef.current = true
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
        ecommerce_enabled: (product?.ecommerce_enabled ?? item.ecommerce_enabled ?? 1) === 1,
        ecommerce_name: product?.ecommerce_name ?? '',
        main_description: product?.main_description ?? '',
        seo_slug: product?.seo_slug ?? '',
        seo_title: product?.seo_title ?? '',
        seo_description: product?.seo_description ?? '',
        seo_keywords: product?.seo_keywords ?? '',
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
    setModalCategoryOrphanBucket(false)
    setModalCategoryMiddlePending('')
    setModalCategoryGroupKey('')
    setModalOpen(false)
    setModalTab('genel')
    setEditingId(null)
    setForm(emptyForm)
    setPackageItems([])
    setSupplierCodeMatch(null)
    setCompetitorUrlsText('')
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

  async function handleGenerateSeo() {
    const name = form.name?.trim()
    if (!name) {
      toastError('Ürün adı gerekli', 'Önce ürün adını girin.')
      return
    }
    setAiSeoLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ai/generate-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brand_name: form.brand_id ? brands.find((b) => b.id === form.brand_id)?.name ?? '' : '',
          category_path: categoryPath.length > 0 ? formatCategoryPathDisplay(categoryPath) : '',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'İstek başarısız')
      setForm((f) => ({
        ...f,
        seo_slug: json.seo_slug ?? '',
        seo_title: json.seo_title ?? '',
        seo_description: json.seo_description ?? '',
        seo_keywords: json.seo_keywords ?? '',
      }))
      toastSuccess('SEO oluşturuldu', 'Bağlantı, meta ve anahtar kelimeler ürün adından üretildi.')
    } catch (err) {
      toastError('Oluşturulamadı', err instanceof Error ? err.message : 'SEO üretilemedi')
    } finally {
      setAiSeoLoading(false)
    }
  }

  async function handleGenerateEcommerce() {
    const name = form.name?.trim()
    if (!name) {
      toastError('Ürün adı gerekli', 'Önce ürün adını girin.')
      return
    }
    const competitor_urls = competitorUrlsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    setAiEcommerceLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ai/generate-ecommerce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brand_name: form.brand_id ? brands.find((b) => b.id === form.brand_id)?.name ?? '' : '',
          category_path: categoryPath.length > 0 ? formatCategoryPathDisplay(categoryPath) : '',
          sku: form.sku ?? '',
          ...(competitor_urls.length > 0 ? { competitor_urls } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'İstek başarısız')
      setForm((f) => ({
        ...f,
        ecommerce_name: json.ecommerce_name ?? '',
        main_description: json.main_description ?? '',
      }))
      toastSuccess('E-ticaret metinleri', 'Ad ve açıklama rakip / mağaza referanslarıyla üretildi.')
    } catch (err) {
      toastError('Oluşturulamadı', err instanceof Error ? err.message : 'Metinler üretilemedi')
    } finally {
      setAiEcommerceLoading(false)
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
            seo_keywords: form.seo_keywords ?? '',
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (!form.type_id) {
      setError('Ürün tipi seçilmeden kayıt yapılamaz.')
      return
    }
    if (!form.category_id) {
      setError('Kategori seçilmeden kayıt yapılamaz.')
      setModalTab('genel')
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
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size >= data.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(data.map((p) => p.id)))
    }
  }

  type BulkPatch = {
    category_id?: number | null
    type_id?: number | null
    product_item_group_id?: number | null
    brand_id?: number | null
    unit_id?: number | null
    tax_rate?: number | null
    quantity?: number | null
  }

  const bulkIdeasoftSelectionHasAnyImage = useMemo(
    () => data.some((p) => selectedIds.has(p.id) && hasProductImagePaths(p.image)),
    [data, selectedIds]
  )

  const openIdeasoftBulkTransferModal = useCallback(() => {
    if (selectedIds.size === 0) return
    setIdeasoftBulkSyncGeneral(false)
    setIdeasoftBulkSyncPrice(false)
    setIdeasoftBulkSyncImages(false)
    setIdeasoftBulkSyncSeo(false)
    setIdeasoftBulkTransferStock('20')
    setIdeasoftBulkTransferDiscountPct('55')
    setIdeasoftBulkTransferDiscountType(0)
    setIdeasoftBulkApplyTransferStock(true)
    setIdeasoftBulkApplyTransferDiscount(true)
    setIdeasoftBulkTransferModalOpen(true)
  }, [selectedIds.size])

  const selectAllIdeasoftSyncBulk = useCallback(() => {
    setIdeasoftBulkSyncGeneral(true)
    setIdeasoftBulkSyncPrice(true)
    setIdeasoftBulkSyncImages(true)
    setIdeasoftBulkSyncSeo(true)
    setIdeasoftBulkApplyTransferStock(true)
    setIdeasoftBulkApplyTransferDiscount(true)
  }, [])

  const submitBulkIdeasoftTransfer = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    let stockN: number | undefined
    if (ideasoftBulkApplyTransferStock) {
      stockN = parseFloat(String(ideasoftBulkTransferStock).replace(',', '.'))
      if (!Number.isFinite(stockN) || stockN < 0) {
        toastError('IdeaSoft toplu aktarım', 'Stok miktarı 0 veya üzeri geçerli bir sayı olmalıdır.')
        return
      }
    }
    let discN: number | undefined
    if (ideasoftBulkApplyTransferDiscount) {
      const rawDisc = String(ideasoftBulkTransferDiscountPct).trim()
      if (rawDisc !== '') {
        const n = parseFloat(rawDisc.replace(',', '.'))
        if (!Number.isFinite(n) || n <= 0) {
          toastError(
            'IdeaSoft toplu aktarım',
            'İndirim için 0’dan büyük geçerli bir sayı girin (boş: gönderilmez).'
          )
          return
        }
        if (ideasoftBulkTransferDiscountType === 0 && n > 100) {
          toastError('IdeaSoft toplu aktarım', 'Yüzde indirim en fazla 100 olabilir.')
          return
        }
        discN = n
      }
    }
    const hasSyncGroup =
      ideasoftBulkSyncGeneral ||
      ideasoftBulkSyncPrice ||
      ideasoftBulkSyncImages ||
      ideasoftBulkSyncSeo
    const willSendStock = ideasoftBulkApplyTransferStock
    const willSendDiscount = ideasoftBulkApplyTransferDiscount && discN !== undefined && discN > 0
    if (!hasSyncGroup && !willSendStock && !willSendDiscount) {
      toastError(
        'IdeaSoft toplu aktarım',
        'En az bir bilgi grubu seçin veya “Stok gönder” / geçerli indirim ile güncelleme yapın.',
      )
      return
    }
    const labelById = new Map<number, { name: string; sku?: string }>()
    for (const p of data) labelById.set(p.id, { name: p.name, sku: p.sku })
    setIdeasoftBulkLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/products/bulk-ideasoft-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          sync_general: ideasoftBulkSyncGeneral,
          sync_price: ideasoftBulkSyncPrice,
          sync_images: ideasoftBulkSyncImages,
          sync_seo: ideasoftBulkSyncSeo,
          ...(ideasoftBulkApplyTransferStock && stockN !== undefined ? { ideasoft_stock_amount: stockN } : {}),
          ...(ideasoftBulkApplyTransferDiscount && discN !== undefined && discN > 0
            ? {
                ideasoft_discount_percent: discN,
                ideasoft_discount_type: ideasoftBulkTransferDiscountType,
              }
            : {}),
        }),
      })
      const dataJson = await parseJsonResponse<{
        error?: string
        hint?: string
        succeeded?: number
        failed?: number
        results?: {
          product_id: number
          ok: boolean
          error?: string
          hint?: string
          message?: string
          ideasoft_product_id?: number
        }[]
      }>(res)
      if (!res.ok) {
        const h = dataJson.hint?.trim()
        throw new Error(h ? `${dataJson.error || 'İstek başarısız'}\n\n${h}` : dataJson.error || 'İstek başarısız')
      }
      const succ = dataJson.succeeded ?? 0
      const fail = dataJson.failed ?? 0
      const results = dataJson.results ?? []
      const rows = results.map((r) => {
        const lab = labelById.get(r.product_id)
        const nameLabel = lab?.name?.trim() || '—'
        const skuLabel = (lab?.sku ?? '').trim() || '—'
        let detail = ''
        if (r.ok) {
          detail =
            r.message?.trim() ||
            (r.ideasoft_product_id != null
              ? `IdeaSoft ürün #${r.ideasoft_product_id}`
              : 'Tamam')
        } else {
          detail = formatIdeasoftBulkErrorLine(r.error)
          const hi = r.hint?.trim()
          if (hi) detail = `${detail}\n${hi}`
        }
        return {
          product_id: r.product_id,
          nameLabel,
          skuLabel,
          ok: r.ok,
          ideasoft_product_id: r.ideasoft_product_id,
          detail,
        }
      })
      rows.sort((a, b) => Number(a.ok) - Number(b.ok))
      setIdeasoftBulkSummary({ succeeded: succ, failed: fail, rows })
      if (fail === 0) {
        toastSuccess('IdeaSoft toplu aktarım', `${succ} ürün aktarıldı. Özet pencerede listeleyebilirsiniz.`)
      } else if (succ > 0) {
        toastWarning('IdeaSoft toplu aktarım', `${succ} başarılı, ${fail} başarısız — ayrıntılar pencerede.`)
      } else {
        toastError('IdeaSoft toplu aktarım', 'Hiçbir ürün aktarılamadı — ayrıntılar pencerede.')
      }
      setIdeasoftBulkTransferModalOpen(false)
      setSelectedIds(new Set())
      fetchData()
    } catch (e) {
      toastError('IdeaSoft toplu aktarım', parasutFetchErrorMessage(e))
    } finally {
      setIdeasoftBulkLoading(false)
    }
  }, [
    selectedIds,
    fetchData,
    data,
    ideasoftBulkSyncGeneral,
    ideasoftBulkSyncPrice,
    ideasoftBulkSyncImages,
    ideasoftBulkSyncSeo,
    ideasoftBulkTransferStock,
    ideasoftBulkTransferDiscountPct,
    ideasoftBulkTransferDiscountType,
    ideasoftBulkApplyTransferStock,
    ideasoftBulkApplyTransferDiscount,
  ])

  const applyBulkPatch = async (patch: BulkPatch) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/products/bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ...patch }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Güncellenemedi')
      setBulkModal(null)
      setSelectedIds(new Set())
      fetchData()
      toastSuccess('Toplu güncelleme', `${json.updated ?? ids.length} ürün güncellendi.`)
    } catch (err) {
      toastError('Toplu güncelleme hatası', err instanceof Error ? err.message : 'Güncellenemedi')
    } finally {
      setBulkSaving(false)
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
            <div className="flex items-center gap-1 shrink-0 pr-1 border-r border-border/60 mr-1">
              <select
                aria-label="Liste: ürün grubu"
                title="Grup"
                className="h-9 min-w-[5rem] max-w-[7.5rem] cursor-pointer truncate rounded-md border border-input bg-background px-1.5 py-0.5 text-xs text-foreground shadow-sm"
                value={listFilterGroupSelectValue}
                onChange={onListCategoryGroupChange}
              >
                <option value="">Grup</option>
                {categoryFilterPanelModel.groups.map((g) => (
                  <option key={g.group.id} value={String(g.group.id)}>
                    {g.group.name}
                  </option>
                ))}
                {categoryFilterPanelModel.orphans.length > 0 ? (
                  <option value={CATEGORY_FILTER_ORPHAN_GROUP_KEY}>Grupsuz</option>
                ) : null}
              </select>
              <select
                aria-label="Liste: kategori"
                title="Kategori"
                className="h-9 min-w-[5rem] max-w-[7.5rem] cursor-pointer truncate rounded-md border border-input bg-background px-1.5 py-0.5 text-xs text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
                value={listFilterCascadeUi.categoryId}
                disabled={!listFilterGroupSelectValue}
                onChange={onListCategoryCategoryChange}
              >
                <option value="">Kategori</option>
                {listFilterMiddleOptions.map(({ cat }) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Liste: alt kategori"
                title="Alt kategori"
                className="h-9 min-w-[4.5rem] max-w-[7rem] cursor-pointer truncate rounded-md border border-input bg-background px-1.5 py-0.5 text-xs text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
                value={listFilterCascadeUi.subId}
                disabled={!listFilterCascadeUi.categoryId || listFilterSubOptions.length === 0}
                onChange={onListCategorySubChange}
              >
                <option value="">Alt</option>
                {listFilterSubOptions.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
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
                const elemKey = key || 'all'
                const commonProps = {
                  className: btnClass,
                  onClick: () => setListState({ filterTypeId: key, page: 1 }),
                  children: label,
                }
                return color ? (
                  isActive ? (
                    <DynamicBgFgButton
                      key={elemKey}
                      {...commonProps}
                      bg={color}
                      type="button"
                      role="radio"
                      aria-label={label}
                      aria-checked="true"
                    />
                  ) : (
                    <DynamicBgFgButton
                      key={elemKey}
                      {...commonProps}
                      bg={color}
                      type="button"
                      role="radio"
                      aria-label={label}
                      aria-checked="false"
                    />
                  )
                ) : isActive ? (
                  <button
                    key={elemKey}
                    {...commonProps}
                    type="button"
                    role="radio"
                    aria-label={label}
                    aria-checked="true"
                  />
                ) : (
                  <button
                    key={elemKey}
                    {...commonProps}
                    type="button"
                    role="radio"
                    aria-label={label}
                    aria-checked="false"
                  />
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
          {selectedIds.size > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-1.5">
                  <Layers className="h-4 w-4" />
                  Toplu İşlemler ({selectedIds.size})
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setBulkCategoryId(''); setBulkModal('category') }}>
                  Kategori değiştir
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setBulkTypeId(''); setBulkModal('type') }}>
                  Tip değiştir
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setBulkItemGroupId(''); setBulkModal('itemGroup') }}>
                  Ürün grubu değiştir
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setBulkBrandId(''); setBulkModal('brand') }}>
                  Marka değiştir
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setBulkUnitId(''); setBulkModal('unit') }}>
                  Birim değiştir
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setBulkTaxRate('20'); setBulkModal('tax') }}>
                  KDV değiştir
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setBulkQuantity('0'); setBulkModal('quantity') }}>
                  Miktar değiştir
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={ideasoftBulkLoading}
                  onClick={() => openIdeasoftBulkTransferModal()}
                >
                  IdeaSoft’a aktar (toplu)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled title="Satır seçerek toplu işlem yapabilirsiniz">
                  <Layers className="h-4 w-4" />
                  Toplu İşlemler
                </Button>
              </TooltipTrigger>
              <TooltipContent>Satır seçerek toplu işlem yapabilirsiniz</TooltipContent>
            </Tooltip>
          )}
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
                  <th className="text-center p-2 font-medium w-10">
                    <input
                      type="checkbox"
                      checked={data.length > 0 && selectedIds.size >= data.length}
                      ref={(el) => { if (el) el.indeterminate = data.length > 0 && selectedIds.size > 0 && selectedIds.size < data.length }}
                      onChange={toggleSelectAll}
                      className="rounded border-input"
                      aria-label="Tümünü seç"
                    />
                  </th>
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
                  <th className="text-center p-2 font-medium w-[108px] min-w-[108px]">
                    <div className="flex flex-col items-center gap-1">
                      <div className="inline-flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-center">
                              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Eşleştirme (tedarikçi / Paraşüt / IdeaSoft)</TooltipContent>
                        </Tooltip>
                        <span className="text-xs font-medium leading-none">Eşleştirme</span>
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              'rounded p-0.5 hover:bg-muted',
                              filterIntegration ? 'text-primary' : 'text-muted-foreground'
                            )}
                            aria-label="Eşleştirme filtresi"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="center" className="w-52 p-0">
                          <div className="py-1">
                            <button
                              type="button"
                              onClick={() => setListState({ filterIntegration: '', page: 1 })}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm hover:bg-muted',
                                filterIntegration === '' && 'bg-accent'
                              )}
                            >
                              Tümü
                            </button>
                            <button
                              type="button"
                              onClick={() => setListState({ filterIntegration: 'parasut', page: 1 })}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm hover:bg-muted',
                                filterIntegration === 'parasut' && 'bg-accent'
                              )}
                            >
                              Paraşüt
                            </button>
                            <button
                              type="button"
                              onClick={() => setListState({ filterIntegration: 'ideasoft', page: 1 })}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm hover:bg-muted',
                                filterIntegration === 'ideasoft' && 'bg-accent'
                              )}
                            >
                              IdeaSoft
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </th>
                  <th className="p-2 font-medium w-[1%] max-w-[9rem] align-top">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => handleSort('category_name')}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {sortBy === 'category_name' ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                        Kategori
                      </button>
                    </div>
                  </th>
                  <th className="text-center p-2 font-medium min-w-[80px]">Birim</th>
                  <th className="text-center p-2 font-medium w-20">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>E-Ticaret</span>
                      </TooltipTrigger>
                      <TooltipContent>Açık/Kapalı — dışa aktarım ve entegrasyonlarda dahil edilecekler</TooltipContent>
                    </Tooltip>
                  </th>
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
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      {error || 'Henüz ürün kaydı yok. Yeni ürün eklemek için + butonunu kullanın.'}
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        'border-b hover:bg-muted/30 cursor-pointer',
                        selectedIds.has(item.id) && 'bg-primary/5'
                      )}
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-input"
                          aria-label={`${item.name || 'Ürün'} seç`}
                        />
                      </td>
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
                          const hasDbParasut = Boolean(item.parasut_product_id?.trim())
                          const hasLiveParasut =
                            Boolean(item.sku?.trim()) && matchedParasutSkus.has(normalizeSku(item.sku))
                          const showParasut = hasDbParasut || hasLiveParasut
                          const hasIdeasoft =
                            item.ideasoft_product_id != null &&
                            Number(item.ideasoft_product_id) > 0
                          if (!isSupplierMatched && !showParasut && !hasIdeasoft) {
                            return <span className="text-muted-foreground">—</span>
                          }
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
                              {showParasut && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center shrink-0">
                                      {parasutIconSrc ? (
                                        <img
                                          src={parasutIconSrc}
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
                                  <TooltipContent>
                                    {hasDbParasut
                                      ? `Paraşüt bağlı (ürün #${item.parasut_product_id})`
                                      : 'Paraşüt ile SKU eşleşmesi'}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {hasIdeasoft && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center shrink-0">
                                      {ideasoftIconSrc ? (
                                        <img
                                          src={ideasoftIconSrc}
                                          alt="IdeaSoft"
                                          className="h-8 w-8 object-contain rounded-md"
                                        />
                                      ) : (
                                        <IdeasoftMark className="h-8 w-8 shrink-0" />
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>IdeaSoft ürün #{item.ideasoft_product_id}</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="p-2 align-top w-[1%] max-w-[9rem]">
                        {(() => {
                          const pathFromHierarchy = getCategoryPath(categories, item.category_id ?? '')
                          const split =
                            pathFromHierarchy.length > 0
                              ? splitCategoryPathForListColumn(pathFromHierarchy)
                              : null

                          const fallbackTooltip = (() => {
                            const seg = (name?: string, code?: string) => {
                              const n = (name ?? '').trim()
                              const co = (code ?? '').trim()
                              if (n && co) return `${n} [${co}]`
                              return n || co || ''
                            }
                            return [
                              seg(item.group_name, item.group_code),
                              seg(item.category_name, item.category_code),
                              seg(item.subcategory_name, item.subcategory_code),
                            ]
                              .filter((s) => s.length > 0)
                              .join(' › ')
                          })()

                          if (split) {
                            const { groupCode, categoryCode, subLabel, tooltip } = split
                            if (!groupCode && !categoryCode && !subLabel) {
                              return <span className="text-muted-foreground">—</span>
                            }
                            const subLabelColor =
                              subLabel &&
                              (normalizeCategoryColor(item.subcategory_color) ??
                                (!groupCode && !categoryCode
                                  ? normalizeCategoryColor(item.category_color) ?? normalizeCategoryColor(item.group_color)
                                  : null))
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex flex-col items-stretch gap-1 text-left min-w-0 max-w-full">
                                    <div className="flex flex-wrap items-center gap-1 min-w-0">
                                      {groupCode ? (
                                        <CategoryListCodeBadge code={groupCode} color={item.group_color} />
                                      ) : null}
                                      {categoryCode ? (
                                        <CategoryListCodeBadge code={categoryCode} color={item.category_color} />
                                      ) : null}
                                    </div>
                                    {subLabel ? (
                                      <span
                                        className="text-xs text-foreground break-words min-w-0 leading-snug line-clamp-3"
                                        style={subLabelColor ? { color: subLabelColor } : undefined}
                                      >
                                        {subLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-md">
                                  <p className="whitespace-normal break-words text-sm">{tooltip}</p>
                                </TooltipContent>
                              </Tooltip>
                            )
                          }

                          const gc = (item.group_code ?? '').trim()
                          const cc = (item.category_code ?? '').trim()
                          const subn = (item.subcategory_name ?? '').trim()
                          if (!gc && !cc && !subn) {
                            return <span className="text-muted-foreground">—</span>
                          }
                          const fbSubColor =
                            subn &&
                            (normalizeCategoryColor(item.subcategory_color) ??
                              (!gc && !cc
                                ? normalizeCategoryColor(item.category_color) ?? normalizeCategoryColor(item.group_color)
                                : null))
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col items-stretch gap-1 min-w-0 max-w-full">
                                  <div className="flex flex-wrap items-center gap-1 min-w-0">
                                    {gc ? <CategoryListCodeBadge code={gc} color={item.group_color} /> : null}
                                    {cc ? <CategoryListCodeBadge code={cc} color={item.category_color} /> : null}
                                  </div>
                                  {subn ? (
                                    <span
                                      className="text-xs break-words min-w-0 leading-snug line-clamp-3"
                                      style={fbSubColor ? { color: fbSubColor } : undefined}
                                    >
                                      {subn}
                                    </span>
                                  ) : null}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <p className="whitespace-normal break-words text-sm">{fallbackTooltip || '—'}</p>
                              </TooltipContent>
                            </Tooltip>
                          )
                        })()}
                      </td>
                      <td className="p-3 text-center text-muted-foreground">
                        {item.unit_name ?? '—'}
                      </td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={(item.ecommerce_enabled ?? 1) === 1}
                          onCheckedChange={(checked) => handleEcommerceToggle(item.id, !!checked)}
                        />
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
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      supplierCodeEditable={!skipSupplierCode}
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
                          onBlur={() => {
                            if (supplierLookupDebounceRef.current) {
                              clearTimeout(supplierLookupDebounceRef.current)
                              supplierLookupDebounceRef.current = null
                            }
                            setTimeout(() => void lookupSupplierCodeRef.current?.(), 0)
                          }}
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
                <div className="w-full min-w-0 space-y-2 pt-4 mt-2 border-t border-border/60">
                  <Label className="text-base">Kategori *</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 min-w-0">
                      <Label htmlFor="product-category-group" className="text-xs text-muted-foreground">
                        Grup
                      </Label>
                      <select
                        id="product-category-group"
                        aria-label="Ürün grubu"
                        value={formCategoryGroupSelectValue}
                        onChange={onFormCategoryGroupChange}
                        className="flex h-10 w-full min-w-0 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm truncate"
                      >
                        <option value="">Grup seçin</option>
                        {categoryFilterPanelModel.groups.map((g) => (
                          <option key={g.group.id} value={String(g.group.id)}>
                            {g.group.name}
                          </option>
                        ))}
                        {categoryFilterPanelModel.orphans.length > 0 ? (
                          <option value={CATEGORY_FILTER_ORPHAN_GROUP_KEY}>Grupsuz</option>
                        ) : null}
                      </select>
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <Label htmlFor="product-category-mid" className="text-xs text-muted-foreground">
                        Kategori
                      </Label>
                      <select
                        id="product-category-mid"
                        aria-label="Kategori"
                        value={formMiddleSelectString}
                        disabled={!formCategoryGroupSelectValue}
                        onChange={onFormCategoryCategoryChange}
                        className="flex h-10 w-full min-w-0 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm truncate disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <option value="">Kategori seçin</option>
                        {formCascadeMiddleOptions.map(({ cat }) => (
                          <option key={cat.id} value={String(cat.id)}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <Label htmlFor="product-category-sub" className="text-xs text-muted-foreground">
                        Alt kategori
                      </Label>
                      <select
                        id="product-category-sub"
                        aria-label="Alt kategori"
                        value={formCategoryCascadeUi.subId}
                        disabled={!formMiddleSelectString || formCascadeSubOptions.length === 0}
                        onChange={onFormCategorySubChange}
                        className="flex h-10 w-full min-w-0 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm truncate disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <option value="">Alt kategori</option>
                        {formCascadeSubOptions.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="fiyat" className="space-y-4 mt-4 min-h-[55vh]">
                <div className="space-y-2 w-full pb-2 border-b border-border/60">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleGenerateSeo()}
                      disabled={aiSeoLoading || !form.name?.trim()}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {aiSeoLoading ? 'SEO…' : 'SEO metinleri (ürün adı)'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleGenerateEcommerce()}
                      disabled={aiEcommerceLoading || !form.name?.trim()}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {aiEcommerceLoading ? 'Üretiliyor…' : 'E-ticaret adı ve açıklama (rakip analizi)'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    SEO alanları yalnızca ürün adından üretilir. E-ticaret adı ve açıklama için aynı SKU ile mağaza ürün sayfası ve isteğe bağlı rakip URL’ler analiz edilir.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="competitor_urls">Rakip ürün sayfa adresleri (isteğe bağlı)</Label>
                    <textarea
                      id="competitor_urls"
                      value={competitorUrlsText}
                      onChange={(e) => setCompetitorUrlsText(e.target.value)}
                      placeholder="Satır başına bir URL (ör. benzer ürünün Trendyol veya rakip mağaza sayfası)"
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
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
                  <div className="space-y-2 pt-2 border-t">
                    <Label htmlFor="seo_slug">SEO bağlantısı (URL parçası)</Label>
                    <Input
                      id="seo_slug"
                      value={form.seo_slug ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, seo_slug: e.target.value }))}
                      placeholder="urun-adi-seo-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seo_title">Meta başlığı</Label>
                    <Input
                      id="seo_title"
                      value={form.seo_title ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                      placeholder="Sayfa başlığı (SEO)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seo_description">Meta açıklaması</Label>
                    <textarea
                      id="seo_description"
                      value={form.seo_description ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))}
                      placeholder="Meta description (SEO)"
                      rows={2}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seo_keywords">SEO anahtar kelimeleri</Label>
                    <Input
                      id="seo_keywords"
                      value={form.seo_keywords ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, seo_keywords: e.target.value }))}
                      placeholder="örnek: kırmızı kalem, ofis kırtasiye, …"
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
                    <div className="flex min-h-10 items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm break-words">
                      {categoryPath.length > 0 ? formatCategoryPathDisplay(categoryPath) : '—'}
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
                {editingId && (
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => void runParasutTransfer()}
                            disabled={saving || parasutTransferLoading || parasutPreviewLoading}
                            aria-label="Paraşüte aktar"
                          >
                            {parasutIconSrc ? (
                              <img
                                src={parasutIconSrc}
                                alt=""
                                className="h-4 w-4 object-contain"
                              />
                            ) : (
                              <span className="text-xs font-semibold text-muted-foreground" aria-hidden>
                                P
                              </span>
                            )}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Paraşüte aktar</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => openIdeasoftTransferModal()}
                            disabled={saving || ideasoftTransferLoading}
                            aria-label="IdeaSoft'a aktar"
                          >
                            <Store className="h-4 w-4" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        IdeaSoft’a aktar — Hangi bilgilerin gönderileceğini seçersiniz. Kayıtlı eşleştirmelerle marka/kategori/kur atanır;
                        aynı SKU’lu IdeaSoft ürünü varsa seçtikleriniz güncellenir, yoksa yeni ürün tam içerikle oluşturulur. Önce Kaydet.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
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

      <Dialog
        open={ideasoftBulkSummary != null}
        onOpenChange={(o) => {
          if (!o) setIdeasoftBulkSummary(null)
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>IdeaSoft toplu aktarım özeti</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 text-sm">
                {ideasoftBulkSummary && (
                  <>
                    <p>
                      <span className="text-foreground font-medium">{ideasoftBulkSummary.rows.length}</span> ürün işlendi:{' '}
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {ideasoftBulkSummary.succeeded} aktarıldı
                      </span>
                      {ideasoftBulkSummary.failed > 0 && (
                        <>
                          {', '}
                          <span className="text-destructive font-medium">{ideasoftBulkSummary.failed} başarısız</span>
                        </>
                      )}
                      .
                    </p>
                    <p className="text-muted-foreground">
                      Liste mevcut sayfadaki ad/SKU ile eşleştirilebildi; başka sayfadan seçilen satırlarda ad/SKU &quot;—&quot; olabilir.
                    </p>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-2 flex-1 min-h-0 overflow-y-auto border-t border-border">
            {ideasoftBulkSummary && ideasoftBulkSummary.rows.length > 0 && (
              <table className="w-full text-sm mt-3">
                <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur">
                  <tr className="border-b text-left">
                    <th className="p-2 font-medium w-28">Durum</th>
                    <th className="p-2 font-medium w-16">Master #</th>
                    <th className="p-2 font-medium min-w-[120px]">Ürün adı</th>
                    <th className="p-2 font-medium w-28">SKU</th>
                    <th className="p-2 font-medium w-24">IdeaSoft #</th>
                    <th className="p-2 font-medium min-w-[180px]">Açıklama</th>
                  </tr>
                </thead>
                <tbody>
                  {ideasoftBulkSummary.rows.map((row) => (
                    <tr
                      key={row.product_id}
                      className={cn(
                        'border-b border-border/60 align-top',
                        row.ok ? 'bg-emerald-500/[0.04]' : 'bg-destructive/[0.04]'
                      )}
                    >
                      <td className="p-2">
                        {row.ok ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span className="text-xs font-medium">Tamam</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span className="text-xs font-medium">Hata</span>
                          </span>
                        )}
                      </td>
                      <td className="p-2 tabular-nums font-mono text-xs">{row.product_id}</td>
                      <td className="p-2 max-w-[200px] break-words">{row.nameLabel}</td>
                      <td className="p-2 font-mono text-xs break-all">{row.skuLabel}</td>
                      <td className="p-2 tabular-nums font-mono text-xs">
                        {row.ok && row.ideasoft_product_id != null ? row.ideasoft_product_id : '—'}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground whitespace-pre-wrap break-words max-w-md">
                        {row.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button type="button" onClick={() => setIdeasoftBulkSummary(null)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkModal === 'category'} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Kategori Değiştir</DialogTitle>
            <DialogDescription>
              {selectedIds.size} ürünün kategori bilgisini değiştireceksiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="bulk-category-select">Yeni kategori</Label>
            <CategorySelect
              id="bulk-category-select"
              variant="badge"
              className="w-full"
              categories={categories}
              value={bulkCategoryId}
              placeholder="Kategori seçin…"
              onChange={setBulkCategoryId}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkModal(null)}>İptal</Button>
            <Button
              disabled={!bulkCategoryId || bulkSaving}
              onClick={() => void applyBulkPatch({ category_id: bulkCategoryId || null })}
            >
              {bulkSaving ? 'Kaydediliyor...' : 'Uygula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkModal === 'type'} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Tip Değiştir</DialogTitle>
            <DialogDescription>
              {selectedIds.size} ürünün tip bilgisini değiştireceksiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-type-select">Yeni tip</Label>
            <select
              id="bulk-type-select"
              aria-label="Yeni tip"
              value={bulkTypeId}
              onChange={(e) => setBulkTypeId(e.target.value ? Number(e.target.value) : '')}
              className="flex h-10 w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seçin</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkModal(null)}>İptal</Button>
            <Button
              disabled={!bulkTypeId || bulkSaving}
              onClick={() => void applyBulkPatch({ type_id: bulkTypeId || null })}
            >
              {bulkSaving ? 'Kaydediliyor...' : 'Uygula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkModal === 'itemGroup'} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Ürün Grubu Değiştir</DialogTitle>
            <DialogDescription>
              {selectedIds.size} ürünün ürün grubunu değiştireceksiniz (Ticari Mal, Hammadde, Mamül vb.).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-item-group-select">Yeni ürün grubu</Label>
            <select
              id="bulk-item-group-select"
              aria-label="Yeni ürün grubu"
              value={bulkItemGroupId}
              onChange={(e) => setBulkItemGroupId(e.target.value ? Number(e.target.value) : '')}
              className="flex h-10 w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seçin</option>
              {itemGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkModal(null)}>İptal</Button>
            <Button
              disabled={!bulkItemGroupId || bulkSaving}
              onClick={() => void applyBulkPatch({ product_item_group_id: bulkItemGroupId || null })}
            >
              {bulkSaving ? 'Kaydediliyor...' : 'Uygula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkModal === 'brand'} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Marka Değiştir</DialogTitle>
            <DialogDescription>
              {selectedIds.size} ürünün markasını değiştireceksiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-brand-select">Yeni marka</Label>
            <select
              id="bulk-brand-select"
              aria-label="Yeni marka"
              value={bulkBrandId}
              onChange={(e) => setBulkBrandId(e.target.value ? Number(e.target.value) : '')}
              className="flex h-10 w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seçin</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code ? `${b.name} (${b.code})` : b.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkModal(null)}>İptal</Button>
            <Button
              disabled={!bulkBrandId || bulkSaving}
              onClick={() => void applyBulkPatch({ brand_id: bulkBrandId || null })}
            >
              {bulkSaving ? 'Kaydediliyor...' : 'Uygula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkModal === 'unit'} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Birim Değiştir</DialogTitle>
            <DialogDescription>
              {selectedIds.size} ürünün stok birimini değiştireceksiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-unit-select">Yeni birim</Label>
            <select
              id="bulk-unit-select"
              aria-label="Yeni birim"
              value={bulkUnitId}
              onChange={(e) => setBulkUnitId(e.target.value ? Number(e.target.value) : '')}
              className="flex h-10 w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seçin</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkModal(null)}>İptal</Button>
            <Button
              disabled={!bulkUnitId || bulkSaving}
              onClick={() => void applyBulkPatch({ unit_id: bulkUnitId || null })}
            >
              {bulkSaving ? 'Kaydediliyor...' : 'Uygula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkModal === 'tax'} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu KDV Değiştir</DialogTitle>
            <DialogDescription>
              {selectedIds.size} ürünün KDV oranını (%) güncelleyeceksiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-tax-input">KDV (%)</Label>
            <Input
              id="bulk-tax-input"
              type="number"
              step="0.01"
              min={0}
              className="mt-2"
              value={bulkTaxRate}
              onChange={(e) => setBulkTaxRate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkModal(null)}>İptal</Button>
            <Button
              disabled={bulkSaving}
              onClick={() => {
                const n = parseFloat(String(bulkTaxRate).replace(',', '.'))
                if (!Number.isFinite(n) || n < 0) {
                  toastError('Geçersiz değer', 'KDV için 0 veya üzeri geçerli bir sayı girin.')
                  return
                }
                void applyBulkPatch({ tax_rate: n })
              }}
            >
              {bulkSaving ? 'Kaydediliyor...' : 'Uygula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkModal === 'quantity'} onOpenChange={(o) => !o && setBulkModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Miktar Değiştir</DialogTitle>
            <DialogDescription>
              {selectedIds.size} ürünün stok miktarını aynı değere çekeceksiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-qty-input">Miktar</Label>
            <Input
              id="bulk-qty-input"
              type="number"
              step="any"
              className="mt-2"
              value={bulkQuantity}
              onChange={(e) => setBulkQuantity(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkModal(null)}>İptal</Button>
            <Button
              disabled={bulkSaving}
              onClick={() => {
                const n = parseFloat(String(bulkQuantity).replace(',', '.'))
                if (!Number.isFinite(n)) {
                  toastError('Geçersiz değer', 'Geçerli bir miktar girin.')
                  return
                }
                void applyBulkPatch({ quantity: n })
              }}
            >
              {bulkSaving ? 'Kaydediliyor...' : 'Uygula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={parasutTransferModalOpen}
        onOpenChange={(o) => {
          if (!o) {
            setParasutTransferModalOpen(false)
            setParasutPending(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Paraşüt&apos;e aktarım</DialogTitle>
            <DialogDescription>
              Bu SKU ile Paraşüt&apos;te kayıtlı ürün bulundu. Hangi bilgilerin master üründen güncelleneceğini seçin.
            </DialogDescription>
          </DialogHeader>
          {parasutPending && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">SKU: </span>
                  <span className="font-mono">{parasutPending.sku_used}</span>
                </div>
                {parasutPending.parasut_product && (
                  <div>
                    <span className="text-muted-foreground">Paraşüt ürünü: </span>
                    <span>
                      {parasutPending.parasut_product.name || parasutPending.parasut_product.code || '—'}
                    </span>
                  </div>
                )}
              </div>
              {parasutPending.has_photo && (
                <p className="text-xs text-muted-foreground">
                  Görsel seçildiğinde ilk ürün görseli Paraşüt&apos;e gönderilir.
                </p>
              )}
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={parasutSyncProductInfo}
                    onCheckedChange={(v) => setParasutSyncProductInfo(!!v)}
                    id="parasut-sync-product"
                  />
                  <span className="text-sm leading-tight">
                    <span className="font-medium block">Ürün bilgileri</span>
                    <span className="text-muted-foreground">Kod, ad, barkod, birim, KDV, stok, tedarikçi kodu, GTIP</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={parasutSyncPhoto}
                    onCheckedChange={(v) => setParasutSyncPhoto(!!v)}
                    id="parasut-sync-photo"
                    disabled={!parasutPending.has_photo}
                  />
                  <span className="text-sm leading-tight">
                    <span className="font-medium block">Görsel</span>
                    <span className="text-muted-foreground">
                      {parasutPending.has_photo ? 'İlk görsel' : 'Bu üründe görsel yok'}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={parasutSyncPrice}
                    onCheckedChange={(v) => setParasutSyncPrice(!!v)}
                    id="parasut-sync-price"
                  />
                  <span className="text-sm leading-tight">
                    <span className="font-medium block">Fiyat</span>
                    <span className="text-muted-foreground">Satış fiyatı ve para birimi</span>
                  </span>
                </label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setParasutTransferModalOpen(false)
                setParasutPending(null)
              }}
              disabled={parasutTransferLoading}
            >
              İptal
            </Button>
            <Button
              type="button"
              variant="save"
              onClick={() => void confirmParasutTransferModal()}
              disabled={
                parasutTransferLoading ||
                !parasutPending ||
                (!parasutSyncProductInfo && !parasutSyncPhoto && !parasutSyncPrice)
              }
            >
              {parasutTransferLoading ? 'Aktarılıyor…' : 'Aktar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ideasoftTransferModalOpen}
        onOpenChange={(o) => {
          if (!o) setIdeasoftTransferModalOpen(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>IdeaSoft’a aktarım</DialogTitle>
            <DialogDescription>
              Mevcut IdeaSoft ürününde yalnızca işaretlediğiniz bölümler master kayıttan güncellenir. Yeni ürün oluşturulacaksa tüm alanlar
              gönderilir (seçimler yalnızca güncellemede uygulanır). Stok ve indirim yalnızca yanındaki kutucuk işaretliyken IdeaSoft’a
              yazılır; indirim alanı boş veya 0 ise indirim güncellenmez. İndirim tipi (yüzde / sabit tutar) IdeaSoft’taki{' '}
              <span className="whitespace-nowrap">discountType</span> ile birlikte gönderilir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="ideasoft-sync-general"
                checked={ideasoftSyncGeneral}
                onCheckedChange={(v) => setIdeasoftSyncGeneral(!!v)}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium block">Genel bilgiler</span>
                <span className="text-muted-foreground">
                  Ad, SKU, barkod, durum, birim etiketi, açıklama (detay), marka, kategori, para birimi (stok aşağıdaki kutucuktan)
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="ideasoft-sync-price"
                checked={ideasoftSyncPrice}
                onCheckedChange={(v) => setIdeasoftSyncPrice(!!v)}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium block">Fiyat</span>
                <span className="text-muted-foreground">Liste fiyatı (price1)</span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="ideasoft-sync-images"
                checked={ideasoftSyncImages}
                onCheckedChange={(v) => setIdeasoftSyncImages(!!v)}
                disabled={!hasFormProductImages(form.images)}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium block">Görseller</span>
                <span className="text-muted-foreground">
                  {hasFormProductImages(form.images)
                    ? 'En fazla 8 görsel (sıra ile)'
                    : 'Bu üründe kayıtlı görsel yok'}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="ideasoft-sync-seo"
                checked={ideasoftSyncSeo}
                onCheckedChange={(v) => setIdeasoftSyncSeo(!!v)}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium block">SEO bilgileri</span>
                <span className="text-muted-foreground">Slug, sayfa başlığı, meta açıklama, anahtar kelimeler, arama anahtarı</span>
              </span>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
            <div className="flex gap-3 items-start">
              <Checkbox
                id="ideasoft-apply-stock"
                className="mt-2 shrink-0"
                checked={ideasoftApplyTransferStock}
                onCheckedChange={(v) => setIdeasoftApplyTransferStock(!!v)}
                disabled={ideasoftTransferLoading}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="ideasoft-transfer-stock">IdeaSoft stok miktarı</Label>
                <Input
                  id="ideasoft-transfer-stock"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={ideasoftTransferStock}
                  onChange={(e) => setIdeasoftTransferStock(e.target.value)}
                  disabled={ideasoftTransferLoading || !ideasoftApplyTransferStock}
                />
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <Checkbox
                id="ideasoft-apply-discount"
                className="mt-2 shrink-0"
                checked={ideasoftApplyTransferDiscount}
                onCheckedChange={(v) => setIdeasoftApplyTransferDiscount(!!v)}
                disabled={ideasoftTransferLoading}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="ideasoft-transfer-discount-type">İndirim tipi</Label>
                <select
                  id="ideasoft-transfer-discount-type"
                  aria-label="IdeaSoft indirim tipi"
                  value={ideasoftTransferDiscountType}
                  onChange={(e) => setIdeasoftTransferDiscountType(e.target.value === '1' ? 1 : 0)}
                  disabled={ideasoftTransferLoading || !ideasoftApplyTransferDiscount}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={0}>Yüzde (%)</option>
                  <option value={1}>Sabit tutar</option>
                </select>
                <Label htmlFor="ideasoft-transfer-discount">
                  {ideasoftTransferDiscountType === 0 ? 'İndirim yüzdesi' : 'İndirim tutarı'}
                </Label>
                <Input
                  id="ideasoft-transfer-discount"
                  type="number"
                  min={0}
                  max={ideasoftTransferDiscountType === 0 ? 100 : undefined}
                  step={0.01}
                  inputMode="decimal"
                  value={ideasoftTransferDiscountPct}
                  onChange={(e) => setIdeasoftTransferDiscountPct(e.target.value)}
                  disabled={ideasoftTransferLoading || !ideasoftApplyTransferDiscount}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 pt-3 mt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => selectAllIdeasoftSyncSingle()}
              disabled={ideasoftTransferLoading}
            >
              Hepsini seç
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIdeasoftTransferModalOpen(false)}
              disabled={ideasoftTransferLoading}
            >
              İptal
            </Button>
            <Button
              type="button"
              variant="save"
              onClick={() => void confirmIdeasoftTransfer()}
              disabled={ideasoftTransferLoading || !ideasoftSingleCanSubmit}
            >
              {ideasoftTransferLoading ? 'Aktarılıyor…' : 'Aktar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ideasoftBulkTransferModalOpen}
        onOpenChange={(o) => {
          if (!o) setIdeasoftBulkTransferModalOpen(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>IdeaSoft toplu aktarım</DialogTitle>
            <DialogDescription>
              <span className="block">
                Seçili{' '}
                <span className="font-medium text-foreground">{selectedIds.size}</span> ürün sırayla işlenir. SKU eşleşmesi veya
                kayıtlı eşleştirme varsa yalnızca işaretlediğiniz bölümler güncellenir; IdeaSoft’ta kayıt yoksa ürün tam içerikle
                oluşturulur. SKU boş olanlar hata verir. Stok ve indirim yalnızca yanındaki kutucuk işaretliyken tüm aktarımlara
                aynı değerlerle yazılır; indirim boş veya 0 ise indirim güncellenmez. İndirim tipi (yüzde / sabit tutar) tüm
                satırlarda aynı şekilde gönderilir.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="ideasoft-bulk-sync-general"
                checked={ideasoftBulkSyncGeneral}
                onCheckedChange={(v) => setIdeasoftBulkSyncGeneral(!!v)}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium block">Genel bilgiler</span>
                <span className="text-muted-foreground">
                  Ad, SKU, barkod, durum, birim etiketi, açıklama (detay), marka, kategori, para birimi (stok aşağıdaki kutucuktan)
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="ideasoft-bulk-sync-price"
                checked={ideasoftBulkSyncPrice}
                onCheckedChange={(v) => setIdeasoftBulkSyncPrice(!!v)}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium block">Fiyat</span>
                <span className="text-muted-foreground">Liste fiyatı (price1)</span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="ideasoft-bulk-sync-images"
                checked={ideasoftBulkSyncImages}
                onCheckedChange={(v) => setIdeasoftBulkSyncImages(!!v)}
                disabled={!bulkIdeasoftSelectionHasAnyImage}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium block">Görseller</span>
                <span className="text-muted-foreground">
                  {bulkIdeasoftSelectionHasAnyImage
                    ? 'Seçili ürünlerde kayıtlı görseller (ürün başına en fazla 8)'
                    : 'Seçili ürünlerde görsel yok'}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="ideasoft-bulk-sync-seo"
                checked={ideasoftBulkSyncSeo}
                onCheckedChange={(v) => setIdeasoftBulkSyncSeo(!!v)}
              />
              <span className="text-sm leading-tight">
                <span className="font-medium block">SEO bilgileri</span>
                <span className="text-muted-foreground">Slug, sayfa başlığı, meta açıklama, anahtar kelimeler, arama anahtarı</span>
              </span>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
            <div className="flex gap-3 items-start">
              <Checkbox
                id="ideasoft-bulk-apply-stock"
                className="mt-2 shrink-0"
                checked={ideasoftBulkApplyTransferStock}
                onCheckedChange={(v) => setIdeasoftBulkApplyTransferStock(!!v)}
                disabled={ideasoftBulkLoading}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="ideasoft-bulk-transfer-stock">IdeaSoft stok miktarı</Label>
                <Input
                  id="ideasoft-bulk-transfer-stock"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={ideasoftBulkTransferStock}
                  onChange={(e) => setIdeasoftBulkTransferStock(e.target.value)}
                  disabled={ideasoftBulkLoading || !ideasoftBulkApplyTransferStock}
                />
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <Checkbox
                id="ideasoft-bulk-apply-discount"
                className="mt-2 shrink-0"
                checked={ideasoftBulkApplyTransferDiscount}
                onCheckedChange={(v) => setIdeasoftBulkApplyTransferDiscount(!!v)}
                disabled={ideasoftBulkLoading}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="ideasoft-bulk-transfer-discount-type">İndirim tipi</Label>
                <select
                  id="ideasoft-bulk-transfer-discount-type"
                  aria-label="IdeaSoft toplu indirim tipi"
                  value={ideasoftBulkTransferDiscountType}
                  onChange={(e) => setIdeasoftBulkTransferDiscountType(e.target.value === '1' ? 1 : 0)}
                  disabled={ideasoftBulkLoading || !ideasoftBulkApplyTransferDiscount}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={0}>Yüzde (%)</option>
                  <option value={1}>Sabit tutar</option>
                </select>
                <Label htmlFor="ideasoft-bulk-transfer-discount">
                  {ideasoftBulkTransferDiscountType === 0 ? 'İndirim yüzdesi' : 'İndirim tutarı'}
                </Label>
                <Input
                  id="ideasoft-bulk-transfer-discount"
                  type="number"
                  min={0}
                  max={ideasoftBulkTransferDiscountType === 0 ? 100 : undefined}
                  step={0.01}
                  inputMode="decimal"
                  value={ideasoftBulkTransferDiscountPct}
                  onChange={(e) => setIdeasoftBulkTransferDiscountPct(e.target.value)}
                  disabled={ideasoftBulkLoading || !ideasoftBulkApplyTransferDiscount}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end border-t border-border/60 pt-3 mt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => selectAllIdeasoftSyncBulk()}
              disabled={ideasoftBulkLoading}
            >
              Hepsini seç
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIdeasoftBulkTransferModalOpen(false)}
              disabled={ideasoftBulkLoading}
            >
              İptal
            </Button>
            <Button
              type="button"
              variant="save"
              onClick={() => void submitBulkIdeasoftTransfer()}
              disabled={ideasoftBulkLoading || !ideasoftBulkCanSubmit}
            >
              {ideasoftBulkLoading ? 'Aktarılıyor…' : 'Aktar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
