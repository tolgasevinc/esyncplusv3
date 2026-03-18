import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, Plus, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { formatDate, formatPrice } from '@/lib/utils'
import type { Offer } from './teklif-common'

const offersListDefaults = { search: '', page: 1, pageSize: 'fit' as PageSizeValue, fitLimit: 10 }

export function TekliflerPage() {
  const navigate = useNavigate()
  const [listState, setListState] = usePersistedListState('offers', offersListDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [data, setData] = useState<Offer[]>([])
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
      const res = await fetch(`${API_URL}/api/offers?${params}`)
      const json = await parseJsonResponse<{ data?: Offer[]; total?: number; error?: string }>(res)
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

  const openNew = () => navigate('/teklifler/yeni')
  const openEdit = (item: Offer) => navigate(`/teklifler/${item.id}`)


  return (
    <PageLayout
      title="Teklifler"
      description="Teklif listesini yönetin"
      backTo="/"
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
              placeholder="Ara (teklif no, müşteri, açıklama)..."
              value={search}
              onChange={(e) => setListState({ search: e.target.value })}
              className="pl-8 w-64 h-9"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={openNew}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni teklif</TooltipContent>
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
                  <th className="text-left p-3 font-medium">Teklif No</th>
                  <th className="text-left p-3 font-medium">Tarih</th>
                  <th className="text-left p-3 font-medium">Müşteri</th>
                  <th className="text-left p-3 font-medium">Açıklama</th>
                  <th className="text-right p-3 font-medium">Teklif Toplamı</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{error || 'Henüz teklif yok.'}</td></tr>
                ) : (
                  data.map((item) => {
                    const isTry = !item.currency_code || item.currency_code === 'TRY' || item.currency_code === 'TL'
                    return (
                      <tr
                        key={item.id}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => openEdit(item)}
                      >
                        <td className="p-3 font-medium">{item.order_no || '—'}</td>
                        <td className="p-3">{item.date ? formatDate(item.date) : '—'}</td>
                        <td className="p-3">{item.customer_title || '—'}</td>
                        <td className="p-3 text-muted-foreground max-w-[200px] truncate">{item.description || '—'}</td>
                        <td className="p-3 text-right">
                          <div className="flex flex-col items-end gap-0.5 text-sm">
                            <span className="font-medium tabular-nums">{formatPrice(item.total_tl_offer ?? 0)} ₺</span>
                            {!isTry && item.currency_symbol && (
                              <span className="text-destructive tabular-nums text-xs">
                                {formatPrice(item.total_amount ?? 0)} {item.currency_symbol}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  )
}
