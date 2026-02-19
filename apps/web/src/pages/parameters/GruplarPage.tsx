import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, X, Trash2, Copy, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toastSuccess, toastError } from '@/lib/toast'

import { API_URL } from '@/lib/api'

/** product_categories tablosundan group_id=0 olan kayıtlar = Gruplar */
interface ProductCategoryGroup {
  id: number
  group_id?: number | null
  category_id?: number | null
  name: string
  code: string
  slug?: string
  description?: string
  sort_order: number
  status?: number
  created_at?: string
}

const emptyForm = { name: '', code: '', description: '', sort_order: 0, status: 1 }

export function GruplarPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ProductCategoryGroup[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pageSize, setPageSize] = useState<PageSizeValue>(10)
  const hasFilter = search.length > 0
  const limit = pageSize === 'fit' ? 9999 : pageSize

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), group_id: '0' })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/product-categories?${params}`)
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

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (item: ProductCategoryGroup) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      code: item.code,
      description: item.description || '',
      sort_order: item.sort_order ?? 0,
      status: item.status ?? 1,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function handleCopy() {
    setEditingId(null)
    setForm((f) => ({ ...f, name: f.name + ' (kopya)' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `${API_URL}/api/product-categories/${editingId}` : `${API_URL}/api/product-categories`
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId
        ? { ...form, group_id: 0, category_id: null, status: form.status }
        : { ...form, code: form.code || form.name.slice(0, 2).toUpperCase(), group_id: 0, category_id: null, status: form.status }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Grup güncellendi' : 'Grup eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, onSuccess?: () => void) {
    if (!confirm('Bu grubu silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/product-categories/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Grup silindi', 'Grup başarıyla silindi.')
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  return (
    <PageLayout
      title="Gruplar"
      description="Ürün gruplarını yönetin (group_id=0 kategoriler)"
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={openNew}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni grup</TooltipContent>
          </Tooltip>
          {hasFilter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setPage(1) }}>
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
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
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
                  <th className="text-left p-3 font-medium">Grup Adı</th>
                  <th className="text-left p-3 font-medium">Kod</th>
                  <th className="text-left p-3 font-medium">Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">{error || 'Henüz grup kaydı yok.'}</td></tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.code}</td>
                      <td className="p-3">{item.description || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Grup Düzenle' : 'Yeni Grup'}</DialogTitle>
            <DialogDescription>Grup bilgilerini girin. Gruplar product_categories tablosunda group_id=0 olarak saklanır.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-9 space-y-2">
                <Label htmlFor="name">Grup Adı *</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Örn: Elektronik" required />
              </div>
              <div className="col-span-3 space-y-2">
                <Label htmlFor="code">Kod</Label>
                <Input id="code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Örn: EL" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Açıklama</Label>
              <Input id="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama" />
            </div>
            <DialogFooter className="flex-row justify-between gap-4 sm:justify-between">
              <div className="flex items-center gap-4">
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
              <div className="flex items-center gap-1">
                {editingId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button type="button" variant="outline" size="icon" onClick={() => handleDelete(editingId, closeModal)} disabled={saving} className="text-destructive hover:text-destructive">
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
