import { useState, useEffect, useCallback } from 'react'
import { Save, DollarSign, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { formatPrice } from '@/lib/utils'

interface ExchangeRateRecord {
  id: number
  currency_code: string
  rate: number
  recorded_at: string
  source: string
}

export function SettingsExchangeRatesPage() {
  const [data, setData] = useState<ExchangeRateRecord[]>([])
  const [currencies, setCurrencies] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currencyFilter, setCurrencyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [confirmType, setConfirmType] = useState<'single' | 'bulk'>('single')
  const [idToDelete, setIdToDelete] = useState<number | null>(null)
  const limit = 50

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (currencyFilter) params.set('currency_code', currencyFilter)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const res = await fetch(`${API_URL}/api/exchange-rates?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setData(json.data || [])
      setTotal(json.total ?? 0)
      setCurrencies(json.currencies || [])
      setSelectedIds(new Set())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [page, currencyFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === data.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(data.map((r) => r.id)))
  }

  const openDeleteConfirm = (type: 'single' | 'bulk', id?: number) => {
    setConfirmType(type)
    setIdToDelete(id ?? null)
    setConfirmModalOpen(true)
  }

  const closeConfirmModal = () => {
    setConfirmModalOpen(false)
    setIdToDelete(null)
  }

  const executeDelete = async () => {
    if (confirmType === 'single' && idToDelete != null) {
      setDeleting(true)
      try {
        const res = await fetch(`${API_URL}/api/exchange-rates/${idToDelete}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Silinemedi')
        toastSuccess('Silindi', 'Kayıt silindi.')
        closeConfirmModal()
        fetchData()
      } catch (err) {
        toastError('Hata', err instanceof Error ? err.message : 'Silinemedi')
      } finally {
        setDeleting(false)
      }
    } else if (confirmType === 'bulk' && selectedIds.size > 0) {
      setDeleting(true)
      try {
        const res = await fetch(`${API_URL}/api/exchange-rates`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Silinemedi')
        toastSuccess('Silindi', `${json.deleted ?? selectedIds.size} kayıt silindi.`)
        setSelectedIds(new Set())
        closeConfirmModal()
        fetchData()
      } catch (err) {
        toastError('Hata', err instanceof Error ? err.message : 'Silinemedi')
      } finally {
        setDeleting(false)
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/cron/exchange-rates`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      toastSuccess('Kaydedildi', 'TCMB döviz kurları kaydedildi.')
      fetchData()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kurlar kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <PageLayout
      title="Döviz Kurları"
      description="TCMB kayıtlı döviz kurları geçmişi"
      backTo="/ayarlar"
      showRefresh
      onRefresh={fetchData}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Kayıtlı Döviz Kurları</CardTitle>
                <CardDescription>
                  TCMB&apos;den günlük kaydedilen kurlar. Sabah 10 ve akşam 16&apos;da otomatik güncellenir.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={() => openDeleteConfirm('bulk')} disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleting ? 'Siliniyor...' : `Seçilenleri Sil (${selectedIds.size})`}
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Kaydediliyor...' : 'Anlık Kaydet'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtreler */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Döviz Tipi</Label>
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
              >
                <option value="">Tümü</option>
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Başlangıç Tarihi</Label>
              <Input
                type="date"
                className="h-9 w-40"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bitiş Tarihi</Label>
              <Input
                type="date"
                className="h-9 w-40"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => { setCurrencyFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}>
              Filtreleri Temizle
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading && <p className="text-muted-foreground">Yükleniyor...</p>}
          {!loading && !error && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="w-10 p-3">
                        <input
                          type="checkbox"
                          checked={data.length > 0 && selectedIds.size === data.length}
                          onChange={toggleSelectAll}
                          className="rounded border-input"
                        />
                      </th>
                      <th className="text-left p-3 font-medium">Döviz</th>
                      <th className="text-right p-3 font-medium">Kur (1 birim = X ₺)</th>
                      <th className="text-left p-3 font-medium">Kayıt Zamanı</th>
                      <th className="text-left p-3 font-medium">Kaynak</th>
                      <th className="w-10 p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          Henüz kayıt yok. &quot;Anlık Kaydet&quot; ile TCMB&apos;den kurları çekebilirsiniz.
                        </td>
                      </tr>
                    ) : (
                      data.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(r.id)}
                              onChange={() => toggleSelect(r.id)}
                              className="rounded border-input"
                            />
                          </td>
                          <td className="p-3 font-medium">{r.currency_code}</td>
                          <td className="p-3 text-right tabular-nums">{formatPrice(r.rate)} ₺</td>
                          <td className="p-3">
                            {r.recorded_at
                              ? new Date(r.recorded_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
                              : '—'}
                          </td>
                          <td className="p-3 text-muted-foreground">{r.source || 'tcmb'}</td>
                          <td className="p-3">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => openDeleteConfirm('single', r.id)}
                                  disabled={deleting}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Sil</TooltipContent>
                            </Tooltip>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-muted-foreground">
                    Toplam {total.toLocaleString()} kayıt
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Önceki
                    </Button>
                    <span className="flex items-center px-2 text-sm">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmModalOpen} onOpenChange={(open) => !open && closeConfirmModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Silme Onayı</DialogTitle>
            <DialogDescription>
              {confirmType === 'single'
                ? 'Bu döviz kuru kaydını silmek istediğinize emin misiniz?'
                : `${selectedIds.size} kaydı silmek istediğinize emin misiniz?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeConfirmModal} disabled={deleting}>
              İptal
            </Button>
            <Button variant="destructive" onClick={executeDelete} disabled={deleting}>
              {deleting ? 'Siliniyor...' : 'Sil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
