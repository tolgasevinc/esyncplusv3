import { useState, useEffect, useCallback, useRef } from 'react'
import { DollarSign } from 'lucide-react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
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

interface ProductCurrency {
  id: number
  name: string
  code: string
  symbol?: string
  is_default: number
  sort_order: number
  status?: number
  created_at?: string
}

const emptyForm = { name: '', code: '', symbol: '', is_default: 0, sort_order: 0, status: 1 }

const paraBirimleriListDefaults = { search: '', page: 1, pageSize: 'fit' as PageSizeValue, fitLimit: 10 }

export function ParaBirimleriPage() {
  const [listState, setListState] = usePersistedListState('para-birimleri', paraBirimleriListDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [data, setData] = useState<ProductCurrency[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [ratesSaving, setRatesSaving] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const RATE_CODES = ['USD', 'EUR', 'GBP']
  const hasFilter = search.length > 0
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/product-currencies?${params}`)
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

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/app-settings?category=parabirimleri`)
      const data = await res.json()
      if (data?.exchange_rates) {
        const parsed = JSON.parse(data.exchange_rates) as Record<string, number>
        setExchangeRates(typeof parsed === 'object' && parsed !== null ? parsed : {})
      } else {
        setExchangeRates({})
      }
    } catch {
      setExchangeRates({})
    }
  }, [])

  useEffect(() => {
    fetchRates()
  }, [fetchRates])

  const handleRatesSave = async () => {
    setRatesSaving(true)
    try {
      await fetch(`${API_URL}/api/app-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'parabirimleri',
          settings: { exchange_rates: JSON.stringify(exchangeRates) },
        }),
      })
      toastSuccess('Kurlar kaydedildi', 'Döviz kurları güncellendi.')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kurlar kaydedilemedi')
    } finally {
      setRatesSaving(false)
    }
  }

  const openNew = async () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/product-currencies/next-sort-order`)
      const json = await res.json()
      if (res.ok && json.next != null) setForm((f) => ({ ...f, sort_order: json.next }))
    } catch { /* ignore */ }
  }

  const openEdit = (item: ProductCurrency) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      code: item.code,
      symbol: item.symbol || '',
      is_default: item.is_default ?? 0,
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
      const url = editingId ? `${API_URL}/api/product-currencies/${editingId}` : `${API_URL}/api/product-currencies`
      const method = editingId ? 'PUT' : 'POST'
      const payload = {
        ...form,
        code: form.code || form.name.slice(0, 3).toUpperCase(),
        symbol: form.symbol || null,
        status: form.status,
        is_default: form.is_default ? 1 : 0,
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
      toastSuccess(editingId ? 'Para birimi güncellendi' : 'Para birimi eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, onSuccess?: () => void) {
    if (!confirm('Bu para birimini silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/product-currencies/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Para birimi silindi', 'Para birimi başarıyla silindi.')
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  return (
    <PageLayout
      title="Para Birimleri"
      description="Para birimlerini yönetin"
      backTo="/parametreler"
      contentRef={contentRef}
      showRefresh
      onRefresh={() => {
        setListState({ search: '', page: 1 })
        fetchData()
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ara..."
              value={search}
              onChange={(e) => setListState({ search: e.target.value })}
              className="pl-8 w-48 h-9"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={openNew}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni para birimi</TooltipContent>
          </Tooltip>
          {hasFilter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setListState({ search: '', page: 1 })}>
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
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Para Birimi</th>
                  <th className="text-left p-3 font-medium">Kod</th>
                  <th className="text-left p-3 font-medium">Sembol</th>
                  <th className="text-left p-3 font-medium">Varsayılan</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{error || 'Henüz para birimi kaydı yok.'}</td></tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.code}</td>
                      <td className="p-3">{item.symbol || '—'}</td>
                      <td className="p-3">{item.is_default ? 'Evet' : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Döviz Kurları (TL karşılığı)</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Ürün listesinde fiyat önizlemesinde TL karşılıklarının gösterilmesi için kurları tanımlayın.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            {RATE_CODES.map((code) => (
              <div key={code} className="flex items-center gap-2">
                <Label htmlFor={`rate-${code}`} className="text-sm whitespace-nowrap">{code} / TL</Label>
                <Input
                  id={`rate-${code}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={exchangeRates[code] ?? ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setExchangeRates((prev) => ({ ...prev, [code]: isNaN(v) ? 0 : v }))
                  }}
                  placeholder="0"
                  className="w-24"
                />
              </div>
            ))}
            <Button size="sm" onClick={handleRatesSave} disabled={ratesSaving}>
              {ratesSaving ? 'Kaydediliyor...' : 'Kurları Kaydet'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Para Birimi Düzenle' : 'Yeni Para Birimi'}</DialogTitle>
            <DialogDescription>Para birimi bilgilerini girin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 space-y-2">
                <Label htmlFor="name">Para Birimi Adı *</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Örn: Türk Lirası" required />
              </div>
              <div className="col-span-3 space-y-2">
                <Label htmlFor="code">Kod</Label>
                <Input id="code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Örn: TRY" />
              </div>
              <div className="col-span-3 space-y-2">
                <Label htmlFor="symbol">Sembol</Label>
                <Input id="symbol" value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} placeholder="Örn: ₺" />
              </div>
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
                    id="modal-default"
                    checked={!!form.is_default}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="modal-default" className="text-sm cursor-pointer">Varsayılan</Label>
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
