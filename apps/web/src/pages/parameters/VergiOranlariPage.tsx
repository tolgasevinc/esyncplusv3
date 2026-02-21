import { useState, useEffect, useCallback, useRef } from 'react'
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

interface ProductTaxRate {
  id: number
  name: string
  value: number
  description?: string
  sort_order: number
  status?: number
  created_at?: string
}

const emptyForm = { name: '', value: 0, description: '', sort_order: 0, status: 1 }

export function VergiOranlariPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ProductTaxRate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pageSize, setPageSize] = useState<PageSizeValue>('fit')
  const [fitLimit, setFitLimit] = useState(10)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/product-tax-rates?${params}`)
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

  const openNew = async () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/product-tax-rates/next-sort-order`)
      const json = await res.json()
      if (res.ok && json.next != null) setForm((f) => ({ ...f, sort_order: json.next }))
    } catch { /* ignore */ }
  }

  const openEdit = (item: ProductTaxRate) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      value: item.value ?? 0,
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
      const url = editingId ? `${API_URL}/api/product-tax-rates/${editingId}` : `${API_URL}/api/product-tax-rates`
      const method = editingId ? 'PUT' : 'POST'
      const payload = {
        name: form.name.trim(),
        value: form.value,
        description: form.description.trim() || null,
        sort_order: form.sort_order,
        status: form.status,
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Vergi oranı güncellendi' : 'Vergi oranı eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, onSuccess?: () => void) {
    if (!confirm('Bu vergi oranını silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/product-tax-rates/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Vergi oranı silindi', 'Vergi oranı başarıyla silindi.')
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  return (
    <PageLayout
      title="Vergi Oranları"
      description="Ürün vergi oranlarını yönetin"
      backTo="/parametreler"
      contentRef={contentRef}
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
            <TooltipContent>Yeni vergi oranı</TooltipContent>
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
          fitLimit={fitLimit}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
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
                  <th className="text-left p-3 font-medium">Ad</th>
                  <th className="text-left p-3 font-medium">Oran (%)</th>
                  <th className="text-left p-3 font-medium">Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">{error || 'Henüz vergi oranı kaydı yok.'}</td></tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.value}%</td>
                      <td className="p-3 text-muted-foreground">{item.description || '—'}</td>
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
            <DialogTitle>{editingId ? 'Vergi Oranı Düzenle' : 'Yeni Vergi Oranı'}</DialogTitle>
            <DialogDescription>Vergi oranı bilgilerini girin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Ad *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Örn: KDV %18"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">Oran (%)</Label>
                <Input
                  id="value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.value || ''}
                  onChange={(e) => setForm((f) => ({ ...f, value: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Açıklama</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Opsiyonel açıklama"
              />
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
