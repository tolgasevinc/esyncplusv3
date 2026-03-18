import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, SquarePen, Trash2, Save, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError } from '@/lib/toast'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { API_URL } from '@/lib/api'

interface OfferAttachment {
  id: number
  title: string
  content: string | null
  sort_order: number
  product_ids: number[]
}

interface ProductOption {
  id: number
  name: string
  sku?: string
}

const emptyForm = { title: '', content: '', sort_order: 0, product_ids: [] as number[] }

export function TeklifEkleriPage() {
  const [data, setData] = useState<OfferAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; onSuccess?: () => void }>({ open: false, id: null })
  const [productSearch, setProductSearch] = useState('')
  const [productPopoverOpen, setProductPopoverOpen] = useState(false)
  const [allProducts, setAllProducts] = useState<ProductOption[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/offer-attachments`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setData(json.data || [])
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Yüklenemedi')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await fetch(`${API_URL}/api/products?limit=9999`)
        const json = await res.json()
        if (res.ok && json.data) {
          setAllProducts(json.data.map((p: { id: number; name: string; sku?: string }) => ({ id: p.id, name: p.name, sku: p.sku })))
        }
      } catch {
        setAllProducts([])
      }
    }
    if (modalOpen) loadProducts()
  }, [modalOpen])

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return allProducts.slice(0, 50)
    const q = productSearch.toLowerCase()
    return allProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku?.toLowerCase().includes(q) ?? false)
    ).slice(0, 50)
  }, [allProducts, productSearch])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (item: OfferAttachment) => {
    setEditingId(item.id)
    setForm({
      title: item.title,
      content: item.content || '',
      sort_order: item.sort_order ?? 0,
      product_ids: item.product_ids || [],
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setProductSearch('')
    setProductPopoverOpen(false)
  }

  const addProduct = (p: ProductOption) => {
    if (form.product_ids.includes(p.id)) return
    setForm((f) => ({ ...f, product_ids: [...f.product_ids, p.id] }))
  }

  const removeProduct = (productId: number) => {
    setForm((f) => ({ ...f, product_ids: f.product_ids.filter((id) => id !== productId) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const url = editingId ? `${API_URL}/api/offer-attachments/${editingId}` : `${API_URL}/api/offer-attachments`
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          content: form.content.trim() || undefined,
          sort_order: form.sort_order,
          product_ids: form.product_ids,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Ek güncellendi' : 'Ek eklendi')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const openDeleteConfirm = (id: number, onSuccess?: () => void) => {
    setDeleteConfirm({ open: true, id, onSuccess })
  }

  const handleDelete = async () => {
    if (!deleteConfirm.id) return
    try {
      const res = await fetch(`${API_URL}/api/offer-attachments/${deleteConfirm.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Ek silindi')
      deleteConfirm.onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleteConfirm({ open: false, id: null })
    }
  }

  const getProductName = (id: number) => allProducts.find((p) => p.id === id)?.name || `#${id}`

  return (
    <PageLayout title="Teklif Ekleri" description="Ürünle ilişkili teklif ek sayfaları" backTo="/parametreler">
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">
              Teklif ekleri, teklifteki ürünlere göre PDF'e eklenebilir. Her ek, hangi ürünlerle ilişkili olduğunu tanımlar.
            </p>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Yeni Ek
            </Button>
          </div>
          {loading ? (
            <p className="text-muted-foreground">Yükleniyor...</p>
          ) : data.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">Henüz ek tanımlanmamış.</p>
          ) : (
            <div className="space-y-2">
              {data.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 cursor-pointer"
                  onClick={() => openEdit(item)}
                >
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.product_ids?.length ? `${item.product_ids.length} ürünle ilişkili` : 'Ürün ilişkisi yok'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(item); }}>
                      <SquarePen className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); openDeleteConfirm(item.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Ek Düzenle' : 'Yeni Ek'}</DialogTitle>
            <DialogDescription>Teklif ek sayfası bilgilerini girin. İlişkili ürünler, teklifte bu ürünler varsa ekin PDF'e eklenmesini sağlar.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Başlık *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Örn: Teknik Özellikler" required />
            </div>
            <div className="space-y-2">
              <Label>İçerik (HTML veya düz metin)</Label>
              <Textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Ek sayfa içeriği..." rows={6} className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label>İlişkili ürünler</Label>
              <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start">
                    <Plus className="h-4 w-4 mr-2" />
                    Ürün ekle
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Input
                    placeholder="Ürün ara..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="rounded-b-none border-b"
                  />
                  <div className="max-h-[200px] overflow-y-auto">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between"
                        onClick={() => { addProduct(p); setProductSearch(''); }}
                      >
                        <span>{p.name}</span>
                        {p.sku && <span className="text-muted-foreground">{p.sku}</span>}
                      </button>
                    ))}
                    {filteredProducts.length === 0 && <p className="p-3 text-sm text-muted-foreground">Ürün bulunamadı</p>}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex flex-wrap gap-1 mt-2">
                {form.product_ids.map((pid) => (
                  <span
                    key={pid}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-sm"
                  >
                    {getProductName(pid)}
                    <button type="button" onClick={() => removeProduct(pid)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sıra</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className="w-20" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => editingId && openDeleteConfirm(editingId, closeModal)} disabled={saving} className="text-destructive">
                Sil
              </Button>
              <Button type="submit" disabled={saving || !form.title.trim()}>
                <Save className="h-4 w-4 mr-2" />
                Kaydet
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, id: null })}
        title="Eki Sil"
        description="Bu eki silmek istediğinize emin misiniz?"
        onConfirm={handleDelete}
      />
    </PageLayout>
  )
}
