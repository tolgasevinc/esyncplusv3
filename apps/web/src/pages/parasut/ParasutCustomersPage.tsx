import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, Users, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Paraşüt contact (account_type=customer) — API attributes düzleştirilmiş */
interface ParasutContact {
  id: string
  name?: string
  email?: string
  phone?: string
  tax_number?: string
  tax_office?: string
  address?: string
  city?: string
  [key: string]: unknown
}

export function ParasutCustomersPage() {
  const [rows, setRows] = useState<ParasutContact[]>([])
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    total_pages: 1,
    per_page: 25,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeValue>(25)
  const [fitLimit, setFitLimit] = useState(25)
  const tableContainerRef = useRef<HTMLDivElement | null>(null)

  const limit = pageSize === 'fit' ? fitLimit : pageSize
  const effectiveLimit = Math.min(100, Math.max(1, limit))

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(effectiveLimit))
      if (searchDebounced) params.set('filter_name', searchDebounced)
      const res = await fetch(`${API_URL}/api/parasut/contacts?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Paraşüt müşterileri yüklenemedi')
      const list = (data.data ?? []) as ParasutContact[]
      setRows(list)
      setMeta(
        data.meta ?? {
          total: 0,
          page: 1,
          total_pages: 1,
          per_page: effectiveLimit,
        }
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bağlantı hatası')
      setRows([])
      setMeta({ total: 0, page: 1, total_pages: 1, per_page: effectiveLimit })
    } finally {
      setLoading(false)
    }
  }, [page, searchDebounced, effectiveLimit])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  return (
    <PageLayout
      title="Paraşüt Müşteriler"
      description="Paraşüt API üzerindeki müşteri (cari) kayıtları; uygulama veritabanındaki master müşteri listesinden ayrıdır"
      backTo="/parasut"
      contentOverflow="hidden"
      footerContent={
        !error && meta.total > 0 ? (
          <TablePaginationFooter
            total={meta.total}
            page={meta.page}
            pageSize={pageSize}
            fitLimit={fitLimit}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onFitLimitChange={setFitLimit}
            tableContainerRef={tableContainerRef}
            hasFilter={search.length > 0}
          />
        ) : null
      }
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Müşteriler (Paraşüt)
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="İsimde ara (Paraşüt)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button variant="outline" size="icon" onClick={fetchContacts} disabled={loading} aria-label="Yenile">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {error && (
            <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 mx-4 rounded-lg shrink-0">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div ref={tableContainerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Ad / Ünvan</th>
                  <th className="text-left p-3 font-medium">E-posta</th>
                  <th className="text-left p-3 font-medium">Telefon</th>
                  <th className="text-left p-3 font-medium">Vergi no</th>
                  <th className="text-left p-3 font-medium min-w-[120px]">Vergi dairesi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      {searchDebounced ? 'Arama sonucu bulunamadı.' : 'Müşteri kaydı bulunamadı.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{String(r.name ?? '—')}</td>
                      <td className="p-3 text-muted-foreground">{String(r.email ?? '—')}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{String(r.phone ?? '—')}</td>
                      <td className="p-3 font-mono text-xs">{String(r.tax_number ?? '—')}</td>
                      <td className="p-3 text-muted-foreground">{String(r.tax_office ?? '—')}</td>
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
