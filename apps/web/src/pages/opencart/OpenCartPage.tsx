import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, ChevronDown, Link2, FolderTree, Factory, SlidersHorizontal, Settings, X, Plus, Loader2, Save, Copy, Trash2, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { API_URL } from '@/lib/api'
import { usePersistedListState } from '@/hooks/usePersistedListState'

interface OcProduct {
  product_id: number
  model?: string
  sku?: string
  name?: string
  price?: number
  image?: string
  manufacturer_name?: string
  status?: number
  matched?: boolean
}

function getProductImageUrl(storeUrl: string | undefined, imagePath: string | undefined): string | null {
  if (!storeUrl?.trim() || !imagePath?.trim()) return null
  const base = storeUrl.replace(/\/+$/, '')
  return `${base}/image/${imagePath.replace(/^\/+/, '')}`
}

function OcProductImageThumb({ storeUrl, image, alt }: { storeUrl?: string; image?: string; alt?: string }) {
  const [failed, setFailed] = useState(false)
  const imgSrc = storeUrl ? getProductImageUrl(storeUrl, image) : null
  if (failed || !imgSrc) {
    return (
      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0 mx-auto" title={image || alt}>
        img
      </div>
    )
  }
  return (
    <img
      src={imgSrc}
      alt=""
      className="h-10 w-10 rounded object-cover bg-muted shrink-0 mx-auto"
      onError={() => setFailed(true)}
    />
  )
}

const TABLES_MENU = [
  { id: 'categories', label: 'Kategoriler', icon: FolderTree },
  { id: 'manufacturers', label: 'Üreticiler', icon: Factory },
  { id: 'attributes', label: 'Öznitelikler', icon: SlidersHorizontal },
  { id: 'settings', label: 'Ayarlar', icon: Settings },
] as const

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 'fit' as PageSizeValue,
  fitLimit: 10,
}

function formatPrice(price: number | undefined): string {
  if (price == null) return '—'
  return Number(price).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ProductImagesTab({
  storeUrl,
  mainImage,
  images,
}: {
  storeUrl: string
  mainImage?: string
  images: { product_image_id?: number; image: string; sort_order: number }[]
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const allImages = [
    ...(mainImage ? [{ image: mainImage, sort_order: 0 }] : []),
    ...images,
  ]
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {allImages.map((img, i) => {
          const imgPath = (img.image ?? '').trim()
          const imgSrc = storeUrl && imgPath
            ? `${storeUrl.replace(/\/+$/, '')}/image/${imgPath.replace(/^\/+/, '')}`
            : null
          return (
            <button
              key={i}
              type="button"
              onClick={() => imgSrc && setPreview(imgSrc)}
              className="h-12 w-12 rounded border bg-muted flex items-center justify-center overflow-hidden shrink-0 hover:ring-2 ring-primary"
            >
              {imgSrc ? (
                <img src={imgSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">img</span>
              )}
            </button>
          )
        })}
        {allImages.length === 0 && (
          <p className="p-4 text-muted-foreground text-center">Görsel yok</p>
        )}
      </div>
      {preview && (
        <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden">
            <img src={preview} alt="" className="w-full h-auto max-h-[80vh] object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function ProductFeaturesTab({
  attributes,
  filters,
  options,
}: {
  attributes: { attribute_id: number; name?: string; text: string }[]
  filters: { filter_id: number; name?: string }[]
  options: Record<string, unknown>[]
}) {
  const optionGroups = new Map<number, Record<string, unknown>[]>()
  for (const o of options) {
    const poId = Number(o.product_option_id ?? 0)
    if (!optionGroups.has(poId)) optionGroups.set(poId, [])
    optionGroups.get(poId)!.push(o)
  }
  return (
    <div className="space-y-4">
      {filters.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2">Filtreler</h4>
          <ul className="list-disc list-inside text-sm">
            {filters.map((f) => (
              <li key={f.filter_id}>{f.name ?? `Filtre #${f.filter_id}`}</li>
            ))}
          </ul>
        </div>
      )}
      {attributes.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2">Öznitelikler</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Öznitelik</th>
                <th className="text-left p-2">Değer</th>
              </tr>
            </thead>
            <tbody>
              {attributes.map((a, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2">{a.name ?? a.attribute_id}</td>
                  <td className="p-2">{a.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {options.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2">Seçenekler</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Seçenek</th>
                <th className="text-left p-2">Değer</th>
                <th className="text-left p-2">Stok</th>
                <th className="text-right p-2">Fiyat</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(optionGroups.entries()).flatMap(([, vals]) =>
                vals.map((v, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{String(v.option_name ?? v.option_id ?? '—')}</td>
                    <td className="p-2">{String(v.option_value_name ?? v.option_value_id ?? '—')}</td>
                    <td className="p-2">{String(v.quantity ?? '—')}</td>
                    <td className="p-2 text-right tabular-nums">{v.price_prefix === '+' ? '+' : ''}{formatPrice(Number(v.price))} ₺</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {filters.length === 0 && attributes.length === 0 && options.length === 0 && (
        <p className="p-4 text-muted-foreground text-center">Filtre, öznitelik veya seçenek yok</p>
      )}
    </div>
  )
}

const inputClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

interface OcFormData {
  name: string
  model: string
  price: string
  quantity: string
  taxClassId: string
  manufacturerId: string
  status: number
  sortOrder: number
  categories: { category_id: number; name?: string }[]
  /** Ana üründen gelen (readonly) */
  currencySymbol?: string
  taxRateDisplay?: string
}

function GenelTabFields({
  formData,
  setFormData,
  manufacturers,
  allCategories,
}: {
  formData: OcFormData
  setFormData: React.Dispatch<React.SetStateAction<OcFormData>>
  manufacturers: { manufacturer_id: number; name?: string }[]
  allCategories: { category_id: number; name?: string; parent_id?: number }[]
}) {
  const [catSearch, setCatSearch] = useState('')
  const [catPopoverOpen, setCatPopoverOpen] = useState(false)
  const [getirLoading, setGetirLoading] = useState(false)
  const { name, model, price, quantity, taxClassId, manufacturerId, categories, currencySymbol, taxRateDisplay } = formData

  const handleGetirFiyat = useCallback(async () => {
    const m = model?.trim()
    if (!m) return
    setGetirLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/products/ecommerce-price-by-sku?model=${encodeURIComponent(m)}`)
      const data = await res.json()
      if (data?.error) throw new Error(data.error)
      if (data) {
        setFormData((p) => ({
          ...p,
          price: String(data.price ?? 0),
          currencySymbol: data.currency_symbol ?? '₺',
          taxRateDisplay: data.tax_rate != null ? `%${Number(data.tax_rate)}` : undefined,
        }))
      }
    } catch {
      setFormData((p) => ({ ...p, currencySymbol: undefined, taxRateDisplay: undefined }))
    } finally {
      setGetirLoading(false)
    }
  }, [model])

  const filteredCats = allCategories.filter(
    (c) =>
      !categories.some((s) => s.category_id === c.category_id) &&
      (catSearch === '' || (c.name ?? '').toLowerCase().includes(catSearch.toLowerCase()))
  )

  const addCategory = (c: { category_id: number; name?: string }) => {
    if (!categories.some((s) => s.category_id === c.category_id)) {
      setFormData((prev) => ({ ...prev, categories: [...prev.categories, c] }))
      setCatSearch('')
      setCatPopoverOpen(false)
    }
  }

  const removeCategory = (categoryId: number) => {
    setFormData((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.category_id !== categoryId) }))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        {/* 1. Ürün adı */}
        <div className="col-span-12 space-y-2">
          <Label htmlFor="oc-name">Ürün adı</Label>
          <Input id="oc-name" value={name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="Ürün adı" />
        </div>
        {/* 2. Model (ana ürün SKU ile eşleşir) */}
        <div className="col-span-12 space-y-2">
          <Label htmlFor="oc-model">Model (Kod)</Label>
          <Input id="oc-model" value={model} onChange={(e) => setFormData((p) => ({ ...p, model: e.target.value }))} placeholder="Model" className="font-mono" />
        </div>
        {/* 3. Fiyat + Getir (bitişik) + Para birimi (readonly) + KDV (readonly) */}
        <div className="col-span-4 space-y-2">
          <Label htmlFor="oc-price">Fiyat</Label>
          <div className="flex items-center gap-0">
            <Input
              id="oc-price"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
              placeholder="0.00"
              className="rounded-r-none border-r-0 text-right tabular-nums"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-l-none border-l-0"
                  onClick={handleGetirFiyat}
                  disabled={getirLoading || !model?.trim()}
                >
                  {getirLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ana ürünlerden e-ticaret fiyatını getir</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Para birimi</Label>
          <Input value={currencySymbol ?? '—'} readOnly className="bg-muted text-muted-foreground" />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>KDV oranı</Label>
          <Input value={taxRateDisplay ?? '—'} readOnly className="bg-muted text-muted-foreground" />
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="oc-quantity">Stok</Label>
          <Input
            id="oc-quantity"
            type="number"
            value={quantity}
            onChange={(e) => setFormData((p) => ({ ...p, quantity: e.target.value }))}
            placeholder="0"
          />
        </div>
        <div className="col-span-3 space-y-2">
          <Label htmlFor="oc-tax">KDV (tax_class_id)</Label>
          <Input
            id="oc-tax"
            type="number"
            value={taxClassId}
            onChange={(e) => setFormData((p) => ({ ...p, taxClassId: e.target.value }))}
            placeholder="0"
          />
        </div>
        <div className="col-span-5 space-y-2">
          <Label htmlFor="oc-manufacturer">Üretici</Label>
          <select
            id="oc-manufacturer"
            value={manufacturerId}
            onChange={(e) => setFormData((p) => ({ ...p, manufacturerId: e.target.value }))}
            className={inputClass}
          >
            <option value="">— Seçin —</option>
            {manufacturers.map((m) => (
              <option key={m.manufacturer_id} value={m.manufacturer_id}>
                {m.name ?? `Üretici #${m.manufacturer_id}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Kategoriler</Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span
              key={c.category_id}
              className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-sm"
            >
              {c.name ?? `#${c.category_id}`}
              <button
                type="button"
                onClick={() => removeCategory(c.category_id)}
                className="rounded-full hover:bg-muted p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Popover open={catPopoverOpen} onOpenChange={setCatPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" type="button" className="h-9 gap-1">
                <Plus className="h-3.5 w-3.5" />
                Kategori ekle
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <Input
                placeholder="Kategori ara..."
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-48 overflow-auto space-y-1">
                {filteredCats.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Sonuç yok</p>
                ) : (
                  filteredCats.map((c) => (
                    <button
                      key={c.category_id}
                      type="button"
                      onClick={() => addCategory(c)}
                      className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted"
                    >
                      {c.name ?? `Kategori #${c.category_id}`}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}

function ProductDetailModalContent({
  detailProduct,
  detailData,
  storeUrl,
  onSave,
  onSaved,
}: {
  detailProduct: OcProduct
  detailData: {
    fullProduct?: Record<string, unknown>
    attributes?: { attribute_id: number; name?: string; text: string }[]
    images?: { product_image_id?: number; image: string; sort_order: number }[]
    categories?: { category_id: number; name?: string }[]
    filters?: { filter_id: number; name?: string }[]
    options?: Record<string, unknown>[]
    related?: { related_id: number; name?: string }[]
    manufacturers?: { manufacturer_id: number; name?: string }[]
    allCategories?: { category_id: number; name?: string; parent_id?: number }[]
  }
  storeUrl: string
  onSave: (data: Record<string, unknown>) => Promise<void>
  onSaved: (updatedData: Record<string, unknown>) => void
}) {
  const fp = detailData.fullProduct ?? {}
  const dp = detailProduct
  const [formData, setFormData] = useState<OcFormData>({
    name: String(fp.name ?? dp.name ?? ''),
    model: String(fp.model ?? dp.model ?? ''),
    price: String(fp.price ?? dp.price ?? ''),
    quantity: String(fp.quantity ?? ''),
    taxClassId: String(fp.tax_class_id ?? ''),
    manufacturerId: String(fp.manufacturer_id ?? ''),
    status: Number(fp.status ?? dp.status ?? 1),
    sortOrder: Number(fp.sort_order ?? 0),
    categories: detailData.categories ?? [],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fp = detailData.fullProduct ?? {}
    const dp = detailProduct
    setFormData({
      name: String(fp.name ?? dp.name ?? ''),
      model: String(fp.model ?? dp.model ?? ''),
      price: String(fp.price ?? dp.price ?? ''),
      quantity: String(fp.quantity ?? ''),
      taxClassId: String(fp.tax_class_id ?? ''),
      manufacturerId: String(fp.manufacturer_id ?? ''),
      status: Number(fp.status ?? dp.status ?? 1),
      sortOrder: Number(fp.sort_order ?? 0),
      categories: detailData.categories ?? [],
    })
  }, [detailData.fullProduct, detailData.categories, detailProduct])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: formData.name,
        model: formData.model?.trim() || undefined,
        price: formData.price ? Number(formData.price) : undefined,
        quantity: formData.quantity !== '' ? Number(formData.quantity) : undefined,
        tax_class_id: formData.taxClassId ? Number(formData.taxClassId) : undefined,
        manufacturer_id: formData.manufacturerId ? Number(formData.manufacturerId) : undefined,
        status: formData.status,
        sort_order: formData.sortOrder,
        categories: formData.categories.map((c) => c.category_id),
      }
      await onSave(payload)
      onSaved(payload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <Tabs defaultValue="genel" className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <TabsList className="shrink-0">
          <TabsTrigger value="genel">Genel</TabsTrigger>
          <TabsTrigger value="gorseller">Görseller</TabsTrigger>
          <TabsTrigger value="ozellikler">Özellikler</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="benzer">Benzer Ürünler</TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-auto mt-4 min-h-0">
          <TabsContent value="genel" className="mt-0">
            <GenelTabFields
              formData={formData}
              setFormData={setFormData}
              manufacturers={detailData.manufacturers ?? []}
              allCategories={detailData.allCategories ?? []}
            />
          </TabsContent>
          <TabsContent value="gorseller" className="mt-0">
            <ProductImagesTab
              storeUrl={storeUrl}
              mainImage={typeof detailData.fullProduct?.image === 'string' ? detailData.fullProduct.image : (typeof detailProduct?.image === 'string' ? detailProduct.image : undefined)}
              images={detailData.images ?? []}
            />
          </TabsContent>
          <TabsContent value="ozellikler" className="mt-0">
            <ProductFeaturesTab
              attributes={detailData.attributes ?? []}
              filters={detailData.filters ?? []}
              options={detailData.options ?? []}
            />
          </TabsContent>
          <TabsContent value="seo" className="mt-0">
            <ProductSeoTab fullProduct={detailData.fullProduct} />
          </TabsContent>
          <TabsContent value="benzer" className="mt-0">
            <ul className="space-y-1">
              {(detailData.related ?? []).map((r) => (
                <li key={r.related_id} className="p-2 border-b hover:bg-muted/30 cursor-pointer">
                  {r.name ?? `Ürün #${r.related_id}`}
                </li>
              ))}
              {(detailData.related ?? []).length === 0 && (
                <li className="p-4 text-muted-foreground text-center">Benzer ürün atanmamış</li>
              )}
            </ul>
          </TabsContent>
        </div>
      </Tabs>
      <DialogFooter className="flex-row justify-between gap-4 sm:justify-between pt-4 border-t shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="oc-sort" className="text-sm">Sıra</Label>
            <Input
              id="oc-sort"
              type="number"
              value={formData.sortOrder}
              onChange={(e) => setFormData((p) => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
              className="w-16 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="oc-status-switch"
              checked={!!formData.status}
              onCheckedChange={(v) => setFormData((p) => ({ ...p, status: v ? 1 : 0 }))}
            />
            <Label htmlFor="oc-status-switch" className="text-sm cursor-pointer">Aktif</Label>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button type="button" variant="outline" size="icon" disabled className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Sil</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button type="button" variant="outline" size="icon" disabled>
                  <Copy className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Kopyala</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button type="submit" variant="outline" size="icon" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Kaydet</TooltipContent>
          </Tooltip>
        </div>
      </DialogFooter>
    </form>
  )
}

function ProductSeoTab({ fullProduct }: { fullProduct?: Record<string, unknown> }) {
  const p = fullProduct ?? {}
  return (
    <div className="space-y-2 text-sm">
      <p><span className="text-muted-foreground">Adı:</span> {String(p.name ?? '—')}</p>
      <p><span className="text-muted-foreground">Açıklama:</span></p>
      <div className="text-muted-foreground border rounded p-2 max-h-24 overflow-auto text-xs">{String(p.description ?? '—')}</div>
      <p><span className="text-muted-foreground">tag:</span> {String(p.tag ?? '—')}</p>
      <p><span className="text-muted-foreground">meta_title:</span> {String(p.meta_title ?? '—')}</p>
      <p><span className="text-muted-foreground">meta_keywords:</span> {String(p.meta_keyword ?? '—')}</p>
      <p><span className="text-muted-foreground">h1:</span> {String(p.seo_h1 ?? '—')}</p>
      <p><span className="text-muted-foreground">h2:</span> {String(p.seo_h2 ?? '—')}</p>
      <p><span className="text-muted-foreground">h3:</span> {String(p.seo_h3 ?? '—')}</p>
      <p><span className="text-muted-foreground">image_title:</span> {String(p.image_title ?? '—')}</p>
      <p><span className="text-muted-foreground">image_alt:</span> {String(p.image_alt ?? '—')}</p>
      <p><span className="text-muted-foreground">bilgi:</span> {String(p.bilgi ?? '—')}</p>
    </div>
  )
}

export function OpenCartPage() {
  const contentRef = useRef<HTMLDivElement>(null)
  const [listState, setListState] = usePersistedListState('opencart-products', listDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [searchDebounced, setSearchDebounced] = useState(search)
  const [products, setProducts] = useState<OcProduct[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const limit = pageSize === 'fit' ? fitLimit : pageSize
  const hasFilter = search.length > 0

  const [tableModal, setTableModal] = useState<typeof TABLES_MENU[number]['id'] | null>(null)
  const [priceUpdateModalOpen, setPriceUpdateModalOpen] = useState(false)
  const [storeUrl, setStoreUrl] = useState('')
  const [detailProduct, setDetailProduct] = useState<OcProduct | null>(null)
  const [matchProduct, setMatchProduct] = useState<OcProduct | null>(null)
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set())
  const [detailData, setDetailData] = useState<{
    fullProduct?: Record<string, unknown>
    attributes?: { attribute_id: number; name?: string; text: string }[]
    images?: { product_image_id?: number; image: string; sort_order: number }[]
    categories?: { category_id: number; name?: string }[]
    filters?: { filter_id: number; name?: string }[]
    options?: Record<string, unknown>[]
    related?: { related_id: number; name?: string }[]
    manufacturers?: { manufacturer_id: number; name?: string }[]
    allCategories?: { category_id: number; name?: string; parent_id?: number }[]
  } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/api/app-settings?category=opencart_mysql`)
      .then((r) => r.ok ? r.json() : {})
      .then((d: { store_url?: string }) => setStoreUrl((d.store_url ?? '').trim()))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search)
      setListState({ page: 1 })
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String((page - 1) * limit))
      if (searchDebounced) params.set('search', searchDebounced)
      const res = await fetch(`${API_URL}/api/opencart-mysql/products?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ürünler yüklenemedi')
      setProducts(data.products ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bağlantı hatası')
      setProducts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, searchDebounced, limit])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const highlightProduct = useCallback((productId: number) => {
    setHighlightedIds((prev) => new Set([...prev, productId]))
    setTimeout(() => {
      setHighlightedIds((prev) => {
        const next = new Set(prev)
        next.delete(productId)
        return next
      })
    }, 2500)
  }, [])

  const openDetail = useCallback(async (p: OcProduct) => {
    setDetailProduct(p)
    setDetailData(null)
    setDetailLoading(true)
    const urls = [
      `${API_URL}/api/opencart-mysql/products/${p.product_id}`,
      `${API_URL}/api/opencart-mysql/products/${p.product_id}/attributes`,
      `${API_URL}/api/opencart-mysql/products/${p.product_id}/images`,
      `${API_URL}/api/opencart-mysql/products/${p.product_id}/categories`,
      `${API_URL}/api/opencart-mysql/products/${p.product_id}/filters`,
      `${API_URL}/api/opencart-mysql/products/${p.product_id}/options`,
      `${API_URL}/api/opencart-mysql/products/${p.product_id}/related`,
      `${API_URL}/api/opencart-mysql/manufacturers`,
      `${API_URL}/api/opencart-mysql/categories`,
    ]
    const results = await Promise.allSettled(urls.map((url) => fetch(url).then((r) => r.json())))
    const [fullData, attrData, imgData, catData, filtData, optData, relData, mfrData, allCatData] = results.map((r) =>
      r.status === 'fulfilled' ? r.value : {}
    )
    const productCats = (catData as { categories?: { category_id: number; name?: string }[] })?.categories ?? []
    const allCats = (allCatData as { categories?: { category_id: number; name?: string }[] })?.categories ?? []
    const catById = new Map(allCats.map((ac) => [ac.category_id, ac]))
    setDetailData({
      fullProduct: fullData && typeof fullData === 'object' && !('error' in fullData) ? fullData : {},
      attributes: ((attrData as { attributes?: { attribute_id: number; name?: string; text: string }[] })?.attributes ?? []) as { attribute_id: number; name?: string; text: string }[],
      images: ((imgData as { images?: { product_image_id?: number; image: string; sort_order: number }[] })?.images ?? []) as { product_image_id?: number; image: string; sort_order: number }[],
      categories: productCats.map((c) => ({
        category_id: c.category_id,
        name: c.name ?? catById.get(c.category_id)?.name,
      })),
      filters: ((filtData as { filters?: { filter_id: number; name?: string }[] })?.filters ?? []) as { filter_id: number; name?: string }[],
      options: ((optData as { options?: Record<string, unknown>[] })?.options ?? []) as Record<string, unknown>[],
      related: ((relData as { related?: { related_id: number; name?: string }[] })?.related ?? []) as { related_id: number; name?: string }[],
      manufacturers: ((mfrData as { manufacturers?: { manufacturer_id: number; name?: string }[] })?.manufacturers ?? []) as { manufacturer_id: number; name?: string }[],
      allCategories: ((allCatData as { categories?: { category_id: number; name?: string; parent_id?: number }[] })?.categories ?? []) as { category_id: number; name?: string; parent_id?: number }[],
    })
    setDetailLoading(false)
  }, [])

  return (
    <PageLayout
      title="OpenCart"
      description="OpenCart veritabanı ürün listesi"
      backTo="/"
      showRefresh
      onRefresh={fetchProducts}
      contentRef={contentRef}
      headerActions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => setPriceUpdateModalOpen(true)}>
            Fiyat güncelle
          </Button>
          <div className="flex items-center gap-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ad veya model ara..."
                value={search}
                onChange={(e) => setListState({ search: e.target.value })}
                className="pl-8 w-56 h-9"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setListState({ search: '', page: 1 })}
                  className={`h-9 w-9 shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Arama ve filtreleri sıfırla</TooltipContent>
            </Tooltip>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1">
                Diğer Tablolar
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {TABLES_MENU.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem key={item.id} onClick={() => setTableModal(item.id)}>
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
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
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-center p-2 font-medium w-16">Görsel</th>
                  <th className="text-left p-2 font-medium min-w-[100px]">Model</th>
                  <th className="text-left p-2 font-medium min-w-[140px]">Ad</th>
                  <th className="text-right p-2 font-medium min-w-[100px]">Fiyat</th>
                  <th className="text-center p-2 font-medium w-16">Eşleşme</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-destructive">
                      {error}
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Ürün bulunamadı.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr
                      key={p.product_id}
                      className={cn(
                        'border-b hover:bg-muted/30 cursor-pointer transition-colors duration-500',
                        p.matched && 'bg-primary/5',
                        highlightedIds.has(p.product_id) && 'animate-row-highlight'
                      )}
                      onClick={() => openDetail(p)}
                    >
                      <td className="p-2 text-center">
                        <OcProductImageThumb storeUrl={storeUrl} image={p.image} alt={p.name} />
                      </td>
                      <td className="p-2 font-mono text-muted-foreground">{p.model ?? '—'}</td>
                      <td className="p-2 font-medium">{p.name ?? '—'}</td>
                      <td className="p-2 text-right font-bold tabular-nums whitespace-nowrap">
                        {formatPrice(p.price)} ₺
                      </td>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {p.matched ? (
                          <span title="Ana ürünle eşleşiyor">
                            <Link2 className="h-4 w-4 text-green-600 inline-block" />
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setMatchProduct(p)}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Eşleştir
                          </Button>
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

      {/* Tablo modalleri */}
      <TableModal
        type={tableModal}
        open={!!tableModal}
        onClose={() => setTableModal(null)}
      />

      {/* Ürün detay modal */}
      <Dialog open={!!detailProduct} onOpenChange={(open) => {
        if (!open) {
          setDetailProduct(null)
          setDetailData(null)
        }
      }}>
        <DialogContent className="max-w-4xl h-[72vh] overflow-hidden flex flex-col gap-4 p-6">
          <DialogHeader className="shrink-0 space-y-1.5">
            <DialogTitle>
              {String(detailData?.fullProduct?.name ?? detailProduct?.name ?? 'Ürün Detayı')}{' '}
              {detailProduct?.model && `(${detailProduct.model})`}
            </DialogTitle>
            <DialogDescription>Ürün bilgilerini düzenleyin.</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>
          ) : detailData && detailProduct ? (
            <ProductDetailModalContent
              detailProduct={detailProduct!}
              detailData={detailData}
              storeUrl={storeUrl}
              onSave={async (data) => {
                const res = await fetch(`${API_URL}/api/opencart-mysql/products/${detailProduct!.product_id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                })
                if (!res.ok) {
                  const err = await res.json()
                  throw new Error(err.error || 'Kaydetme başarısız')
                }
              }}
              onSaved={(updatedData) => {
                const pid = detailProduct!.product_id
                setProducts((prev) =>
                  prev.map((p) =>
                    p.product_id === pid
                      ? {
                          ...p,
                          name: (updatedData.name as string) ?? p.name,
                          model: (updatedData.model as string) ?? p.model,
                          price: (updatedData.price as number) ?? p.price,
                        }
                      : p
                  )
                )
                highlightProduct(pid)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Eşleştir modal */}
      <MatchProductModal
        open={!!matchProduct}
        ocProduct={matchProduct}
        onClose={() => setMatchProduct(null)}
        onMatched={(productId, mainModel) => {
          if (matchProduct) {
            setProducts((prev) =>
              prev.map((p) =>
                p.product_id === productId ? { ...p, matched: true, model: mainModel ?? p.model } : p
              )
            )
            highlightProduct(productId)
          }
          setMatchProduct(null)
        }}
      />

      {/* Fiyat güncelle modal */}
      <PriceUpdateModal
        open={priceUpdateModalOpen}
        onClose={() => setPriceUpdateModalOpen(false)}
        onComplete={() => {
          setPriceUpdateModalOpen(false)
          fetchProducts()
        }}
      />
    </PageLayout>
  )
}

function PriceUpdateModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean
  onClose: () => void
  onComplete: () => void
}) {
  const [percentage, setPercentage] = useState<string>('0')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ updated: number; failed: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleStart = useCallback(async () => {
    const pct = parseFloat(percentage)
    if (Number.isNaN(pct) || pct < -100 || pct > 500) {
      setError('Geçersiz yüzde (-100 ile 500 arası girin)')
      return
    }
    setError(null)
    setResult(null)
    setRunning(true)
    try {
      const res = await fetch(`${API_URL}/api/opencart-mysql/products/bulk-update-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentage: pct }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Güncelleme başarısız')
      setResult(data)
      if (data.updated > 0) {
        setTimeout(() => onComplete(), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Güncelleme başarısız')
    } finally {
      setRunning(false)
    }
  }, [percentage, onComplete])

  useEffect(() => {
    if (!open) {
      setPercentage('0')
      setResult(null)
      setError(null)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fiyat güncelle</DialogTitle>
          <DialogDescription>
            Ana ürünlerden e-ticaret fiyatlarını alıp yüzde uygulayarak OpenCart fiyatlarını günceller. Sadece model (ana ürün SKU ile eşleşen) ürünler güncellenir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="price-update-pct">Güncelleme yüzdesi</Label>
            <div className="flex items-center gap-2">
              <Input
                id="price-update-pct"
                type="number"
                step="0.5"
                min={-100}
                max={500}
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="0"
                className="text-right tabular-nums w-24"
                disabled={running}
              />
              <span className="text-muted-foreground">%</span>
              <span className="text-sm text-muted-foreground">
                ({Number(percentage) >= 0 ? '+' : ''}{percentage}% uygulanacak)
              </span>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium">Güncelleme tamamlandı</p>
              <p>Güncellenen: {result.updated}</p>
              <p>Eşleşmeyen (atlandı): {result.failed}</p>
              <p>Toplam: {result.total}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            İptal
          </Button>
          <Button onClick={handleStart} disabled={running} className="gap-2">
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            Başlat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface MainProduct {
  id: number
  name: string
  sku: string | null
  barcode: string | null
  brand_name: string | null
}

function MatchProductModal({
  open,
  ocProduct,
  onClose,
  onMatched,
}: {
  open: boolean
  ocProduct: OcProduct | null
  onClose: () => void
  onMatched: (productId: number, mainSku?: string) => void
}) {
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [suggestions, setSuggestions] = useState<MainProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [matching, setMatching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSearchDebounced('')
    setSuggestions([])
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    if (!open || !searchDebounced.trim()) {
      setSuggestions([])
      return
    }
    setLoading(true)
    fetch(`${API_URL}/api/products/search-by-name?q=${encodeURIComponent(searchDebounced)}&limit=20`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setSuggestions(d.products ?? [])
      })
      .catch((e) => {
        setError(e.message || 'Arama başarısız')
        setSuggestions([])
      })
      .finally(() => setLoading(false))
  }, [open, searchDebounced])

  const handleSelect = async (p: MainProduct) => {
    if (!ocProduct || !p.sku) return
    setMatching(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/opencart-mysql/products/${ocProduct.product_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.sku }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Eşleştirme başarısız')
      onMatched(ocProduct.product_id, p.sku ?? undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eşleştirme başarısız')
    } finally {
      setMatching(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ana ürünle eşleştir</DialogTitle>
          <DialogDescription>
            {ocProduct?.name} — {ocProduct?.model ?? 'Model yok'}. Ürün adını kelime kelime yazarak arayın.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Ürün adı (örn: laptop msi)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="max-h-64 overflow-y-auto border rounded-md">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground text-sm">Aranıyor...</div>
            ) : suggestions.length === 0 && searchDebounced ? (
              <div className="p-4 text-center text-muted-foreground text-sm">Sonuç bulunamadı.</div>
            ) : (
              <ul className="divide-y">
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors disabled:opacity-50"
                      onClick={() => handleSelect(p)}
                      disabled={matching || !p.sku}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Model: {p.sku ?? '—'} {p.brand_name && `• ${p.brand_name}`}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TableModal({
  type,
  open,
  onClose,
}: {
  type: typeof TABLES_MENU[number]['id'] | null
  open: boolean
  onClose: () => void
}) {
  const [data, setData] = useState<unknown[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !type) return
    setLoading(true)
    setError(null)
    const endpoint =
      type === 'categories' ? '/api/opencart-mysql/categories' :
      type === 'manufacturers' ? '/api/opencart-mysql/manufacturers' :
      type === 'attributes' ? '/api/opencart-mysql/attributes' :
      null
    if (!endpoint) {
      setLoading(false)
      if (type === 'settings') {
        setData([])
        setError('Ayarlar modalı henüz yapılandırılmadı.')
      }
      return
    }
    fetch(`${API_URL}${endpoint}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) {
          throw new Error(d.error || `HTTP ${r.status}`)
        }
        const arr = d.categories ?? d.manufacturers ?? d.attributes ?? []
        setData(Array.isArray(arr) ? arr : [])
      })
      .catch((e) => {
        setError(e.message || 'Yüklenemedi')
        setData([])
      })
      .finally(() => setLoading(false))
  }, [open, type])

  const title =
    type === 'categories' ? 'Kategoriler' :
    type === 'manufacturers' ? 'Üreticiler' :
    type === 'attributes' ? 'Öznitelikler' :
    type === 'settings' ? 'Ayarlar' : ''

  const columns = type === 'manufacturers'
    ? ['manufacturer_id', 'name', 'sort_order']
    : type === 'attributes'
    ? ['attribute_id', 'name']
    : []

  // Kategoriler için hiyerarşik liste
  const buildCategoryTree = (items: { category_id: number; parent_id?: number; name?: string; status?: number }[]) => {
    const byParent = new Map<number, typeof items>()
    for (const item of items) {
      const pid = Number(item.parent_id ?? 0)
      if (!byParent.has(pid)) byParent.set(pid, [])
      byParent.get(pid)!.push(item)
    }
    const render = (parentId: number, level: number): JSX.Element[] => {
      const children = byParent.get(parentId) ?? []
      return children.flatMap((c) => [
        <tr key={c.category_id} className="border-b">
          <td className="p-2 font-mono text-muted-foreground w-16">{c.category_id}</td>
          <td className="p-2" style={{ paddingLeft: `${12 + level * 16}px` }}>
            {level > 0 && <span className="text-muted-foreground mr-1">└</span>}
            {c.name ?? '—'}
          </td>
          <td className="p-2 text-muted-foreground">{c.parent_id ?? 0}</td>
          <td className="p-2">{c.status ? 'Aktif' : 'Pasif'}</td>
        </tr>,
        ...render(c.category_id, level + 1),
      ])
    }
    return render(0, 0)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {type === 'settings' ? (
          <p className="text-sm text-muted-foreground py-4">
            Ayarlar sayfası (store_url, language_id, database) henüz bu modalda yok. Ayarlar menüsünden yapılandırın.
          </p>
        ) : loading ? (
          <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>
        ) : error ? (
          <p className="text-destructive py-4">{error}</p>
        ) : type === 'categories' ? (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium w-16">ID</th>
                  <th className="text-left p-2 font-medium">Ad</th>
                  <th className="text-left p-2 font-medium w-16">Üst</th>
                  <th className="text-left p-2 font-medium w-16">Durum</th>
                </tr>
              </thead>
              <tbody>
                {buildCategoryTree(data as { category_id: number; parent_id?: number; name?: string; status?: number }[])}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {columns.map((col) => (
                    <th key={col} className="text-left p-2 font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data as Record<string, unknown>[]).map((row, i) => (
                  <tr key={i} className="border-b">
                    {columns.map((col) => (
                      <td key={col} className="p-2">{String(row[col] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
