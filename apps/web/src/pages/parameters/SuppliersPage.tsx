import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, X, Trash2, Pencil, Save, FileSpreadsheet } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toastSuccess, toastError } from '@/lib/toast'

import { API_URL } from '@/lib/api'

/** products tablosu sütunları - column_mappings eşleştirmesi için */
const PRODUCT_COLUMNS = [
  { value: 'name', label: 'Ürün Adı' },
  { value: 'sku', label: 'SKU' },
  { value: 'barcode', label: 'Barkod' },
  { value: 'brand_id', label: 'Marka ID' },
  { value: 'category_id', label: 'Kategori ID' },
  { value: 'type_id', label: 'Tip ID' },
  { value: 'unit_id', label: 'Birim ID' },
  { value: 'currency_id', label: 'Para Birimi ID' },
  { value: 'price', label: 'Fiyat' },
  { value: 'quantity', label: 'Miktar' },
  { value: 'image', label: 'Görsel' },
  { value: 'tax_rate', label: 'Vergi Oranı' },
  { value: 'supplier_code', label: 'Tedarikçi Kodu' },
  { value: 'gtip_code', label: 'GTIP Kodu' },
]

const SOURCE_TYPES = [
  { value: 'excel', label: 'Excel' },
  { value: 'xml', label: 'XML' },
  { value: 'csv', label: 'CSV' },
]

interface Supplier {
  id: number
  name: string
  brand_id?: number | null
  brand_name?: string
  source_type: string
  currency_id?: number | null
  currency_symbol?: string
  source_file?: string | null
  table_name?: string | null
  record_count?: number
  column_mappings?: string | null
  column_types?: string | null
  sort_order: number
  status?: number
  created_at?: string
}

const emptyForm = {
  name: '',
  brand_id: '' as number | '',
  source_type: 'excel',
  currency_id: '' as number | '',
  source_file: '',
  table_name: '',
  record_count: 0,
  column_mappings: '{}',
  column_types: '{}',
  sort_order: 0,
  status: 1,
}

function parseColumnMappings(json: string | null | undefined): Record<string, string> {
  if (!json?.trim()) return {}
  try {
    const parsed = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function stringifyColumnMappings(obj: Record<string, string>): string {
  return JSON.stringify(obj, null, 2)
}

export function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [data, setData] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([])
  const [currencies, setCurrencies] = useState<{ id: number; name: string; symbol?: string }[]>([])

  const hasFilter = search.length > 0

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '9999' })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/suppliers?${params}`)
      const text = await res.text()
      let json: { data?: Supplier[]; error?: string }
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(res.status === 404 ? 'Suppliers API bulunamadı. Migration uygulandı mı? API deploy edildi mi?' : `Sunucu hatası (${res.status})`)
      }
      if (!res.ok) throw new Error(json?.error || `Yüklenemedi (${res.status})`)
      setData(json.data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [search])

  const fetchOptions = useCallback(async () => {
    try {
      const [bRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/product-brands?limit=9999`),
        fetch(`${API_URL}/api/product-currencies?limit=9999`),
      ])
      let b: { data?: { id: number; name: string }[] } = { data: [] }
      let c: { data?: { id: number; name: string; symbol?: string }[] } = { data: [] }
      if (bRes.ok) try { b = JSON.parse(await bRes.text()) } catch { /* ignore */ }
      if (cRes.ok) try { c = JSON.parse(await cRes.text()) } catch { /* ignore */ }
      setBrands((b.data || []).map((x) => ({ id: x.id, name: x.name })))
      setCurrencies((c.data || []).map((x) => ({ id: x.id, name: x.name, symbol: x.symbol })))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchData()
    fetchOptions()
  }, [fetchData, fetchOptions])

  const openNew = async () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/suppliers/next-sort-order`)
      const text = await res.text()
      if (res.ok && text) {
        const json = JSON.parse(text)
        if (json.next != null) setForm((f) => ({ ...f, sort_order: json.next }))
      }
    } catch { /* ignore */ }
  }

  const openEdit = (item: Supplier) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      brand_id: item.brand_id ?? '',
      source_type: item.source_type || 'excel',
      currency_id: item.currency_id ?? '',
      source_file: item.source_file || '',
      table_name: item.table_name || '',
      record_count: item.record_count ?? 0,
      column_mappings: item.column_mappings || '{}',
      column_types: item.column_types || '{}',
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `${API_URL}/api/suppliers/${editingId}` : `${API_URL}/api/suppliers`
      const method = editingId ? 'PUT' : 'POST'
      const cleanMappings: Record<string, string> = {}
      Object.entries(parseColumnMappings(form.column_mappings)).forEach(([k, v]) => {
        if (k.trim() && v.trim()) cleanMappings[k.trim()] = v.trim()
      })
      const body = {
        ...form,
        brand_id: form.brand_id === '' ? undefined : Number(form.brand_id),
        currency_id: form.currency_id === '' ? undefined : Number(form.currency_id),
        column_mappings: Object.keys(cleanMappings).length > 0 ? stringifyColumnMappings(cleanMappings) : null,
        column_types: form.column_types || null,
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
      toastSuccess(editingId ? 'Tedarikçi güncellendi' : 'Tedarikçi eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, onSuccess?: () => void) {
    if (!confirm('Bu tedarikçiyi silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/suppliers/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Tedarikçi silindi', 'Tedarikçi başarıyla silindi.')
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  const mappings = parseColumnMappings(form.column_mappings)

  return (
    <PageLayout
      title="Tedarikçiler"
      description="Tedarikçi kartları ve sütun eşleştirmeleri"
      backTo="/parametreler"
      showRefresh
      onRefresh={() => {
        setSearch('')
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
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Tedarikçi Ekle
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni tedarikçi kartı</TooltipContent>
          </Tooltip>
          {hasFilter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setSearch('')}>
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filtreleri sıfırla</TooltipContent>
            </Tooltip>
          )}
        </div>
      }
    >
      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Yükleniyor...</CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Ekle kartı - her zaman ilk sırada */}
          <Card
            className="border-dashed cursor-pointer hover:bg-muted/50 transition-colors min-h-[140px] flex items-center justify-center"
            onClick={openNew}
          >
            <CardContent className="p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Plus className="h-10 w-10" />
              <span className="text-sm font-medium">Tedarikçi Ekle</span>
            </CardContent>
          </Card>

          {data.map((item) => {
            const itemMappings = parseColumnMappings(item.column_mappings)
            const mappingCount = Object.keys(itemMappings).length
            return (
              <Card
                key={item.id}
                className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openEdit(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                        <p className="font-medium truncate">{item.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {SOURCE_TYPES.find((t) => t.value === item.source_type)?.label || item.source_type}
                        {item.brand_name && ` • ${item.brand_name}`}
                        {item.currency_symbol && ` • ${item.currency_symbol}`}
                      </p>
                      {mappingCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {mappingCount} sütun eşleştirmesi
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Düzenle</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Sil</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}</DialogTitle>
            <DialogDescription>
              Tedarikçi bilgileri ve kaynak dosya sütunlarını products tablosuyla eşleştirin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tedarikçi Adı *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Örn: Tedarikçi A"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source_type">Kaynak Tipi</Label>
                <select
                  id="source_type"
                  value={form.source_type}
                  onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency_id">Para Birimi</Label>
                <select
                  id="currency_id"
                  value={form.currency_id}
                  onChange={(e) => setForm((f) => ({ ...f, currency_id: e.target.value ? Number(e.target.value) : '' }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seçiniz</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.symbol || ''})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="source_file">Kaynak Dosya</Label>
                <Input
                  id="source_file"
                  value={form.source_file}
                  onChange={(e) => setForm((f) => ({ ...f, source_file: e.target.value }))}
                  placeholder="Dosya yolu veya URL"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="table_name">Tablo Adı</Label>
                <Input
                  id="table_name"
                  value={form.table_name}
                  onChange={(e) => setForm((f) => ({ ...f, table_name: e.target.value }))}
                  placeholder="Örn: Sayfa1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sütun Eşleştirmesi (column_mappings)</Label>
              <p className="text-xs text-muted-foreground">
                Kaynak sütun adı → products tablosu sütunu. JSON format: {`{"Kaynak Sütun":"products_sütunu"}`}
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3 bg-muted/30">
                {Object.entries(mappings).map(([sourceCol, productCol], idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      value={sourceCol}
                      onChange={(e) => {
                        const v = e.target.value
                        const next = { ...mappings }
                        delete next[sourceCol]
                        if (v) next[v] = productCol
                        setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                      }}
                      placeholder="Kaynak sütun"
                      className="flex-1"
                    />
                    <span className="text-muted-foreground">→</span>
                    <select
                      value={productCol}
                      onChange={(e) => {
                        const next = { ...mappings, [sourceCol]: e.target.value }
                        setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                      }}
                      className="flex h-9 w-36 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {PRODUCT_COLUMNS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        const next = { ...mappings }
                        delete next[sourceCol]
                        setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const key = `Yeni_${Object.keys(mappings).length + 1}`
                    const next = { ...mappings, [key]: '' }
                    setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Eşleştirme Ekle
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="column_mappings_raw">column_mappings (JSON)</Label>
              <textarea
                id="column_mappings_raw"
                value={form.column_mappings}
                onChange={(e) => setForm((f) => ({ ...f, column_mappings: e.target.value }))}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder='{"Ürün Adı":"name","Fiyat":"price"}'
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                İptal
              </Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
