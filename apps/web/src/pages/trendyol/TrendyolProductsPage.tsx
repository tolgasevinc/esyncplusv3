import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
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
import { submitTrendyolProductCreate, type TrendyolCreateBody } from '@/lib/trendyol-api'
import { cn } from '@/lib/utils'

type ProductRow = {
  id: number
  name: string
  sku?: string
  price: number
  quantity: number
  currency_symbol?: string
}

const listDefaults = {
  search: '',
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

export function TrendyolProductsPage() {
  const [listState, setListState] = usePersistedListState('trendyol-products-v1', listDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

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
  const hasFilter = search.trim().length > 0

  const loadList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort_by: 'name',
        sort_order: 'asc',
      })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`${API_URL}/api/products?${params}`)
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
  }, [page, limit, search])

  useEffect(() => {
    void loadList()
  }, [loadList])

  async function openModal(row: ProductRow) {
    setSelectedProduct(row)
    setModalOpen(true)
    setDetailLoading(true)
    setCategoryId('')
    setBrandId('')
    setCargoId('')
    setDesi('1')
    setProductMainId('')
    setBarcode('')
    setStockCode('')
    setTitle('')
    setDescription('')
    setListPrice('')
    setSalePrice('')
    setAttributesJson('[{ "attributeId": 0, "attributeValueId": 0 }]')
    try {
      const res = await fetch(`${API_URL}/api/products/${row.id}`)
      const d = await parseJsonResponse<{
        name?: string
        sku?: string
        barcode?: string
        price?: number
        ecommerce_price?: number
        quantity?: number
        main_description?: string
        ecommerce_name?: string
        error?: string
      }>(res)
      if (!res.ok) throw new Error(d.error || 'Ürün okunamadı')
      setProductMainId((d.sku ?? String(row.id)).trim().slice(0, 40))
      setBarcode((d.barcode ?? d.sku ?? '').trim())
      setStockCode((d.sku ?? '').trim())
      setTitle((d.ecommerce_name ?? d.name ?? row.name).trim().slice(0, 100))
      setDescription((d.main_description ?? '').trim())
      const sale = d.ecommerce_price != null && Number(d.ecommerce_price) > 0 ? Number(d.ecommerce_price) : Number(d.price ?? row.price)
      setSalePrice(Number.isFinite(sale) ? String(sale) : '')
      setListPrice(Number.isFinite(sale) ? String(Math.round(sale * 1.08 * 100) / 100) : '')
    } catch (e) {
      toastError('Ürün', e instanceof Error ? e.message : 'Detay yüklenemedi')
    } finally {
      setDetailLoading(false)
    }
  }

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
      const n = Number(row.price)
      if (!Number.isFinite(n)) return '—'
      const sym = row.currency_symbol?.trim()
      return sym ? `${n.toLocaleString('tr-TR')} ${sym}` : n.toLocaleString('tr-TR')
    },
    [],
  )

  return (
    <PageLayout
      title="Trendyol — Master ürünler"
      description="Master stoktan Trendyol’a ürün aktarımı (createProducts). Zorunlu Trendyol alanları için modalda doğrulama yapılır."
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
              placeholder="Ad, SKU veya barkod ara…"
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
            Satıra tıklayarak Trendyol <code className="text-[11px] bg-muted px-1 rounded">createProducts</code> gövdesini
            oluşturun. Kategori özellikleri için Trendyol kategori nitelik API’sindeki{' '}
            <code className="text-[11px] bg-muted px-1 rounded">attributeId</code> /{' '}
            <code className="text-[11px] bg-muted px-1 rounded">attributeValueId</code> değerlerini JSON olarak girin.{' '}
            <a
              href="https://developers.trendyol.com/v2.0/docs/product-create-createproducts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline font-medium"
            >
              Ürün oluşturma dokümantasyonu
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
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-2 font-medium w-14">ID</th>
                    <th className="p-2 font-medium min-w-[200px]">Ad</th>
                    <th className="p-2 font-medium">SKU</th>
                    <th className="p-2 font-medium text-right">Fiyat</th>
                    <th className="p-2 font-medium text-right">Miktar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn('border-b border-border/60 hover:bg-muted/30 cursor-pointer')}
                      onClick={() => void openModal(row)}
                    >
                      <td className="p-2 tabular-nums text-muted-foreground">{row.id}</td>
                      <td className="p-2 font-medium max-w-[320px] truncate">{row.name}</td>
                      <td className="p-2 font-mono text-xs">{row.sku || '—'}</td>
                      <td className="p-2 text-right tabular-nums">{fmtPrice(row)}</td>
                      <td className="p-2 text-right tabular-nums">{row.quantity ?? '—'}</td>
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
