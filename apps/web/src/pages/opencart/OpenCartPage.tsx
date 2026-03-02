import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, Plus, X, Trash2, Copy, Save, SlidersHorizontal, ChevronDown, FolderTree, Factory, Filter, Layers, ToggleLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL } from '@/lib/api'
import {
  fetchOpenCartProducts,
  fetchOpenCartCategories,
  fetchOpenCartManufacturers,
  fetchOpenCartFilters,
  fetchOpenCartAttributes,
  fetchOpenCartOptions,
  opencartPost,
  opencartPut,
  opencartDelete,
  getOpenCartProductName,
  type OpenCartProduct,
} from '@/lib/opencart'

const listDefaults = { search: '', page: 1, pageSize: 'fit' as PageSizeValue, fitLimit: 10 }

type ParamModal = 'categories' | 'manufacturers' | 'filters' | 'attributes' | 'options' | null

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

export function OpenCartPage() {
  const [listState, setListState] = usePersistedListState('opencart-products', listDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [products, setProducts] = useState<OpenCartProduct[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [paramModal, setParamModal] = useState<ParamModal>(null)
  const [paramData, setParamData] = useState<Record<string, unknown>[]>([])
  const [paramLoading, setParamLoading] = useState(false)
  const [paramSaving, setParamSaving] = useState(false)
  const [paramEditItem, setParamEditItem] = useState<Record<string, unknown> | null>(null)
  const [paramForm, setParamForm] = useState<Record<string, unknown>>({})
  const [productDetailModal, setProductDetailModal] = useState<OpenCartProduct | null>(null)
  const [productForm, setProductForm] = useState<Partial<OpenCartProduct>>({})
  const [productSaving, setProductSaving] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchOpenCartProducts({ page, limit, search: search || undefined })
      const raw = res.products ?? (res as { data?: unknown }).data ?? res
      const list = toArray(Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.products ?? raw)
      const cnt = (res as { total?: number }).total ?? list.length
      setProducts(list)
      setTotal(typeof cnt === 'number' ? cnt : list.length)
      setLoadError(null)
    } catch (err) {
      setProducts([])
      setTotal(0)
      const msg = err instanceof Error ? err.message : 'Ürünler yüklenemedi'
      setLoadError(msg)
      toastError('Yükleme hatası', msg)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const handleRefresh = () => {
    setListState({ search: '', page: 1 })
    setLoadError(null)
    fetchProducts()
  }

  const handleReset = () => setListState({ search: '', page: 1 })

  const getParamConfig = () => {
    switch (paramModal) {
      case 'categories':
        return {
          title: 'Kategoriler',
          path: 'category_admin/category',
          nameKey: 'name',
          listKey: 'categories',
          fetchFn: fetchOpenCartCategories,
        }
      case 'manufacturers':
        return {
          title: 'Üreticiler',
          path: 'manufacturer_admin/manufacturer',
          nameKey: 'name',
          listKey: 'manufacturers',
          fetchFn: fetchOpenCartManufacturers,
        }
      case 'filters':
        return {
          title: 'Filtreler',
          path: 'filter_admin/filter',
          nameKey: 'name',
          listKey: 'filters',
          fetchFn: fetchOpenCartFilters,
        }
      case 'attributes':
        return {
          title: 'Özellikler',
          path: 'attribute_admin/attribute',
          nameKey: 'name',
          listKey: 'attributes',
          fetchFn: fetchOpenCartAttributes,
        }
      case 'options':
        return {
          title: 'Seçenekler',
          path: 'option_admin/option',
          nameKey: 'name',
          listKey: 'options',
          fetchFn: fetchOpenCartOptions,
        }
      default:
        return null
    }
  }

  const fetchParamData = useCallback(async () => {
    const cfg = getParamConfig()
    if (!cfg || !paramModal) return
    setParamLoading(true)
    try {
      const res = await cfg.fetchFn({ limit: 999 })
      const raw = (res as Record<string, unknown>)[cfg.listKey] ?? (res as { data?: unknown }).data ?? res
      const list = toArray(Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.[cfg.listKey] ?? raw) as Record<string, unknown>[]
      setParamData(list)
    } catch (err) {
      setParamData([])
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Veri yüklenemedi')
    } finally {
      setParamLoading(false)
    }
  }, [paramModal])

  useEffect(() => {
    if (paramModal) fetchParamData()
  }, [paramModal, fetchParamData])

  const openParamNew = () => {
    const cfg = getParamConfig()
    setParamEditItem(null)
    setParamForm({ [cfg?.nameKey ?? 'name']: '', sort_order: 0, status: 1 })
  }

  const openParamEdit = (item: Record<string, unknown>) => {
    setParamEditItem(item)
    setParamForm({ ...item })
  }

  const closeParamModal = () => {
    setParamModal(null)
    setParamEditItem(null)
    setParamForm({})
  }

  const handleParamCopy = () => {
    setParamEditItem(null)
    const name = String(paramForm[getParamConfig()?.nameKey ?? 'name'] ?? '')
    setParamForm((f) => ({ ...f, [getParamConfig()?.nameKey ?? 'name']: name ? name + ' (kopya)' : '' }))
  }

  const handleParamSave = async () => {
    const cfg = getParamConfig()
    if (!cfg) return
    const nameKey = cfg.nameKey
    const name = String(paramForm[nameKey] ?? '').trim()
    if (!name) {
      toastError('Hata', 'Ad alanı zorunludur')
      return
    }
    setParamSaving(true)
    try {
      const idKey = cfg.path.includes('category') ? 'category_id' : cfg.path.includes('manufacturer') ? 'manufacturer_id' : cfg.path.includes('filter') ? 'filter_id' : cfg.path.includes('attribute') ? 'attribute_id' : 'option_id'
      const id = paramEditItem?.[idKey] ?? paramEditItem?.id
      const body = { ...paramForm }
      if (id) {
        await opencartPut(cfg.path, id as number, body)
        toastSuccess('Güncellendi', `${cfg.title} kaydı güncellendi`)
      } else {
        await opencartPost(cfg.path, body)
        toastSuccess('Eklendi', `Yeni ${cfg.title.toLowerCase()} eklendi`)
      }
      fetchParamData()
      closeParamModal()
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setParamSaving(false)
    }
  }

  const handleParamDelete = async (item: Record<string, unknown>) => {
    const cfg = getParamConfig()
    if (!cfg || !confirm('Bu kaydı silmek istediğinize emin misiniz?')) return
    const idKey = cfg.path.includes('category') ? 'category_id' : cfg.path.includes('manufacturer') ? 'manufacturer_id' : cfg.path.includes('filter') ? 'filter_id' : cfg.path.includes('attribute') ? 'attribute_id' : 'option_id'
    const id = item[idKey] ?? item.id
    if (id == null) return
    try {
      await opencartDelete(cfg.path, id as number)
      toastSuccess('Silindi', 'Kayıt silindi')
      fetchParamData()
      if (paramEditItem && (paramEditItem[idKey] ?? paramEditItem.id) === id) closeParamModal()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  const paramIdKey = paramModal === 'categories' ? 'category_id' : paramModal === 'manufacturers' ? 'manufacturer_id' : paramModal === 'filters' ? 'filter_id' : paramModal === 'attributes' ? 'attribute_id' : 'option_id'
  const paramNameKey = getParamConfig()?.nameKey ?? 'name'

  const openProductDetail = (p: OpenCartProduct) => {
    setProductDetailModal(p)
    setProductForm({
      name: getOpenCartProductName(p),
      model: p.model,
      sku: p.sku,
      price: p.price,
      quantity: p.quantity,
      status: p.status,
      sort_order: p.sort_order,
    })
  }

  const closeProductDetail = () => {
    setProductDetailModal(null)
    setProductForm({})
  }

  const handleProductSave = async () => {
    if (!productDetailModal?.product_id || productSaving) return
    setProductSaving(true)
    try {
      const pd = productDetailModal.product_description
      const productDescription: Record<string, { name?: string; description?: string; meta_title?: string; meta_description?: string; meta_keyword?: string }> = {}
      if (pd && typeof pd === 'object') {
        for (const [langId, desc] of Object.entries(pd)) {
          if (desc && typeof desc === 'object') {
            productDescription[langId] = { ...desc, name: productForm.name ?? desc.name }
          }
        }
      }
      if (Object.keys(productDescription).length === 0 && productForm.name) {
        productDescription['1'] = { name: productForm.name }
      }
      const body: Record<string, unknown> = {
        model: productForm.model,
        sku: productForm.sku,
        price: productForm.price,
        quantity: productForm.quantity,
        status: productForm.status,
        sort_order: productForm.sort_order,
      }
      if (Object.keys(productDescription).length > 0) {
        body.product_description = productDescription
      }
      await opencartPut('product_admin/product', productDetailModal.product_id, body)
      toastSuccess('Güncellendi', 'Ürün bilgileri kaydedildi')
      fetchProducts()
      closeProductDetail()
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setProductSaving(false)
    }
  }

  return (
    <PageLayout
      title="OpenCart"
      description="OpenCart mağaza ürünleri ve parametreleri"
      backTo="/ayarlar/entegrasyonlar"
      contentRef={contentRef}
      showRefresh
      onRefresh={handleRefresh}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ara..."
              value={search}
              onChange={(e) => setListState({ search: e.target.value, page: 1 })}
              className="pl-8 w-48 h-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                Parametreler
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setParamModal('categories')} className="gap-2">
                <FolderTree className="h-4 w-4" />
                Kategoriler
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setParamModal('manufacturers')} className="gap-2">
                <Factory className="h-4 w-4" />
                Üreticiler
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setParamModal('filters')} className="gap-2">
                <Filter className="h-4 w-4" />
                Filtreler
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setParamModal('attributes')} className="gap-2">
                <Layers className="h-4 w-4" />
                Özellikler
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setParamModal('options')} className="gap-2">
                <ToggleLeft className="h-4 w-4" />
                Seçenekler
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {hasFilter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleReset}>
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filtreleri sıfırla</TooltipContent>
            </Tooltip>
          )}
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
      {loadError && (
        <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <p className="font-medium mb-1">Bağlantı hatası</p>
          <p className="text-sm mb-2">{loadError}</p>
          <Link to="/ayarlar/entegrasyonlar" className="text-sm font-medium underline hover:no-underline">
            Ayarlar › Entegrasyonlar › OpenCart
          </Link>
          <span className="text-sm"> üzerinden API formatı (/api/rest_admin/) ve Secret Key kontrol edin.</span>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Görsel</th>
                  <th className="text-left p-3 font-medium">Ürün Adı</th>
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-right p-3 font-medium">Fiyat</th>
                  <th className="text-right p-3 font-medium">Stok</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center">
                      <p className="text-muted-foreground mb-2">Ürün bulunamadı veya bağlantı kurulamadı.</p>
                      <Link
                        to="/ayarlar/entegrasyonlar"
                        className="text-sm text-primary hover:underline"
                      >
                        Ayarlar › Entegrasyonlar › OpenCart
                      </Link>
                      <span className="text-muted-foreground text-sm"> üzerinden mağaza URL, API formatı (/api/rest_admin/) ve Secret Key yapılandırın.</span>
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr
                      key={p.product_id ?? p.model ?? Math.random()}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => openProductDetail(p)}
                    >
                      <td className="p-3">
                        {p.image ? (
                          <img
                            src={p.image.startsWith('http') ? p.image : `${API_URL}/api/opencart-image?path=${encodeURIComponent(p.image!)}`}
                            alt=""
                            className="h-10 w-10 object-contain rounded bg-muted"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted" />
                        )}
                      </td>
                      <td className="p-3 font-medium">{getOpenCartProductName(p) || p.model || '—'}</td>
                      <td className="p-3">{p.model ?? '—'}</td>
                      <td className="p-3">{p.sku ?? '—'}</td>
                      <td className="p-3 text-right">{p.price != null ? Number(p.price).toLocaleString('tr-TR') : '—'}</td>
                      <td className="p-3 text-right">{p.quantity ?? '—'}</td>
                      <td className="p-3">{p.status ? 'Aktif' : 'Pasif'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Ürün detay modal */}
      <Dialog open={!!productDetailModal} onOpenChange={(open) => !open && closeProductDetail()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ürün Detayı</DialogTitle>
            <DialogDescription>
              Ürün bilgilerini görüntüleyin ve güncelleyin.
            </DialogDescription>
          </DialogHeader>
          {productDetailModal && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="shrink-0">
                  {productDetailModal.image ? (
                    <img
                      src={productDetailModal.image.startsWith('http') ? productDetailModal.image : `${API_URL}/api/opencart-image?path=${encodeURIComponent(productDetailModal.image)}`}
                      alt=""
                      className="h-20 w-20 object-contain rounded bg-muted"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded bg-muted" />
                  )}
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <div className="space-y-2">
                    <Label>Ürün Adı</Label>
                    <Input
                      value={productForm.name ?? ''}
                      onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Ürün adı"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Model</Label>
                      <Input
                        value={productForm.model ?? ''}
                        onChange={(e) => setProductForm((f) => ({ ...f, model: e.target.value }))}
                        placeholder="Model"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <Input
                        value={productForm.sku ?? ''}
                        onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                        placeholder="SKU"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Fiyat</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={productForm.price ?? ''}
                        onChange={(e) => setProductForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Stok</Label>
                      <Input
                        type="number"
                        value={productForm.quantity ?? ''}
                        onChange={(e) => setProductForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!productForm.status}
                      onCheckedChange={(v) => setProductForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                    />
                    <Label>Aktif</Label>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex-row justify-between gap-4 sm:justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">Sıra</Label>
                  <Input
                    type="number"
                    className="w-20"
                    value={productForm.sort_order ?? 0}
                    onChange={(e) => setProductForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" onClick={closeProductDetail} disabled={productSaving}>
                    Kapat
                  </Button>
                  <Button variant="save" onClick={handleProductSave}>
                    <Save className="h-4 w-4 mr-1.5" />
                    {productSaving ? 'Kaydediliyor...' : 'Kaydet'}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Parametre modalları */}
      {paramModal && (
        <Dialog open={!!paramModal} onOpenChange={(open) => !open && closeParamModal()}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{getParamConfig()?.title}</DialogTitle>
              <DialogDescription>
                {getParamConfig()?.title} listesi. Düzenlemek için satıra tıklayın, yeni eklemek için + butonunu kullanın.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={openParamNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Yeni
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                {paramLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>
                ) : paramData.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">Kayıt bulunamadı</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Ad</th>
                        <th className="text-left p-2 font-medium">Sıra</th>
                        <th className="text-left p-2 font-medium">Durum</th>
                        <th className="w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {paramData.map((item) => (
                        <tr
                          key={String(item[paramIdKey] ?? item.id ?? Math.random())}
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => openParamEdit(item)}
                        >
                          <td className="p-2">
                            {(() => {
                              const v = item[paramNameKey]
                              if (v == null) return '—'
                              if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                                const vals = Object.values(v) as string[]
                                return vals[0] ?? '—'
                              }
                              return String(v)
                            })()}
                          </td>
                          <td className="p-2">{typeof item.sort_order === 'number' ? item.sort_order : '—'}</td>
                          <td className="p-2">{item.status ? 'Aktif' : 'Pasif'}</td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleParamDelete(item)
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sil</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {(paramEditItem || Object.keys(paramForm).length > 0) && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">
                      {paramEditItem ? 'Düzenle' : 'Yeni Ekle'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Ad</Label>
                      <Input
                        value={String(paramForm[paramNameKey] ?? '')}
                        onChange={(e) => setParamForm((f) => ({ ...f, [paramNameKey]: e.target.value }))}
                        placeholder="Ad girin"
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="space-y-2">
                        <Label>Sıra</Label>
                        <Input
                          type="number"
                          value={Number(paramForm.sort_order ?? 0)}
                          onChange={(e) => setParamForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                          className="w-20"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!paramForm.status}
                          onCheckedChange={(v) => setParamForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                        />
                        <Label>Aktif</Label>
                      </div>
                    </div>
                    <DialogFooter className="flex-row justify-between gap-4 sm:justify-between pt-4">
                      <div />
                      <div className="flex gap-1">
                        {paramEditItem && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleParamDelete(paramEditItem)}
                                disabled={paramSaving}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Sil</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={handleParamCopy} disabled={paramSaving}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Kopyala</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="save" size="icon" onClick={handleParamSave} disabled={paramSaving}>
                              <Save className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Kaydet</TooltipContent>
                        </Tooltip>
                      </div>
                    </DialogFooter>
                  </CardContent>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageLayout>
  )
}
