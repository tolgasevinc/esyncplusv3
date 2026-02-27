import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_URL } from '@/lib/api'

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
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0
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
                    <tr key={item.id} className="border-b hover:bg-muted/30">
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
    </PageLayout>
  )
}
