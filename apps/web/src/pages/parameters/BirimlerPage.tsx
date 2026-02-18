import { useState, useEffect, useCallback } from 'react'
import { Ruler, Search, Plus, X, Pencil, Trash2 } from 'lucide-react'
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
import { toastSuccess, toastError } from '@/lib/toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

interface ProductUnit {
  id: number
  name: string
  code: string
  description?: string
  sort_order: number
  created_at?: string
}

const emptyForm = { name: '', code: '', description: '', sort_order: 0 }

export function BirimlerPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ProductUnit[]>([])
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
      const res = await fetch(`${API_URL}/api/product-units?${params}`)
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

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (item: ProductUnit) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      code: item.code,
      description: item.description || '',
      sort_order: item.sort_order ?? 0,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
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
      const url = editingId ? `${API_URL}/api/product-units/${editingId}` : `${API_URL}/api/product-units`
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, code: form.code || form.name.slice(0, 2).toUpperCase() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Birim güncellendi' : 'Birim eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Bu birimi silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/product-units/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Birim silindi', 'Birim başarıyla silindi.')
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  return (
    <PageLayout
      title="Birimler"
      description="Ürün birimlerini yönetin"
      backTo="/parametreler"
      showRefresh
      onRefresh={() => {
        setSearch('')
        setPage(1)
        fetchData()
      }}
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
          <Button variant="outline" size="icon" title="Yeni birim" onClick={openNew}>
            <Plus className="h-4 w-4" />
          </Button>
          {hasFilter && (
            <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setPage(1) }} title="Filtreleri sıfırla">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      }
      footerContent={
        <div className="flex items-center gap-4">
          <span>Toplam: {total} kayıt{hasFilter && ' (filtrelenmiş)'}</span>
          <span className="text-muted-foreground">Sayfa {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Önceki</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)}>Sonraki</Button>
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
                  <th className="text-left p-3 font-medium">Birim Adı</th>
                  <th className="text-left p-3 font-medium">Kod</th>
                  <th className="text-left p-3 font-medium">Açıklama</th>
                  <th className="text-right p-3 font-medium w-28">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{error || 'Henüz birim kaydı yok.'}</td></tr>
                ) : (
                  data.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.code}</td>
                      <td className="p-3">{item.description || '—'}</td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)} title="Düzenle"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item.id)} title="Sil"><Trash2 className="h-4 w-4" /></Button>
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
            <DialogTitle>{editingId ? 'Birim Düzenle' : 'Yeni Birim'}</DialogTitle>
            <DialogDescription>Birim bilgilerini girin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="name">Birim Adı *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Örn: Adet" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Kod</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Örn: AD" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Açıklama</Label>
              <Input id="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sıra</Label>
              <Input id="sort_order" type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>İptal</Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Kaydet'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
