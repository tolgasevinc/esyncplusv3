import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, Package, AlertCircle, SlidersHorizontal, Plus, Trash2, Download, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
}

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

  const limit = pageSize === 'fit' ? fitLimit : pageSize

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
  }, [])

  const openPushModal = useCallback((p: ParasutProduct) => {
    setPushModalProduct(p)
    setPullModalProduct(null)
    setPushMasterProduct(null)
    setPushMasterProductDetails(null)
    setPushMasterSearch('')
    setPushMasterSuggestions([])
  }, [])

  useEffect(() => {
    if (pullModalProduct || pushModalProduct) {
      fetchRules()
    }
  }, [pullModalProduct, pushModalProduct])

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
      const list = (data.products ?? []).map((p: { id: number; name: string; sku?: string }) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
      }))
      setPushMasterSuggestions(list)
    } catch {
      setPushMasterSuggestions([])
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

  const handlePull = useCallback(async () => {
    if (!pullModalProduct) return
    const selected = rules
      .filter((r) => fieldCheckboxes[`${r.parasut}:${r.master}`])
      .map((r) => ({ parasut: r.parasut, master: r.master }))
    if (selected.length === 0) {
      toastError('Hata', 'En az bir alan seçin')
      return
    }
    setTransferLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/parasut/products/${pullModalProduct.id}/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_fields: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Çekme başarısız')
      toastSuccess('Başarılı', 'Ürün master products\'a çekildi.')
      setPullModalProduct(null)
      fetchProducts()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Çekme başarısız')
    } finally {
      setTransferLoading(false)
    }
  }, [pullModalProduct, rules, fieldCheckboxes, fetchProducts])

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
    >
      <Card>
        <CardHeader className="pb-3">
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
        <CardContent className="p-0">
          {error && (
            <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 mx-4 rounded-lg">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div ref={tableContainerRef} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
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
          {!error && meta.total > 0 && (
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
          )}
        </CardContent>
      </Card>

      <Dialog open={rulesModalOpen} onOpenChange={setRulesModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Ürün Eşleştirme Kuralları</DialogTitle>
            <DialogDescription>
              Paraşüt alanlarının master products tablosundaki hangi alanlarla eşleşeceğini belirleyin.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {rulesLoading ? (
              <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
            ) : (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3 bg-muted/30">
                  {rules.map((rule, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
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

      {/* Çek modal - Paraşüt → Master */}
      <Dialog open={!!pullModalProduct} onOpenChange={(o) => !o && setPullModalProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Paraşüt → Master Çek</DialogTitle>
            <DialogDescription>
              {pullModalProduct?.name ?? pullModalProduct?.code ?? 'Ürün'} — Hangi alanları çekeceğinizi seçin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-64 overflow-y-auto">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Önce Kurallar ile eşleştirme tanımlayın.</p>
            ) : (
              rules.map((r) => {
                const key = `${r.parasut}:${r.master}`
                return (
                  <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={fieldCheckboxes[key] ?? true}
                      onChange={(e) => setFieldCheckboxes((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="rounded border-input"
                    />
                    <span className="text-sm">{getFieldLabel(r.parasut, r.master)}</span>
                  </label>
                )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPullModalProduct(null)}>İptal</Button>
            <Button onClick={handlePull} disabled={transferLoading || rules.length === 0}>
              {transferLoading ? 'Çekiliyor...' : 'Çek'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gönder modal - Master → Paraşüt */}
      <Dialog open={!!pushModalProduct} onOpenChange={(o) => !o && (setPushModalProduct(null), setPushMasterProduct(null), setPushMasterProductDetails(null))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Master → Paraşüt Gönder</DialogTitle>
            <DialogDescription>
              {pushModalProduct?.name ?? pushModalProduct?.code ?? 'Ürün'} — Master products\'tan ürün seçin ve gönderilecek alanları işaretleyin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
              <div className="max-h-40 overflow-y-auto space-y-1">
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
    </PageLayout>
  )
}
