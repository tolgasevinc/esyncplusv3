import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Plus, X, Trash2, Copy, Save, Info, DollarSign, FileText, Image, Package } from 'lucide-react'
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
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ImageInput, getImageDisplayUrl } from '@/components/ImageInput'
import { Switch } from '@/components/ui/switch'
import { toastSuccess, toastError } from '@/lib/toast'

import { API_URL } from '@/lib/api'

interface Product {
  id: number
  name: string
  code: string | null
  brand_id: number | null
  category_id: number | null
  type_id: number | null
  unit_id: number | null
  currency_id: number | null
  price: number
  quantity: number
  image: string | null
  sort_order: number
  status: number
  brand_name?: string | null
  brand_image?: string | null
  category_name?: string | null
  unit_name?: string | null
  created_at?: string
}

interface OptionItem {
  id: number
  name: string
  code?: string
}

const emptyForm = {
  name: '',
  code: '',
  brand_id: '' as number | '',
  category_id: '' as number | '',
  type_id: '' as number | '',
  unit_id: '' as number | '',
  currency_id: '' as number | '',
  price: 0,
  quantity: 0,
  image: '',
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

  const [brands, setBrands] = useState<OptionItem[]>([])
  const [categories, setCategories] = useState<OptionItem[]>([])
  const [types, setTypes] = useState<OptionItem[]>([])
  const [units, setUnits] = useState<OptionItem[]>([])
  const [currencies, setCurrencies] = useState<OptionItem[]>([])

  const [pageSize, setPageSize] = useState<PageSizeValue>('fit')
  const [fitLimit, setFitLimit] = useState(10)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchOptions = useCallback(async () => {
    const fetchers = [
      fetch(`${API_URL}/api/product-brands?limit=500`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-categories?limit=500`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-types?limit=500`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-units?limit=500`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-currencies?limit=500`).then((r) => r.json()),
    ]
    const [b, c, t, u, cur] = await Promise.all(fetchers)
    setBrands(b.data || [])
    setCategories(c.data || [])
    setTypes(t.data || [])
    setUnits(u.data || [])
    setCurrencies(cur.data || [])
  }, [])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

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
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setSearch('')
    setPage(1)
    fetchData()
    fetchOptions()
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
      code: item.code || '',
      brand_id: item.brand_id ?? '',
      category_id: item.category_id ?? '',
      type_id: item.type_id ?? '',
      unit_id: item.unit_id ?? '',
      currency_id: item.currency_id ?? '',
      price: item.price ?? 0,
      quantity: item.quantity ?? 0,
      image: item.image || '',
      sort_order: item.sort_order ?? 0,
      status: item.status ?? 1,
    })
    setModalOpen(true)
  }

  function handleCopy() {
    setEditingId(null)
    setForm((f) => ({ ...f, name: f.name + ' (kopya)' }))
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function toNum(v: number | ''): number | null {
    if (v === '' || v === undefined || v === null) return null
    const n = Number(v)
    return Number.isNaN(n) ? null : n
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
        name: form.name.trim(),
        code: form.code || undefined,
        brand_id: toNum(form.brand_id),
        category_id: toNum(form.category_id),
        type_id: toNum(form.type_id),
        unit_id: toNum(form.unit_id),
        currency_id: toNum(form.currency_id),
        price: form.price ?? 0,
        quantity: form.quantity ?? 0,
        image: form.image || undefined,
        sort_order: form.sort_order ?? 0,
        status: form.status,
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
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-48 h-9"
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
                  <th className="text-left p-3 font-medium">Kod</th>
                  <th className="text-left p-3 font-medium">Marka</th>
                  <th className="text-left p-3 font-medium">Kategori</th>
                  <th className="text-left p-3 font-medium">Birim</th>
                  <th className="text-right p-3 font-medium">Fiyat</th>
                  <th className="text-right p-3 font-medium">Stok</th>
                  <th className="text-left p-3 font-medium">Durum</th>
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
                      <td className="p-3">
                        {item.image ? (
                          <div
                            className="h-10 w-10 shrink-0 rounded bg-white border"
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
                      <td className="p-3">{item.code || '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {item.brand_image ? (
                            <div
                              className="h-6 w-6 shrink-0 rounded bg-white border"
                              style={{
                                backgroundImage: `url(${getImageDisplayUrl(item.brand_image)})`,
                                backgroundSize: 'contain',
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'center',
                              }}
                              role="img"
                              aria-label=""
                            />
                          ) : null}
                          <span>{item.brand_name || '—'}</span>
                        </div>
                      </td>
                      <td className="p-3">{item.category_name || '—'}</td>
                      <td className="p-3">{item.unit_name || '—'}</td>
                      <td className="p-3 text-right">{item.price != null ? Number(item.price).toLocaleString('tr-TR') : '—'}</td>
                      <td className="p-3 text-right">{item.quantity != null ? Number(item.quantity).toLocaleString('tr-TR') : '—'}</td>
                      <td className="p-3">
                        <span className={item.status ? 'text-green-600' : 'text-muted-foreground'}>
                          {item.status ? 'Aktif' : 'Pasif'}
                        </span>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Ürün Düzenle' : 'Yeni Ürün'}</DialogTitle>
            <DialogDescription>
              Ürün bilgilerini sekmeler üzerinden düzenleyin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
            {error && <p className="text-sm text-destructive mb-4">{error}</p>}
            <Tabs defaultValue="genel" className="flex-1 flex flex-col min-h-0">
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="genel" className="gap-1.5">
                  <Info className="h-4 w-4" />
                  Genel Bilgiler
                </TabsTrigger>
                <TabsTrigger value="fiyatlar" className="gap-1.5">
                  <DollarSign className="h-4 w-4" />
                  Fiyatlar
                </TabsTrigger>
                <TabsTrigger value="aciklamalar" className="gap-1.5">
                  <FileText className="h-4 w-4" />
                  Açıklamalar
                </TabsTrigger>
                <TabsTrigger value="gorseller" className="gap-1.5">
                  <Image className="h-4 w-4" />
                  Görseller
                </TabsTrigger>
                {types.find((t) => t.id === form.type_id && (t.code?.toUpperCase() === 'PAKET' || t.name?.toLowerCase().includes('paket'))) && (
                  <TabsTrigger value="paket" className="gap-1.5">
                    <Package className="h-4 w-4" />
                    Paket İçeriği
                  </TabsTrigger>
                )}
              </TabsList>
              <div className="flex-1 overflow-y-auto mt-4 min-h-0">
                <TabsContent value="genel" className="mt-0 space-y-4">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-8 space-y-2">
                      <Label htmlFor="name">Ürün Adı *</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Örn: iPhone 15 Pro"
                        required
                      />
                    </div>
                    <div className="col-span-4 space-y-2">
                      <Label htmlFor="code">Kod</Label>
                      <Input
                        id="code"
                        value={form.code}
                        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                        placeholder="Örn: IP15P"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="brand_id">Marka</Label>
                      <select
                        id="brand_id"
                        value={form.brand_id}
                        onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value ? Number(e.target.value) : '' }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seçiniz</option>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>{b.name} {b.code ? `(${b.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category_id">Kategori</Label>
                      <select
                        id="category_id"
                        value={form.category_id}
                        onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : '' }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seçiniz</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} {c.code ? `(${c.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type_id">Ürün Tipi</Label>
                      <select
                        id="type_id"
                        value={form.type_id}
                        onChange={(e) => setForm((f) => ({ ...f, type_id: e.target.value ? Number(e.target.value) : '' }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seçiniz</option>
                        {types.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} {t.code ? `(${t.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unit_id">Birim</Label>
                      <select
                        id="unit_id"
                        value={form.unit_id}
                        onChange={(e) => setForm((f) => ({ ...f, unit_id: e.target.value ? Number(e.target.value) : '' }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seçiniz</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>{u.name} {u.code ? `(${u.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="modal-status"
                        checked={!!form.status}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                      />
                      <Label htmlFor="modal-status" className="text-sm cursor-pointer">Aktif</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="sort_order" className="text-sm">Sıra</Label>
                      <Input
                        id="sort_order"
                        type="number"
                        min={0}
                        value={form.sort_order}
                        onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                        className="w-20 h-9"
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="fiyatlar" className="mt-0 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currency_id">Para Birimi</Label>
                      <select
                        id="currency_id"
                        value={form.currency_id}
                        onChange={(e) => setForm((f) => ({ ...f, currency_id: e.target.value ? Number(e.target.value) : '' }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seçiniz</option>
                        {currencies.map((cur) => (
                          <option key={cur.id} value={cur.id}>{cur.name} {cur.code ? `(${cur.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Fiyat</Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Stok Miktarı</Label>
                      <Input
                        id="quantity"
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.quantity}
                        onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="aciklamalar" className="mt-0 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Ürün açıklamaları (kısa, ana, SEO) burada düzenlenecek. product_descriptions tablosu entegrasyonu yakında.
                  </p>
                </TabsContent>
                <TabsContent value="gorseller" className="mt-0 space-y-4">
                  <Label>Ana Görsel (1000×1000 px)</Label>
                  <ImageInput
                    value={form.image}
                    onChange={(url) => setForm((f) => ({ ...f, image: url }))}
                    size="product"
                    folderStorageKey="urun-gorselleri-klasor"
                    placeholder="Yükle veya linkten indir"
                  />
                </TabsContent>
                <TabsContent value="paket" className="mt-0 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Paket içeriği (alt ürünler) burada listelenecek. Paket ürün yönetimi yakında.
                  </p>
                </TabsContent>
              </div>
            </Tabs>
            <DialogFooter className="flex-row justify-end gap-1 mt-4 pt-4 border-t shrink-0">
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
                      <Button type="button" variant="outline" size="icon" onClick={handleCopy} disabled={saving}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Kopyala</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="submit" variant="outline" size="icon" disabled={saving || !form.name.trim()}>
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
