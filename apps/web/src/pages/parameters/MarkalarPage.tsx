import { useState, useEffect, useCallback } from 'react'
import { Tag, Search, Plus, X, Pencil, Trash2 } from 'lucide-react'
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
import { ImageInput, getImageDisplayUrl } from '@/components/ImageInput'
import { toastSuccess, toastError } from '@/lib/toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

interface ProductBrand {
  id: number
  name: string
  code: string
  slug?: string
  image?: string
  description?: string
  website?: string
  country?: string
  sort_order: number
  created_at?: string
}

const emptyForm = {
  name: '',
  code: '',
  slug: '',
  image: '',
  description: '',
  website: '',
  country: '',
  sort_order: 0,
}

export function MarkalarPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ProductBrand[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pageSize = 10
  const hasFilter = search.length > 0

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/product-brands?${params}`)
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
  }, [page, search])

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

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(brand: ProductBrand) {
    setEditingId(brand.id)
    setForm({
      name: brand.name,
      code: brand.code,
      slug: brand.slug || '',
      image: brand.image || '',
      description: brand.description || '',
      website: brand.website || '',
      country: brand.country || '',
      sort_order: brand.sort_order ?? 0,
    })
    setModalOpen(true)
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
      const url = editingId
        ? `${API_URL}/api/product-brands/${editingId}`
        : `${API_URL}/api/product-brands`
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId
        ? { ...form, code: form.code || undefined }
        : { ...form, code: form.code || form.name.slice(0, 2).toUpperCase() }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Marka güncellendi' : 'Marka eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Bu markayı silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/product-brands/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Marka silindi', 'Marka başarıyla silindi.')
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  return (
    <PageLayout
      title="Markalar"
      description="Marka listesini yönetin"
      backTo="/parametreler"
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
          <Button variant="outline" size="icon" title="Yeni marka" onClick={openNew}>
            <Plus className="h-4 w-4" />
          </Button>
          {hasFilter && (
            <Button variant="ghost" size="icon" onClick={handleReset} title="Filtreleri sıfırla">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      }
      footerContent={
        <div className="flex items-center gap-4">
          <span>
            Toplam: {total} kayıt
            {hasFilter && ` (filtrelenmiş)`}
          </span>
          <span className="text-muted-foreground">
            Sayfa {page} / {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Önceki
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage((p) => p + 1)}
            >
              Sonraki
            </Button>
          </div>
        </div>
      }
    >
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Marka Adı</th>
                  <th className="text-left p-3 font-medium">Kod</th>
                  <th className="text-left p-3 font-medium">Logo</th>
                  <th className="text-right p-3 font-medium w-28">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      {error || 'Henüz marka kaydı yok. Yeni marka eklemek için + butonunu kullanın.'}
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.code}</td>
                      <td className="p-3">
                        {item.image ? (
                          <img src={getImageDisplayUrl(item.image)} alt="" className="h-8 w-8 object-contain rounded" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(item)}
                          title="Düzenle"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(item.id)}
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Marka Düzenle' : 'Yeni Marka'}</DialogTitle>
            <DialogDescription>
              Marka bilgilerini girin. Kod genellikle marka adının ilk 2 harfi olarak otomatik atanır.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="name">Marka Adı *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Örn: Apple"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Kod (1-3 harf)</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.slice(0, 3).toUpperCase() }))}
                placeholder="Örn: AP"
                maxLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="Örn: apple"
              />
            </div>
            <div className="space-y-2">
              <Label>Logo (50x50 px)</Label>
              <ImageInput
                value={form.image}
                onChange={(url) => setForm((f) => ({ ...f, image: url }))}
                size="brand"
                folderStorageKey="marka-logolari-klasor"
                placeholder="Yükle veya linkten indir"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Açıklama</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Kısa açıklama"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="website">Web sitesi</Label>
                <Input
                  id="website"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Ülke</Label>
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  placeholder="Örn: ABD"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sıra</Label>
              <Input
                id="sort_order"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                İptal
              </Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
