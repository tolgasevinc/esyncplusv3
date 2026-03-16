import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Loader2, Search, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_URL } from '@/lib/api'
import { toastError, toastSuccess } from '@/lib/toast'

interface DiaCariKart {
  id: number
  carikayitturu?: string | null
  carikartkodu?: string | null
  unvan?: string | null
  vergidairesi?: number | null
  vergidairesi_adi?: string | null
  verginumarasi?: string | null
  grupkodu?: string | null
  ozelkod1?: string | null
  eposta?: string | null
  tckimlikno?: string | null
  potansiyel?: number
  carikarttipi?: string | null
  adresler_adres_adresadi?: string | null
  adresler_adres_adres1?: string | null
  adresler_adres_ilce?: string | null
  adresler_adres_sehir?: string | null
  adresler_adres_telefon1?: string | null
  adresler_adres_ceptel?: string | null
  created_at?: string
}

const diaCariKartlarListDefaults = { search: '', page: 1, pageSize: 'fit' as PageSizeValue, fitLimit: 10 }

export function DiaCariKartlarPage() {
  const [listState, setListState] = usePersistedListState('dia-cari-kartlar', diaCariKartlarListDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [data, setData] = useState<DiaCariKart[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<DiaCariKart | null>(null)
  const [transferLoading, setTransferLoading] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0

  const handleTransferParasut = useCallback(async () => {
    if (!detailItem) return
    setTransferLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/dia/cari-kartlar/${detailItem.id}/transfer-parasut`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Aktarım başarısız')
      toastSuccess('Paraşüt\'e aktarıldı', json.message || 'Müşteri Paraşüt\'e başarıyla eklendi.')
    } catch (err) {
      toastError('Aktarım hatası', err instanceof Error ? err.message : 'Paraşüt\'e aktarılamadı')
    } finally {
      setTransferLoading(false)
    }
  }, [detailItem])
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/dia/cari-kartlar?${params}`)
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

  return (
    <PageLayout
      title="Dia Cari Kartlar"
      description="MySQL dia_cari_kartlar'dan aktarılan cari kart verileri"
      backTo="/dia"
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
              placeholder="Ara (ünvan, kod, vergi no, e-posta)..."
              value={search}
              onChange={(e) => setListState({ search: e.target.value })}
              className="pl-8 w-64 h-9"
            />
          </div>
          {hasFilter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="p-2 rounded-md hover:bg-muted"
                  onClick={() => setListState({ search: '', page: 1 })}
                >
                  <X className="h-4 w-4" />
                </button>
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
                  <th className="text-left p-3 font-medium">Ünvan</th>
                  <th className="text-left p-3 font-medium">Cari Kart Kodu</th>
                  <th className="text-left p-3 font-medium">Vergi Dairesi</th>
                  <th className="text-left p-3 font-medium">Grup</th>
                  <th className="text-left p-3 font-medium">Potansiyel</th>
                  <th className="text-left p-3 font-medium">Cari Kart Tipi</th>
                  <th className="text-left p-3 font-medium">Şehir</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{error || 'Henüz kayıt yok.'}</td></tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => setDetailItem(item)}
                    >
                      <td className="p-3 font-medium">{item.unvan || '—'}</td>
                      <td className="p-3">{item.carikartkodu || '—'}</td>
                      <td className="p-3">{item.vergidairesi_adi || '—'}</td>
                      <td className="p-3">{item.grupkodu || '—'}</td>
                      <td className="p-3">{item.potansiyel ? 'Evet' : 'Hayır'}</td>
                      <td className="p-3">{item.carikarttipi || '—'}</td>
                      <td className="p-3">{item.adresler_adres_sehir || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailItem?.unvan || 'Cari Kart Detayı'}</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailRow label="Cari Kayıt Türü" value={detailItem.carikayitturu} />
                <DetailRow label="Cari Kart Kodu" value={detailItem.carikartkodu} />
                <DetailRow label="Ünvan" value={detailItem.unvan} />
                <DetailRow label="Vergi Dairesi" value={detailItem.vergidairesi_adi} />
                <DetailRow label="Vergi Numarası" value={detailItem.verginumarasi} />
                <DetailRow label="TC Kimlik No" value={detailItem.tckimlikno} />
                <DetailRow label="Grup Kodu" value={detailItem.grupkodu} />
                <DetailRow label="Özel Kod 1" value={detailItem.ozelkod1} />
                <DetailRow label="E-posta" value={detailItem.eposta} />
                <DetailRow label="Potansiyel" value={detailItem.potansiyel ? 'Evet' : 'Hayır'} />
                <DetailRow label="Cari Kart Tipi" value={detailItem.carikarttipi} />
              </div>
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Adres Bilgileri</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailRow label="Adres Adı" value={detailItem.adresler_adres_adresadi} />
                  <DetailRow label="Adres" value={detailItem.adresler_adres_adres1} />
                  <DetailRow label="İlçe" value={detailItem.adresler_adres_ilce} />
                  <DetailRow label="Şehir" value={detailItem.adresler_adres_sehir} />
                  <DetailRow label="Telefon" value={detailItem.adresler_adres_telefon1} />
                  <DetailRow label="Cep Telefonu" value={detailItem.adresler_adres_ceptel} />
                </div>
              </div>
              <div className="border-t pt-4 text-xs text-muted-foreground">
                <DetailRow label="Oluşturulma" value={detailItem.created_at} />
              </div>
            </div>
          )}
          <DialogFooter className="flex-row justify-end gap-2 border-t pt-4 mt-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTransferParasut}
                  disabled={transferLoading || !detailItem?.unvan?.trim()}
                >
                  {transferLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="ml-2">Paraşüte aktar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {!detailItem?.unvan?.trim()
                  ? 'Ünvan boş olduğu için aktarılamaz'
                  : 'Cari kartı Paraşüt\'e müşteri olarak aktarır'}
              </TooltipContent>
            </Tooltip>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  const display = value == null || value === '' ? '—' : String(value)
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{display}</div>
    </div>
  )
}
