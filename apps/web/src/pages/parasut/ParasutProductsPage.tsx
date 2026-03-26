import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Search, RefreshCw, Package, AlertCircle, SlidersHorizontal, Plus, Trash2, Download, Upload, Pencil, Link2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { API_URL } from '@/lib/api'
import { cn, formatPriceWithSymbol } from '@/lib/utils'
import { toastSuccess, toastError } from '@/lib/toast'
import { CategorySelect, getCategoryPath, type CategoryItem } from '@/components/CategorySelect'
import { ImageInput } from '@/components/ImageInput'
import { buildProductCode } from '@/lib/productCode'

/** Paraşüt API ürün alanları */
const PARASUT_FIELDS = [
  { value: 'code', label: 'Kod' },
  { value: 'name', label: 'Ürün Adı' },
  { value: 'list_price', label: 'Satış Fiyatı' },
  { value: 'currency', label: 'Para Birimi' },
  { value: 'buying_price', label: 'Alış Fiyatı' },
  { value: 'buying_currency', label: 'Alış Para Birimi' },
  { value: 'unit', label: 'Birim' },
  { value: 'vat_rate', label: 'KDV Oranı' },
  { value: 'stock_count', label: 'Stok Miktarı' },
  { value: 'barcode', label: 'Barkod' },
  { value: 'gtip', label: 'GTIP' },
  { value: 'photo', label: 'Ana Görsel (Photo)' },
]

/** Master products tablosu alanları - _id alanları gerçek adlarıyla (parse) */
const MASTER_PRODUCT_FIELDS = [
  { value: 'name', label: 'Ürün Adı' },
  { value: 'sku', label: 'SKU' },
  { value: 'barcode', label: 'Barkod' },
  { value: 'price', label: 'Fiyat' },
  { value: 'quantity', label: 'Miktar' },
  { value: 'tax_rate', label: 'Vergi Oranı' },
  { value: 'unit_id', label: 'Birim' },
  { value: 'currency_id', label: 'Para Birimi' },
  { value: 'supplier_code', label: 'Tedarikçi Kodu' },
  { value: 'gtip_code', label: 'GTIP Kodu' },
  { value: 'image', label: 'Ana Görsel Linki' },
  { value: 'brand_id', label: 'Marka' },
  { value: 'category_id', label: 'Kategori' },
  { value: 'type_id', label: 'Tip' },
]

interface MappingRule {
  parasut: string
  master: string
}

const MAPPINGS_KEY = 'product_mappings'

/** Para birimi kodu → sembol eşlemesi */
const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: '₺', TL: '₺', TRL: '₺',
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'Fr', RUB: '₽',
}

function getCurrencySymbol(code?: string | null): string {
  if (!code) return '₺'
  const c = (code || '').toUpperCase()
  return CURRENCY_SYMBOLS[c] ?? c
}

function parseImageToFirstPath(image: unknown): string | null {
  if (!image) return null
  if (typeof image === 'string') {
    const t = image.trim()
    if (!t || t === '[]') return null
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) {
        const first = parsed.find((x): x is string => typeof x === 'string' && !!x.trim())
        return first?.trim() ?? null
      }
      return t
    } catch {
      return t
    }
  }
  return null
}

interface ParasutProduct {
  id: string
  code?: string
  name?: string
  list_price?: number
  currency?: string
  buying_price?: number
  buying_currency?: string
  unit?: string
  vat_rate?: number
  stock_count?: number
  barcode?: string
  archived?: boolean
  inventory_tracking?: boolean
  created_at?: string
  updated_at?: string
  gtip?: string
  photo?: string
  category_id?: string
}

interface EditForm {
  code: string
  name: string
  list_price: string
  currency: string
  buying_price: string
  buying_currency: string
  unit: string
  vat_rate: string
  stock_count: string
  barcode: string
  gtip: string
  photo: string
  archived: boolean
  inventory_tracking: boolean
}

const emptyEditForm: EditForm = {
  code: '',
  name: '',
  list_price: '',
  currency: 'TRY',
  buying_price: '',
  buying_currency: 'TRY',
  unit: '',
  vat_rate: '',
  stock_count: '',
  barcode: '',
  gtip: '',
  photo: '',
  archived: false,
  inventory_tracking: false,
}

const CURRENCY_OPTIONS = ['TRY', 'USD', 'EUR', 'GBP']

export function ParasutProductsPage() {
  const [products, setProducts] = useState<ParasutProduct[]>([])
  const [meta, setMeta] = useState<{ total: number; page: number; total_pages: number; per_page: number }>({
    total: 0,
    page: 1,
    total_pages: 1,
    per_page: 25,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeValue>(25)
  const [fitLimit, setFitLimit] = useState(25)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const [rulesModalOpen, setRulesModalOpen] = useState(false)
  const [rules, setRules] = useState<MappingRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [rulesSaving, setRulesSaving] = useState(false)
  const [pullModalProduct, setPullModalProduct] = useState<ParasutProduct | null>(null)
  const [pushModalProduct, setPushModalProduct] = useState<ParasutProduct | null>(null)
  const [pushMasterProduct, setPushMasterProduct] = useState<{ id: number; name: string; sku?: string } | null>(null)
  const [pushMasterProductDetails, setPushMasterProductDetails] = useState<Record<string, unknown> | null>(null)
  const [pushMasterDetailsLoading, setPushMasterDetailsLoading] = useState(false)
  const [pushMasterSearch, setPushMasterSearch] = useState('')
  const [pushMasterSearchDebounced, setPushMasterSearchDebounced] = useState('')
  const [pushMasterSuggestions, setPushMasterSuggestions] = useState<{ id: number; name: string; sku?: string }[]>([])
  const [fieldCheckboxes, setFieldCheckboxes] = useState<Record<string, boolean>>({})
  const [transferLoading, setTransferLoading] = useState(false)
  const [matchedCodes, setMatchedCodes] = useState<Set<string>>(new Set())
  const [editModalProduct, setEditModalProduct] = useState<ParasutProduct | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm)
  const [editSaving, setEditSaving] = useState(false)
  const [addMasterForm, setAddMasterForm] = useState<{
    name: string
    sku: string
    category_id: number | ''
    brand_id: number | ''
    type_id: number | ''
    unit_id: number | ''
    tax_rate: number | ''
    supplier_code: string
    image: string
  }>({ name: '', sku: '', category_id: '', brand_id: '', type_id: '', unit_id: '', tax_rate: '', supplier_code: '', image: '' })
  const [masterCategories, setMasterCategories] = useState<CategoryItem[]>([])
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({})
  const [brands, setBrands] = useState<{ id: number; name: string; code?: string }[]>([])
  const [types, setTypes] = useState<{ id: number; name: string; code?: string }[]>([])
  const [units, setUnits] = useState<{ id: number; name: string; code?: string }[]>([])
  const [taxRates, setTaxRates] = useState<{ id: number; name: string; value: number }[]>([])
  const [matchModalProduct, setMatchModalProduct] = useState<ParasutProduct | null>(null)
  const [matchMasterProduct, setMatchMasterProduct] = useState<{
    id: number
    name: string
    sku?: string
    category_id?: number | null
  } | null>(null)
  const [matchMasterSearch, setMatchMasterSearch] = useState('')
  const [matchMasterSearchDebounced, setMatchMasterSearchDebounced] = useState('')
  const [matchMasterSuggestions, setMatchMasterSuggestions] = useState<{ id: number; name: string; sku?: string }[]>([])
  const [matchLoading, setMatchLoading] = useState(false)

  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const addMasterCategoryPath = useMemo(
    () => getCategoryPath(masterCategories, addMasterForm.category_id),
    [masterCategories, addMasterForm.category_id]
  )
  const addMasterBrandCode = useMemo(
    () => (addMasterForm.brand_id ? brands.find((b) => b.id === addMasterForm.brand_id)?.code ?? '' : ''),
    [brands, addMasterForm.brand_id]
  )
  const addMasterGeneratedSku = useMemo(
    () => buildProductCode(addMasterCategoryPath, addMasterBrandCode, addMasterForm.supplier_code ?? ''),
    [addMasterCategoryPath, addMasterBrandCode, addMasterForm.supplier_code]
  )

  useEffect(() => {
    if (!pullModalProduct) return
    setAddMasterForm((f) => ({ ...f, sku: addMasterGeneratedSku }))
  }, [addMasterGeneratedSku, pullModalProduct])

  const getFieldLabel = (parasut: string, master: string) => {
    const pLabel = PARASUT_FIELDS.find((f) => f.value === parasut)?.label ?? parasut
    const mLabel = MASTER_PRODUCT_FIELDS.find((f) => f.value === master)?.label ?? master
    return `${pLabel} → ${mLabel}`
  }

  const getMasterFieldValue = (master: string, data: Record<string, unknown> | null, loading?: boolean): string => {
    if (loading) return '...'
    if (!data) return '—'
    const displayKeys: Record<string, string[]> = {
      unit_id: ['unit_name'],
      currency_id: ['currency_symbol', 'currency_name'],
      brand_id: ['brand_name'],
      category_id: ['category_name'],
      type_id: ['type_name'],
      image: ['image'],
    }
    const keys = displayKeys[master] ?? [master]
    let v: unknown = null
    for (const k of keys) {
      v = data[k] ?? data[master]
      if (v != null && v !== '') break
    }
    if (v == null || v === '') return '—'
    if (master === 'image') {
      const path = parseImageToFirstPath(v)
      if (!path) return '—'
      const url = path.startsWith('http') ? path : `${API_URL}/storage/serve?key=${encodeURIComponent(path)}`
      return url.length > 60 ? url.slice(0, 57) + '...' : url
    }
    if (typeof v === 'number') {
      if (master === 'price') return (v as number).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (master === 'quantity' || master === 'tax_rate') return (v as number).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
      return String(v)
    }
    return String(v)
  }

  const openPullModal = useCallback((p: ParasutProduct) => {
    setPullModalProduct(p)
    setPushModalProduct(null)
    const pr = p as ParasutProduct & { photo?: string }
    const nameVal = String(p.name ?? '').trim() || String(p.code ?? '').trim() || 'Ürün'
    setAddMasterForm({
      name: nameVal,
      sku: '',
      category_id: '',
      brand_id: '',
      type_id: '',
      unit_id: '',
      tax_rate: pr.vat_rate != null ? pr.vat_rate : '',
      supplier_code: '',
      image: String(pr.photo ?? '').trim(),
    })
  }, [])

  const openPushModal = useCallback((p: ParasutProduct) => {
    setPushModalProduct(p)
    setPullModalProduct(null)
    setPushMasterProduct(null)
    setPushMasterProductDetails(null)
    setPushMasterSearch('')
    setPushMasterSuggestions([])
  }, [])

  const openMatchModal = useCallback((p: ParasutProduct) => {
    setMatchModalProduct(p)
    setMatchMasterProduct(null)
    setMatchMasterSearch('')
    setMatchMasterSuggestions([])
  }, [])

  const openEditModal = useCallback((p: ParasutProduct) => {
    setEditModalProduct(p)
    const pr = p as ParasutProduct & { gtip?: string; photo?: string }
    setEditForm({
      code: pr.code ?? '',
      name: pr.name ?? '',
      list_price: pr.list_price != null ? String(pr.list_price) : '',
      currency: pr.currency ?? 'TRY',
      buying_price: pr.buying_price != null ? String(pr.buying_price) : '',
      buying_currency: pr.buying_currency ?? pr.currency ?? 'TRY',
      unit: pr.unit ?? '',
      vat_rate: pr.vat_rate != null ? String(pr.vat_rate) : '',
      stock_count: pr.stock_count != null ? String(pr.stock_count) : '',
      barcode: pr.barcode ?? '',
      gtip: pr.gtip ?? '',
      photo: pr.photo ?? '',
      archived: pr.archived ?? false,
      inventory_tracking: pr.inventory_tracking ?? false,
    })
  }, [])

  useEffect(() => {
    if (pullModalProduct || pushModalProduct) {
      fetchRules()
    }
  }, [pullModalProduct, pushModalProduct])

  /** Eşleştir modalı: kategori Paraşüt’e yazılsın diye mapping gerekir (çek modalı açılmadan da yükle) */
  useEffect(() => {
    if (!matchModalProduct) return
    fetch(`${API_URL}/api/parasut/category-mappings`)
      .then((r) => r.json())
      .then((d: { mappings?: Record<string, string> }) => {
        const m = d.mappings ?? {}
        if (Object.keys(m).length > 0) setCategoryMappings(m)
      })
      .catch(() => {})
  }, [matchModalProduct])

  /** Çek modalı açıldığında formu ürün verisiyle doldur (name, image vb.) */
  useEffect(() => {
    if (!pullModalProduct) return
    const pr = pullModalProduct as ParasutProduct & { photo?: string }
    const nameVal = String(pr.name ?? '').trim() || String(pr.code ?? '').trim() || 'Ürün'
    setAddMasterForm((f) => ({
      ...f,
      name: nameVal,
      image: String(pr.photo ?? '').trim(),
    }))
  }, [pullModalProduct])

  useEffect(() => {
    if (!pullModalProduct) return
    Promise.all([
      fetch(`${API_URL}/api/product-categories?limit=9999`).then((r) => r.json()),
      fetch(`${API_URL}/api/parasut/category-mappings`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-brands?limit=9999`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-types?limit=9999`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-units?limit=9999`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-tax-rates?limit=9999`).then((r) => r.json()),
    ]).then(([catData, mapData, brandData, typeData, unitData, taxData]) => {
      setMasterCategories(
        (catData.data ?? []).map((x: { id: number; name: string; code?: string; group_id?: number | null; category_id?: number | null; sort_order?: number; color?: string }) => ({
          id: x.id,
          name: x.name,
          code: (x.code || x.name?.slice(0, 2)?.toUpperCase()) ?? '',
          group_id: x.group_id,
          category_id: x.category_id,
          sort_order: x.sort_order ?? 0,
          color: x.color,
        }))
      )
      const mappings = (mapData.mappings ?? {}) as Record<string, string>
      setCategoryMappings(mappings)
      setBrands((brandData.data ?? []).map((x: { id: number; name: string; code?: string }) => ({
        id: x.id,
        name: x.name,
        code: (x.code || x.name?.slice(0, 2)?.toUpperCase()) ?? '',
      })))
      setTypes((typeData.data ?? []).map((x: { id: number; name: string; code?: string }) => ({
        id: x.id,
        name: x.name,
        code: x.code ?? '',
      })))
      setUnits((unitData.data ?? []).map((x: { id: number; name: string; code?: string }) => ({
        id: x.id,
        name: x.name,
        code: (x.code || x.name?.slice(0, 2)?.toUpperCase()) ?? '',
      })))
      setTaxRates((taxData.data ?? []).map((x: { id: number; name: string; value: number }) => ({
        id: x.id,
        name: x.name,
        value: x.value ?? 0,
      })))
      let updates: Partial<{ category_id: number; unit_id: number }> = {}
      const parasutCatId = pullModalProduct.category_id != null ? String(pullModalProduct.category_id) : ''
      if (parasutCatId) {
        const masterId = Object.entries(mappings).find(([, v]) => String(v) === parasutCatId)?.[0]
        if (masterId) {
          const mid = parseInt(masterId, 10)
          if (!Number.isNaN(mid)) updates.category_id = mid
        }
      }
      const parasutUnit = (pullModalProduct.unit ?? '').toString().trim().toUpperCase()
      if (parasutUnit) {
        const unitList = (unitData.data ?? []) as { id: number; name: string; code?: string }[]
        const matchedUnit = unitList.find(
          (u) =>
            (u.code ?? '').toUpperCase() === parasutUnit ||
            (u.name ?? '').toUpperCase() === parasutUnit ||
            (u.code ?? '').toUpperCase().startsWith(parasutUnit) ||
            (u.name ?? '').toUpperCase().startsWith(parasutUnit)
        )
        if (matchedUnit) updates.unit_id = matchedUnit.id
      }
      if (Object.keys(updates).length > 0) {
        setAddMasterForm((f) => ({ ...f, ...updates }))
      }
    }).catch(() => {})
  }, [pullModalProduct])

  useEffect(() => {
    if ((pullModalProduct || pushModalProduct) && rules.length > 0) {
      const initial: Record<string, boolean> = {}
      rules.forEach((r) => {
        const key = `${r.parasut}:${r.master}`
        initial[key] = true
      })
      setFieldCheckboxes(initial)
    }
  }, [pullModalProduct, pushModalProduct, rules])

  useEffect(() => {
    const t = setTimeout(() => setPushMasterSearchDebounced(pushMasterSearch), 300)
    return () => clearTimeout(t)
  }, [pushMasterSearch])

  useEffect(() => {
    const t = setTimeout(() => setMatchMasterSearchDebounced(matchMasterSearch), 300)
    return () => clearTimeout(t)
  }, [matchMasterSearch])

  useEffect(() => {
    if (!pushMasterSearch.trim()) {
      setPushMasterProduct(null)
      setPushMasterProductDetails(null)
    }
  }, [pushMasterSearch])

  useEffect(() => {
    if (!pushMasterProduct?.id) {
      setPushMasterProductDetails(null)
      setPushMasterDetailsLoading(false)
      return
    }
    setPushMasterDetailsLoading(true)
    fetch(`${API_URL}/api/products/${pushMasterProduct.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setPushMasterProductDetails(data)
      })
      .catch(() => setPushMasterProductDetails(null))
      .finally(() => setPushMasterDetailsLoading(false))
  }, [pushMasterProduct?.id])

  const searchMasterProducts = useCallback(async (q: string) => {
    if (!q.trim()) {
      setPushMasterSuggestions([])
      return
    }
    try {
      const res = await fetch(`${API_URL}/api/products/search-by-name?q=${encodeURIComponent(q)}&limit=25`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const list = (data.products ?? []).map(
        (p: { id: number; name: string; sku?: string; category_id?: number | null }) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category_id: p.category_id ?? null,
        })
      )
      setPushMasterSuggestions(list)
    } catch {
      setPushMasterSuggestions([])
    }
  }, [])

  const searchMatchMasterProducts = useCallback(async (q: string) => {
    if (!q.trim()) {
      setMatchMasterSuggestions([])
      return
    }
    try {
      const res = await fetch(`${API_URL}/api/products/search-by-name?q=${encodeURIComponent(q)}&limit=25`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const list = (data.products ?? []).map(
        (p: { id: number; name: string; sku?: string; category_id?: number | null }) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category_id: p.category_id ?? null,
        })
      )
      setMatchMasterSuggestions(list)
    } catch {
      setMatchMasterSuggestions([])
    }
  }, [])

  useEffect(() => {
    if (!pushModalProduct) return
    if (!pushMasterSearchDebounced.trim()) {
      setPushMasterSuggestions([])
      return
    }
    searchMasterProducts(pushMasterSearchDebounced)
  }, [pushModalProduct, pushMasterSearchDebounced, searchMasterProducts])

  useEffect(() => {
    if (!matchModalProduct) return
    if (!matchMasterSearchDebounced.trim()) {
      setMatchMasterSuggestions([])
      return
    }
    searchMatchMasterProducts(matchMasterSearchDebounced)
  }, [matchModalProduct, matchMasterSearchDebounced, searchMatchMasterProducts])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(Math.min(limit, 25)))
      if (searchDebounced) params.set('filter_name', searchDebounced)
      const res = await fetch(`${API_URL}/api/parasut/products?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Paraşüt ürünleri yüklenemedi')
      const list = data.data ?? []
      setProducts(list)
      setMeta(data.meta ?? { total: 0, page: 1, total_pages: 1, per_page: limit })
      const codes = list.map((p: ParasutProduct) => p.code).filter((c: string | undefined): c is string => !!c?.trim())
      if (codes.length > 0) {
        fetch(`${API_URL}/api/products/matched-skus?codes=${codes.map((c: string) => encodeURIComponent(c)).join(',')}`)
          .then((r) => r.json())
          .then((d) => setMatchedCodes(new Set((d.matched ?? []) as string[])))
          .catch(() => setMatchedCodes(new Set()))
      } else {
        setMatchedCodes(new Set())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bağlantı hatası')
      setProducts([])
      setMeta({ total: 0, page: 1, total_pages: 1, per_page: limit })
    } finally {
      setLoading(false)
    }
  }, [page, searchDebounced, limit])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const handleAddAsMaster = useCallback(async () => {
    if (!pullModalProduct) return
    const name = addMasterForm.name.trim()
    if (!name) {
      toastError('Hata', 'Ürün adı zorunludur')
      return
    }
    if (!addMasterForm.type_id) {
      toastError('Hata', 'Ürün tipi seçin')
      return
    }
    const categoryId = addMasterForm.category_id
    if (categoryId && !categoryMappings[String(categoryId)]) {
      toastError('Hata', 'Seçilen kategori Paraşüt\'te eşleşmemiş. Önce Paraşüt Kategoriler sayfasından kategori eşleştirmesi yapın.')
      return
    }
    const effectiveSku = addMasterForm.sku.trim() || addMasterGeneratedSku
    if (!effectiveSku) {
      toastError('Hata', 'Kod oluşturmak için kategori, marka veya tedarikçi kodu girin')
      return
    }
    setTransferLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/parasut/products/${pullModalProduct.id}/add-as-master`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sku: effectiveSku,
          category_id: categoryId || null,
          brand_id: addMasterForm.brand_id || null,
          type_id: addMasterForm.type_id || null,
          unit_id: addMasterForm.unit_id || null,
          tax_rate: addMasterForm.tax_rate !== '' ? addMasterForm.tax_rate : (pullModalProduct.vat_rate ?? 0),
          supplier_code: addMasterForm.supplier_code?.trim() || null,
          image: addMasterForm.image?.trim() || null,
          price: pullModalProduct.list_price ?? 0,
          quantity: pullModalProduct.stock_count ?? 0,
          barcode: pullModalProduct.barcode?.trim() || undefined,
          gtip: (pullModalProduct as ParasutProduct & { gtip?: string }).gtip?.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error || 'İşlem başarısız')
      toastSuccess('Başarılı', 'Master ürün oluşturuldu ve Paraşüt güncellendi.')
      setPullModalProduct(null)
      fetchProducts()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setTransferLoading(false)
    }
  }, [pullModalProduct, addMasterForm, addMasterGeneratedSku, categoryMappings, fetchProducts])

  const handlePush = useCallback(async () => {
    if (!pushModalProduct || !pushMasterProduct) return
    const selected = rules
      .filter((r) => fieldCheckboxes[`${r.parasut}:${r.master}`])
      .map((r) => ({ parasut: r.parasut, master: r.master }))
    if (selected.length === 0) {
      toastError('Hata', 'En az bir alan seçin')
      return
    }
    setTransferLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/parasut/products/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parasut_id: pushModalProduct.id,
          product_id: pushMasterProduct.id,
          selected_fields: selected,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Gönderme başarısız')
      toastSuccess('Başarılı', 'Ürün Paraşüt\'e gönderildi.')
      setPushModalProduct(null)
      setPushMasterProduct(null)
      fetchProducts()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Gönderme başarısız')
    } finally {
      setTransferLoading(false)
    }
  }, [pushModalProduct, pushMasterProduct, rules, fieldCheckboxes, fetchProducts])

  const handleMatch = useCallback(async () => {
    if (!matchModalProduct || !matchMasterProduct) return
    const parasutCode = (matchModalProduct.code ?? '').trim()
    const masterSku = (matchMasterProduct.sku ?? '').trim()
    const value = masterSku || parasutCode
    if (!value) {
      toastError('Hata', 'Ana ürünün SKU\'su veya Paraşüt ürün kodundan biri dolu olmalı')
      return
    }
    const masterCatId = matchMasterProduct.category_id
    const parasutCategoryId =
      masterCatId != null && masterCatId > 0 ? (categoryMappings[String(masterCatId)] ?? '').trim() : ''
    const categorySkipped =
      masterCatId != null && masterCatId > 0 && !parasutCategoryId
    const parasutBody: Record<string, string> = {
      code: value,
      name: (matchModalProduct.name ?? 'Ürün').trim() || 'Ürün',
    }
    if (parasutCategoryId) parasutBody.category_id = parasutCategoryId
    setMatchLoading(true)
    try {
      const [parasutRes, masterRes] = await Promise.all([
        fetch(`${API_URL}/api/parasut/products/${matchModalProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parasutBody),
        }),
        fetch(`${API_URL}/api/products/${matchMasterProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: value }),
        }),
      ])
      const parasutData = await parasutRes.json()
      const masterData = await masterRes.json()
      if (!parasutRes.ok) throw new Error((parasutData as { error?: string }).error || 'Paraşüt güncellenemedi')
      if (!masterRes.ok) throw new Error((masterData as { error?: string }).error || 'Ana ürün güncellenemedi')
      toastSuccess(
        'Başarılı',
        categorySkipped
          ? 'Paraşüt kodu ve ana ürün SKU\'su güncellendi. Kategori Paraşüt\'e yazılmadı — Paraşüt Kategoriler sayfasında bu master kategoriyi eşleyin.'
          : parasutCategoryId
            ? 'Eşleştirme tamamlandı. Paraşüt kodu, kategori ve ana ürün SKU\'su güncellendi.'
            : 'Eşleştirme tamamlandı. Paraşüt kodu ve ana ürün SKU\'su güncellendi.',
      )
      setMatchModalProduct(null)
      setMatchMasterProduct(null)
      fetchProducts()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Eşleştirme başarısız')
    } finally {
      setMatchLoading(false)
    }
  }, [matchModalProduct, matchMasterProduct, categoryMappings, fetchProducts])

  const handleEditSave = useCallback(async () => {
    if (!editModalProduct) return
    if (!editForm.name.trim()) {
      toastError('Hata', 'Ürün adı zorunludur')
      return
    }
    setEditSaving(true)
    try {
      const body = {
        code: editForm.code.trim() || undefined,
        name: editForm.name.trim(),
        list_price: editForm.list_price ? parseFloat(editForm.list_price) : undefined,
        currency: editForm.currency || 'TRY',
        buying_price: editForm.buying_price ? parseFloat(editForm.buying_price) : undefined,
        buying_currency: editForm.buying_currency || undefined,
        unit: editForm.unit.trim() || undefined,
        vat_rate: editForm.vat_rate ? parseFloat(editForm.vat_rate) : undefined,
        stock_count: editForm.stock_count ? parseInt(editForm.stock_count, 10) : undefined,
        barcode: editForm.barcode.trim() || undefined,
        gtip: editForm.gtip.trim() || undefined,
        photo: editForm.photo.trim() || undefined,
        archived: editForm.archived,
        inventory_tracking: editForm.inventory_tracking,
      }
      const res = await fetch(`${API_URL}/api/parasut/products/${editModalProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Güncelleme başarısız')
      toastSuccess('Başarılı', 'Ürün Paraşüt\'te güncellendi.')
      setEditModalProduct(null)
      fetchProducts()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Güncelleme başarısız')
    } finally {
      setEditSaving(false)
    }
  }, [editModalProduct, editForm, fetchProducts])

  const fetchRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/app-settings?category=parasut`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ayarlar alınamadı')
      const raw = (data as Record<string, string>)[MAPPINGS_KEY]
      if (raw?.trim()) {
        const parsed = JSON.parse(raw) as MappingRule[] | Record<string, string>
        if (Array.isArray(parsed)) {
          setRules(parsed.filter((r) => r.parasut && r.master))
        } else if (typeof parsed === 'object' && parsed !== null) {
          setRules(
            Object.entries(parsed)
              .filter(([k, v]) => k && v)
              .map(([parasut, master]) => ({ parasut, master }))
          )
        } else {
          setRules([])
        }
      } else {
        setRules([])
      }
    } catch {
      setRules([])
    } finally {
      setRulesLoading(false)
    }
  }, [])

  const saveRules = useCallback(async () => {
    setRulesSaving(true)
    try {
      const toSave = rules.filter((r) => r.parasut?.trim() && r.master?.trim())
      const res = await fetch(`${API_URL}/api/app-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'parasut',
          settings: { [MAPPINGS_KEY]: JSON.stringify(toSave) },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
      toastSuccess('Kaydedildi', 'Ürün eşleştirme kuralları güncellendi.')
      setRulesModalOpen(false)
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kurallar kaydedilemedi')
    } finally {
      setRulesSaving(false)
    }
  }, [rules])

  useEffect(() => {
    if (rulesModalOpen) fetchRules()
  }, [rulesModalOpen, fetchRules])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  return (
    <PageLayout
      title="Paraşüt Ürünler"
      description="Paraşüt API üzerinden çekilen ürün listesi"
      backTo="/parasut"
      contentOverflow="hidden"
      footerContent={
        !error && meta.total > 0 ? (
          <TablePaginationFooter
            total={meta.total}
            page={meta.page}
            pageSize={pageSize}
            fitLimit={fitLimit}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onFitLimitChange={setFitLimit}
            tableContainerRef={tableContainerRef}
            hasFilter={search.length > 0}
          />
        ) : null
      }
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Ürünler
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRulesModalOpen(true)}
                className="shrink-0"
              >
                <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                Kurallar
              </Button>
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="İsim veya kod ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button variant="outline" size="icon" onClick={fetchProducts} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {error && (
            <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 mx-4 rounded-lg shrink-0">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div ref={tableContainerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Kod</th>
                  <th className="text-left p-3 font-medium">Ürün Adı</th>
                  <th className="text-right p-3 font-medium">Satış Fiyatı</th>
                  <th className="text-right p-3 font-medium">Alış Fiyatı</th>
                  <th className="text-center p-3 font-medium">Birim</th>
                  <th className="text-right p-3 font-medium">Stok</th>
                  <th className="text-right p-3 font-medium">KDV %</th>
                  <th className="text-center p-3 font-medium">Durum</th>
                  <th className="text-center p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      {searchDebounced ? 'Arama sonucu bulunamadı.' : 'Paraşüt\'te ürün bulunamadı.'}
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const isMatched = !!(p.code && matchedCodes.has(p.code))
                    return (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-b transition-colors',
                        isMatched ? 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50' : 'hover:bg-muted/30'
                      )}
                    >
                      <td className="p-3 font-mono text-xs">{p.code ?? '-'}</td>
                      <td className="p-3">{p.name ?? '-'}</td>
                      <td className="p-3 text-right">
                        {p.list_price != null
                          ? formatPriceWithSymbol(p.list_price, getCurrencySymbol(p.currency))
                          : '-'}
                      </td>
                      <td className="p-3 text-right">
                        {p.buying_price != null
                          ? formatPriceWithSymbol(p.buying_price, getCurrencySymbol(p.buying_currency || p.currency))
                          : '-'}
                      </td>
                      <td className="p-3 text-center">{p.unit ?? '-'}</td>
                      <td className="p-3 text-right">
                        {p.inventory_tracking && p.stock_count != null ? (
                          <span
                            className={cn(
                              'inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-medium',
                              p.stock_count < 0 && 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
                              p.stock_count === 0 && 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400',
                              p.stock_count > 0 && 'bg-muted text-muted-foreground'
                            )}
                          >
                            {p.stock_count}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-3 text-right">{p.vat_rate != null ? `${p.vat_rate}%` : '-'}</td>
                      <td className="p-3 text-center">
                        {p.archived ? (
                          <span className="text-muted-foreground text-xs">Arşiv</span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400 text-xs">Aktif</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openEditModal(p)}
                          >
                            <Pencil className="h-3.5 w-3 mr-1" />
                            Düzenle
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openMatchModal(p)}
                          >
                            <Link2 className="h-3.5 w-3 mr-1" />
                            Eşleştir
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openPullModal(p)}
                          >
                            <Download className="h-3.5 w-3 mr-1" />
                            Çek
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openPushModal(p)}
                          >
                            <Upload className="h-3.5 w-3 mr-1" />
                            Gönder
                          </Button>
                        </div>
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

      <Dialog open={rulesModalOpen} onOpenChange={setRulesModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle>Ürün Eşleştirme Kuralları</DialogTitle>
            <DialogDescription>
              Paraşüt alanlarının master products tablosundaki hangi alanlarla eşleşeceğini belirleyin.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 py-2 min-w-0">
            {rulesLoading ? (
              <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
            ) : (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden border rounded-md p-4 bg-muted/30 min-w-0">
                  {rules.map((rule, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        aria-label="Paraşüt alanı"
                        value={rule.parasut}
                        onChange={(e) => {
                          const next = [...rules]
                          next[idx] = { ...next[idx], parasut: e.target.value }
                          setRules(next)
                        }}
                        className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        <option value="">Paraşüt alanı seçin</option>
                        {PARASUT_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <select
                        aria-label="Master products alanı"
                        value={rule.master}
                        onChange={(e) => {
                          const next = [...rules]
                          next[idx] = { ...next[idx], master: e.target.value }
                          setRules(next)
                        }}
                        className="flex h-9 w-40 rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        <option value="">Master products alanı</option>
                        {MASTER_PRODUCT_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setRules(rules.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRules([...rules, { parasut: '', master: '' }])}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Satır Ekle
                </Button>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRulesModalOpen(false)}>
              İptal
            </Button>
            <Button onClick={saveRules} disabled={rulesSaving || rulesLoading}>
              {rulesSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Çek modal - Master Ürün Ekle */}
      <Dialog open={!!pullModalProduct} onOpenChange={(o) => !o && (setPullModalProduct(null), setAddMasterForm({ name: '', sku: '', category_id: '', brand_id: '', type_id: '', unit_id: '', tax_rate: '', supplier_code: '', image: '' }))}>
        <DialogContent className="max-w-xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Master Ürün Ekle</DialogTitle>
            <DialogDescription>
              {pullModalProduct?.name ?? pullModalProduct?.code ?? 'Ürün'} — Paraşüt ürününü master olarak ekleyin. Kaydet ile hem master hem Paraşüt güncellenir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 min-w-0">
            {pullModalProduct?.category_id && !Object.values(categoryMappings).includes(pullModalProduct.category_id) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>Paraşüt ürününde kategori var ancak eşleşme bulunamadı. Kategori seçerseniz önce Paraşüt Kategoriler sayfasından eşleştirme yapın.</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="add-master-name">Ürün Adı *</Label>
              <Input
                id="add-master-name"
                value={addMasterForm.name}
                onChange={(e) => setAddMasterForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ürün adı"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-master-brand">Marka</Label>
                <select
                  id="add-master-brand"
                  value={addMasterForm.brand_id}
                  onChange={(e) => setAddMasterForm((f) => ({ ...f, brand_id: e.target.value ? Number(e.target.value) : '' }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Seçin</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} {b.code ? `[${b.code}]` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-master-type">Ürün Tipi *</Label>
                <select
                  id="add-master-type"
                  value={addMasterForm.type_id}
                  onChange={(e) => setAddMasterForm((f) => ({ ...f, type_id: e.target.value ? Number(e.target.value) : '' }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Seçin</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <CategorySelect
                categories={masterCategories}
                value={addMasterForm.category_id}
                onChange={(id) => setAddMasterForm((f) => ({ ...f, category_id: id }))}
                placeholder="Kategori seçin (eşleşmiş olmalı)"
                variant="badge"
              />
              {addMasterForm.category_id && !categoryMappings[String(addMasterForm.category_id)] && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3" />
                  Eşleşen kategori yok — kaydetmeden önce Paraşüt Kategoriler sayfasından eşleştirin.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-master-unit">Birim (opsiyonel)</Label>
                <select
                  id="add-master-unit"
                  value={addMasterForm.unit_id}
                  onChange={(e) => setAddMasterForm((f) => ({ ...f, unit_id: e.target.value ? Number(e.target.value) : '' }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Birim seçilmeden kaydedilebilir</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} {u.code ? `[${u.code}]` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-master-tax">Vergi Oranı (%)</Label>
                <select
                  id="add-master-tax"
                  value={addMasterForm.tax_rate === '' ? '' : String(addMasterForm.tax_rate)}
                  onChange={(e) => setAddMasterForm((f) => ({ ...f, tax_rate: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Seçin</option>
                  {taxRates.map((tr) => (
                    <option key={tr.id} value={tr.value}>{tr.name} ({tr.value}%)</option>
                  ))}
                  {addMasterForm.tax_rate !== '' && !taxRates.some((tr) => tr.value === addMasterForm.tax_rate) && (
                    <option value={String(addMasterForm.tax_rate)}>{addMasterForm.tax_rate}%</option>
                  )}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-master-supplier">Tedarikçi Kodu</Label>
              <Input
                id="add-master-supplier"
                value={addMasterForm.supplier_code}
                onChange={(e) => setAddMasterForm((f) => ({ ...f, supplier_code: e.target.value }))}
                placeholder="Tedarikçi kodu girildiğinde kod otomatik oluşur"
              />
            </div>
            <div className="space-y-2">
              <Label>Görsel</Label>
              <ImageInput
                value={addMasterForm.image}
                onChange={(v) => setAddMasterForm((f) => ({ ...f, image: v }))}
                folderStorageKey="urunler-klasor"
                placeholder="Ürün görseli"
                compact
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-master-sku">Kod (SKU)</Label>
              <Input
                id="add-master-sku"
                value={addMasterForm.sku}
                onChange={(e) => setAddMasterForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="Kategori + marka + tedarikçi kodundan otomatik oluşur"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {addMasterGeneratedSku ? `Otomatik: ${addMasterGeneratedSku}` : 'Kategori, marka veya tedarikçi kodu girin'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPullModalProduct(null)}>İptal</Button>
            <Button onClick={handleAddAsMaster} disabled={transferLoading || !addMasterForm.name.trim() || !addMasterForm.type_id}>
              {transferLoading ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gönder modal - Master → Paraşüt */}
      <Dialog open={!!pushModalProduct} onOpenChange={(o) => !o && (setPushModalProduct(null), setPushMasterProduct(null), setPushMasterProductDetails(null))}>
        <DialogContent className="max-w-2xl p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle>Master → Paraşüt Gönder</DialogTitle>
            <DialogDescription>
              {pushModalProduct?.name ?? pushModalProduct?.code ?? 'Ürün'} — Master products\'tan ürün seçin ve gönderilecek alanları işaretleyin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <label className="text-sm font-medium">Master ürün seçin</label>
              <div className="relative">
                <Input
                  placeholder="Ürün adı veya SKU ile ara..."
                  value={pushMasterSearch}
                  onChange={(e) => setPushMasterSearch(e.target.value)}
                  onFocus={() => pushMasterSearch && searchMasterProducts(pushMasterSearch)}
                />
                {pushMasterSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-lg z-10 max-h-64 overflow-y-auto">
                    {pushMasterSuggestions.map((mp) => (
                      <button
                        key={mp.id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted border-b border-border last:border-b-0 flex flex-col gap-0.5"
                        onClick={() => {
                          setPushMasterProduct(mp)
                          setPushMasterSearch(mp.sku ? `${mp.sku} - ${mp.name}` : mp.name)
                          setPushMasterSuggestions([])
                        }}
                      >
                        <span className="font-mono text-xs text-muted-foreground">{mp.sku ?? '—'}</span>
                        <span>{mp.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {pushMasterProduct && (
                <p className="text-xs text-muted-foreground">
                  Seçili: <span className="font-mono">{pushMasterProduct.sku ?? '—'}</span> — {pushMasterProduct.name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Gönderilecek alanlar</label>
              <div className="max-h-40 overflow-y-auto overflow-x-hidden space-y-1 min-w-0">
                {rules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Önce Kurallar ile eşleştirme tanımlayın.</p>
                ) : (
                  rules.map((r) => {
                    const key = `${r.parasut}:${r.master}`
                    const value = getMasterFieldValue(r.master, pushMasterProductDetails, pushMasterDetailsLoading)
                    return (
                      <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                        <input
                          type="checkbox"
                          checked={fieldCheckboxes[key] ?? true}
                          onChange={(e) => setFieldCheckboxes((prev) => ({ ...prev, [key]: e.target.checked }))}
                          className="rounded border-input"
                        />
                        <span className="text-sm flex-1 min-w-0">
                          {getFieldLabel(r.parasut, r.master)}
                          <span className="text-muted-foreground ml-1 truncate">({value})</span>
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPushModalProduct(null); setPushMasterProduct(null); setPushMasterProductDetails(null) }}>İptal</Button>
            <Button onClick={handlePush} disabled={transferLoading || !pushMasterProduct || rules.length === 0}>
              {transferLoading ? 'Gönderiliyor...' : 'Gönder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eşleştir modal - Paraşüt ürünü ile ana ürün eşleştir */}
      <Dialog open={!!matchModalProduct} onOpenChange={(o) => !o && (setMatchModalProduct(null), setMatchMasterProduct(null))}>
        <DialogContent className="max-w-xl p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle>Ürün Eşleştir</DialogTitle>
            <DialogDescription>
              {matchModalProduct?.name ?? matchModalProduct?.code ?? 'Ürün'} — Ana ürünlerden seçerek Paraşüt kodu ile ana ürün SKU\'sunu eşleştirin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ana ürün seçin</label>
              <div className="relative">
                <Input
                  placeholder="Ürün adı veya SKU ile ara..."
                  value={matchMasterSearch}
                  onChange={(e) => setMatchMasterSearch(e.target.value)}
                  onFocus={() => matchMasterSearch && searchMatchMasterProducts(matchMasterSearch)}
                />
                {matchMasterSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-lg z-10 max-h-64 overflow-y-auto">
                    {matchMasterSuggestions.map((mp) => (
                      <button
                        key={mp.id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted border-b border-border last:border-b-0 flex flex-col gap-0.5"
                        onClick={() => {
                          setMatchMasterProduct(mp)
                          setMatchMasterSearch(mp.sku ? `${mp.sku} - ${mp.name}` : mp.name)
                          setMatchMasterSuggestions([])
                        }}
                      >
                        <span className="font-mono text-xs text-muted-foreground">{mp.sku ?? '—'}</span>
                        <span>{mp.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {matchMasterProduct && (
                <p className="text-xs text-muted-foreground">
                  Seçili: <span className="font-mono">{matchMasterProduct.sku ?? '—'}</span> — {matchMasterProduct.name}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Eşleştirme sonrası Paraşüt ürün kodu ve ana ürün SKU&apos;su aynı değere ayarlanır (SKU öncelikli, boşsa Paraşüt kodu). Ana üründe kategori varsa ve Paraşüt Kategoriler sayfasında eşleşme tanımlıysa Paraşüt ürün kategorisi de güncellenir.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMatchModalProduct(null); setMatchMasterProduct(null) }}>İptal</Button>
            <Button onClick={handleMatch} disabled={matchLoading || !matchMasterProduct}>
              {matchLoading ? 'Eşleştiriliyor...' : 'Eşleştir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Düzenle modal - Paraşüt ürünü doğrudan düzenle */}
      <Dialog open={!!editModalProduct} onOpenChange={(o) => !o && setEditModalProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle>Paraşüt Ürünü Düzenle</DialogTitle>
            <DialogDescription>
              {editModalProduct?.name ?? editModalProduct?.code ?? 'Ürün'} — Değişiklikler Paraşüt API üzerinden kaydedilir.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 py-4 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 min-w-0">
              <div className="space-y-2">
                <Label htmlFor="edit-code">Kod</Label>
                <Input
                  id="edit-code"
                  value={editForm.code}
                  onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="Ürün kodu"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">Ürün Adı *</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ürün adı"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-list-price">Satış Fiyatı</Label>
                <Input
                  id="edit-list-price"
                  type="number"
                  step="0.01"
                  value={editForm.list_price}
                  onChange={(e) => setEditForm((f) => ({ ...f, list_price: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-currency">Para Birimi</Label>
                <select
                  id="edit-currency"
                  aria-label="Para Birimi"
                  value={editForm.currency}
                  onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-buying-price">Alış Fiyatı</Label>
                <Input
                  id="edit-buying-price"
                  type="number"
                  step="0.01"
                  value={editForm.buying_price}
                  onChange={(e) => setEditForm((f) => ({ ...f, buying_price: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-buying-currency">Alış Para Birimi</Label>
                <select
                  id="edit-buying-currency"
                  aria-label="Alış Para Birimi"
                  value={editForm.buying_currency}
                  onChange={(e) => setEditForm((f) => ({ ...f, buying_currency: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-unit">Birim</Label>
                <Input
                  id="edit-unit"
                  value={editForm.unit}
                  onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="Adet, Kg, vb."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vat-rate">KDV Oranı (%)</Label>
                <Input
                  id="edit-vat-rate"
                  type="number"
                  step="0.01"
                  value={editForm.vat_rate}
                  onChange={(e) => setEditForm((f) => ({ ...f, vat_rate: e.target.value }))}
                  placeholder="18"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stock-count">Stok Miktarı</Label>
                <Input
                  id="edit-stock-count"
                  type="number"
                  value={editForm.stock_count}
                  onChange={(e) => setEditForm((f) => ({ ...f, stock_count: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-barcode">Barkod</Label>
                <Input
                  id="edit-barcode"
                  value={editForm.barcode}
                  onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))}
                  placeholder="Barkod"
                />
              </div>
              <div className="space-y-2 sm:col-span-2 min-w-0">
                <Label htmlFor="edit-gtip">GTIP</Label>
                <Input
                  id="edit-gtip"
                  value={editForm.gtip}
                  onChange={(e) => setEditForm((f) => ({ ...f, gtip: e.target.value }))}
                  placeholder="GTIP kodu"
                />
              </div>
              <div className="space-y-2 sm:col-span-2 min-w-0">
                <Label htmlFor="edit-photo">Ana Görsel URL</Label>
                <Input
                  id="edit-photo"
                  value={editForm.photo}
                  onChange={(e) => setEditForm((f) => ({ ...f, photo: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-archived"
                  checked={editForm.archived}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, archived: v }))}
                />
                <Label htmlFor="edit-archived" className="cursor-pointer">Arşiv</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-inventory-tracking"
                  checked={editForm.inventory_tracking}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, inventory_tracking: v }))}
                />
                <Label htmlFor="edit-inventory-tracking" className="cursor-pointer">Stok Takibi</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="close" onClick={() => setEditModalProduct(null)}>
              İptal
            </Button>
            <Button variant="save" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
