import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Plus, X, Trash2, Copy, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ImageInput, getImageDisplayUrl } from '@/components/ImageInput'
import { CategorySelect, type CategoryItem } from '@/components/CategorySelect'
import { Switch } from '@/components/ui/switch'
import { toastSuccess, toastError } from '@/lib/toast'

import { API_URL } from '@/lib/api'

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
  image?: string
  tax_rate?: number
  supplier_code?: string
  gtip_code?: string
  sort_order: number
  status?: number
  brand_name?: string
  category_name?: string
  type_name?: string
  unit_name?: string
  currency_symbol?: string
}

interface SelectOption {
  id: number
  name: string
}

const emptyForm = {
  name: '',
  sku: '',
  barcode: '',
  brand_id: '' as number | '',
  category_id: '' as number | '',
  type_id: '' as number | '',
  unit_id: '' as number | '',
  currency_id: '' as number | '',
  price: 0,
  quantity: 0,
  image: '',
  tax_rate: 0,
  supplier_code: '',
  gtip_code: '',
  sort_order: 0,
  status: 1,
}

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [brands, setBrands] = useState<SelectOption[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [types, setTypes] = useState<SelectOption[]>([])
  const [units, setUnits] = useState<SelectOption[]>([])
  const [currencies, setCurrencies] = useState<SelectOption[]>([])

  const [pageSize, setPageSize] = useState<PageSizeValue>('fit')
  const [fitLimit, setFitLimit] = useState(10)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchOptions = useCallback(async () => {
    try {
      const [bRes, cRes, tRes, uRes, curRes] = await Promise.all([
        fetch(`${API_URL}/api/product-brands?limit=9999`),
        fetch(`${API_URL}/api/product-categories?limit=9999`),
        fetch(`${API_URL}/api/product-types?limit=9999`),
        fetch(`${API_URL}/api/product-units?limit=9999`),
        fetch(`${API_URL}/api/product-currencies?limit=9999`),
      ])
      const b = await bRes.json()
      const c = await cRes.json()
      const t = await tRes.json()
      const u = await uRes.json()
      const cur = await curRes.json()
      setBrands((b.data || []).map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })))
      const catData = Array.isArray(c.data) ? c.data : []
      setCategories(
        catData.map((x: { id: number; name: string; code?: string; group_id?: number | null; category_id?: number | null }) => ({
          id: x.id,
          name: x.name,
          code: x.code || '',
          group_id: x.group_id,
          category_id: x.category_id,
        }))
      )
      setTypes((t.data || []).map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })))
      setUnits((u.data || []).map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })))
      setCurrencies((cur.data || []).map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })))
    } catch (err) {
      console.error('fetchOptions:', err)
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
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
      setLoading(false)
    }
  }, [page, search, limit])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setSearch('')
    setPage(1)
    fetchData()
  }

  const handleReset = () => {
    setSearch('')
    setPage(1)
  }

  async function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/products/next-sort-order`)
      const json = await res.json()
      if (res.ok && json.next != null) setForm((f) => ({ ...f, sort_order: json.next }))
    } catch { /* ignore */ }
  }

  function openEdit(item: Product) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      sku: item.sku || '',
      barcode: item.barcode || '',
      brand_id: item.brand_id ?? '',
      category_id: item.category_id ?? '',
      type_id: item.type_id ?? '',
      unit_id: item.unit_id ?? '',
      currency_id: item.currency_id ?? '',
      price: item.price ?? 0,
      quantity: item.quantity ?? 0,
      image: item.image || '',
      tax_rate: item.tax_rate ?? 0,
      supplier_code: item.supplier_code || '',
      gtip_code: item.gtip_code || '',
      sort_order: item.sort_order ?? 0,
      status: item.status ?? 1,
    })
    setModalOpen(true)
  }

  function handleCopy() {
    setEditingId(null)
    setForm((f) => ({ ...f, name: f.name + ' (kopya)', sku: '' }))
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `${API_URL}/api/products/${editingId}` : `${API_URL}/api/products`
      const method = editingId ? 'PUT' : 'POST'
      const body = {
        ...form,
        brand_id: form.brand_id || undefined,
        category_id: form.category_id || undefined,
        type_id: form.type_id || undefined,
        unit_id: form.unit_id || undefined,
        currency_id: form.currency_id || undefined,
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Ürün güncellendi' : 'Ürün eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, onSuccess?: () => void) {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/products/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Ürün silindi', 'Ürün başarıyla silindi.')
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  return (
    <PageLayout
      title="Ürünler"
      description="Ürün listesini yönetin"
      backTo="/"
      contentRef={contentRef}
      showRefresh
      onRefresh={handleRefresh}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ad, SKU veya barkod ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-56 h-9"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={openNew}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni ürün</TooltipContent>
          </Tooltip>
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
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s)
            setPage(1)
          }}
          onFitLimitChange={setFitLimit}
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
                  <th className="text-left p-3 font-medium">Görsel</th>
                  <th className="text-left p-3 font-medium">Ürün Adı</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-left p-3 font-medium">Marka</th>
                  <th className="text-left p-3 font-medium">Kategori</th>
                  <th className="text-right p-3 font-medium">Fiyat</th>
                  <th className="text-right p-3 font-medium">Miktar</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
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
                      <td className="p-3">
                        {item.image ? (
                          <div
                            className="h-10 w-10 rounded bg-white border shrink-0"
                            style={{
                              backgroundImage: `url(${getImageDisplayUrl(item.image)})`,
                              backgroundSize: 'contain',
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'center',
                            }}
                            role="img"
                            aria-label=""
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3">{item.sku || '—'}</td>
                      <td className="p-3">{item.brand_name || '—'}</td>
                      <td className="p-3">{item.category_name || '—'}</td>
                      <td className="p-3 text-right">
                        {item.price != null
                          ? `${item.price.toLocaleString('tr-TR')} ${item.currency_symbol || ''}`.trim()
                          : '—'}
                      </td>
                      <td className="p-3 text-right">
                        {item.quantity != null ? item.quantity.toLocaleString('tr-TR') : '—'}
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Ürün Düzenle' : 'Yeni Ürün'}</DialogTitle>
            <DialogDescription>
              Ürün bilgilerini girin. Marka, kategori ve diğer alanlar parametrelerden seçilir.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Tabs defaultValue="genel" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="genel">Genel</TabsTrigger>
                <TabsTrigger value="fiyat">Fiyat & Stok</TabsTrigger>
                <TabsTrigger value="gorsel">Görsel</TabsTrigger>
                <TabsTrigger value="diger">Diğer</TabsTrigger>
              </TabsList>
              <TabsContent value="genel" className="space-y-4 mt-4">
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="brand">Marka</Label>
                    <select
                      id="brand"
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
                    <Input
                      id="tax_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.tax_rate || ''}
                      onChange={(e) => setForm((f) => ({ ...f, tax_rate: parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
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
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      value={form.sku}
                      onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                      placeholder="Stok kodu"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier_code">Tedarikçi Kodu</Label>
                    <Input
                      id="supplier_code"
                      value={form.supplier_code}
                      onChange={(e) => setForm((f) => ({ ...f, supplier_code: e.target.value }))}
                      placeholder="Tedarikçi ürün kodu"
                    />
                  </div>
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
              </TabsContent>
              <TabsContent value="fiyat" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Fiyat</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price || ''}
                      onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Miktar</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.quantity || ''}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Para Birimi</Label>
                    <select
                      id="currency"
                      value={form.currency_id}
                      onChange={(e) => setForm((f) => ({ ...f, currency_id: e.target.value ? Number(e.target.value) : '' }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seçin</option>
                      {currencies.map((cur) => (
                        <option key={cur.id} value={cur.id}>{cur.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="gorsel" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Görsel</Label>
                  <ImageInput
                    value={form.image}
                    onChange={(url) => setForm((f) => ({ ...f, image: url }))}
                    size="product"
                    folderStorageKey="urun-gorselleri-klasor"
                    placeholder="Ürün görseli yükle"
                  />
                </div>
              </TabsContent>
              <TabsContent value="diger" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Ürün Tipi</Label>
                    <select
                      id="type"
                      value={form.type_id}
                      onChange={(e) => setForm((f) => ({ ...f, type_id: e.target.value ? Number(e.target.value) : '' }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seçin</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gtip_code">GTİP Kodu</Label>
                    <Input
                      id="gtip_code"
                      value={form.gtip_code}
                      onChange={(e) => setForm((f) => ({ ...f, gtip_code: e.target.value }))}
                      placeholder="Gümrük tarife kodu"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-6 pt-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="sort_order" className="text-sm">Sıra</Label>
                    <Input
                      id="sort_order"
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                      className="w-16 h-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="modal-status"
                      checked={!!form.status}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                    />
                    <Label htmlFor="modal-status" className="text-sm cursor-pointer">Aktif</Label>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="flex-row justify-end gap-2 pt-4 border-t">
              <div className="flex items-center gap-1">
                {editingId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleDelete(editingId, closeModal)}
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
                      disabled={saving || !form.name.trim()}
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
    </PageLayout>
  )
}
