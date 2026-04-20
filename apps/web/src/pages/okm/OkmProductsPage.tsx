import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, ExternalLink, Loader2, Search, X } from 'lucide-react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { toastError, toastSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'

type OkmProductMeta = {
  sef_value: string | null
  sef_column: string | null
  title_guess: string | null
  legacy_product_url: string | null
}

type ProductRow = Record<string, unknown> & { _okm_meta?: OkmProductMeta }

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 'fit' as PageSizeValue,
  fitLimit: 12,
}

function pickDisplayId(row: ProductRow): string {
  const keys = ['id', 'urun_id', 'product_id', 'UrunID', 'ID']
  for (const k of keys) {
    const hit = Object.keys(row).find((x) => x.toLowerCase() === k.toLowerCase())
    if (hit && row[hit] != null && String(row[hit]).trim() !== '') return String(row[hit]).trim()
  }
  return '—'
}

export function OkmProductsPage() {
  const [listState, setListState] = usePersistedListState('okm-products-v1', listDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{
    product_table: string
    product_order_column: string
    sef_column_resolved: string | null
    legacy_site_base_url: string
    product_url_path_segment: string
  } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<ProductRow | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const limit =
    pageSize === 'fit' ? Math.min(200, Math.max(1, fitLimit)) : Math.min(200, Math.max(1, pageSize as number))
  const hasFilter = search.trim().length > 0

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`${API_URL}/api/okm/products?${params}`)
      const data = await parseJsonResponse<{
        data?: ProductRow[]
        total?: number
        error?: string
        product_table?: string
        product_order_column?: string
        sef_column_resolved?: string | null
        legacy_site_base_url?: string
        product_url_path_segment?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Liste alınamadı')
      setRows(Array.isArray(data.data) ? data.data : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
      setMeta({
        product_table: data.product_table ?? '',
        product_order_column: data.product_order_column ?? 'id',
        sef_column_resolved: data.sef_column_resolved ?? null,
        legacy_site_base_url: data.legacy_site_base_url ?? '',
        product_url_path_segment: data.product_url_path_segment ?? 'urun',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
      setRows([])
      setTotal(0)
      setMeta(null)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search])

  useEffect(() => {
    void load()
  }, [load])

  function openDetail(r: ProductRow) {
    setDetailRow(r)
    setDetailOpen(true)
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toastSuccess('Panoya kopyalandı', label)
    } catch {
      toastError('Kopyalama', 'Panoya yazılamadı')
    }
  }

  const detailEntries = useMemo(() => {
    if (!detailRow) return [] as { key: string; value: string }[]
    const out: { key: string; value: string }[] = []
    for (const [k, v] of Object.entries(detailRow)) {
      if (k === '_okm_meta') continue
      if (v != null && typeof v === 'object') {
        out.push({ key: k, value: JSON.stringify(v, null, 2) })
      } else {
        out.push({ key: k, value: v == null ? '—' : String(v) })
      }
    }
    out.sort((a, b) => a.key.localeCompare(b.key))
    return out
  }, [detailRow])

  const description = meta
    ? `Tablo: ${meta.product_table} · ORDER BY ${meta.product_order_column} DESC · SEF sütunu: ${meta.sef_column_resolved ?? '—'}`
    : 'OKM MySQL’deki ürün tablosu ve SEF (adres) bilgisi'

  return (
    <PageLayout
      title="OKM — Ürünler (eski site)"
      description={description}
      backTo="/okm"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => void load()}
      headerActions={
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="relative flex-1 min-w-[12rem] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-9"
              placeholder="Ara (ad, SEF, stok kodu…)"
              value={search}
              onChange={(e) =>
                setListState({
                  search: e.target.value,
                  page: 1,
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load()
              }}
            />
            {hasFilter && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setListState({ search: '', page: 1 })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Aramayı temizle</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      }
      footerContent={
        <TablePaginationFooter
          total={total}
          page={page}
          pageSize={pageSize}
          fitLimit={fitLimit}
          onPageChange={(p) => setListState({ page: p })}
          onPageSizeChange={(size) =>
            setListState({
              pageSize: size,
              page: 1,
            })
          }
          onFitLimitChange={(n) => setListState({ fitLimit: n })}
          tableContainerRef={contentRef}
          hasFilter={hasFilter}
        />
      }
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardHeader className="shrink-0">
          <CardTitle>Eski site ürün listesi</CardTitle>
          <CardDescription>
            Bağlantı ve tablo{' '}
            <Link className="underline font-medium text-foreground" to="/ayarlar/entegrasyonlar?tab=okm">
              Ayarlar › Entegrasyonlar › OKM
            </Link>{' '}
            üzerinden yapılır. <strong>SEF</strong> sütunu otomatik veya elle seçilir; tahmini tam adres için{' '}
            <strong>Eski site kök URL</strong> ve <strong>Ürün URL yol segmenti</strong> (ör. <code className="text-[11px] bg-muted px-1 rounded">urun</code>)
            kullanılır.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Yükleniyor…
            </div>
          )}
          {!loading && error && <p className="text-sm text-destructive py-4 px-4">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 px-4">Kayıt yok veya ürün tablosu ayarlı değil.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-2 font-medium whitespace-nowrap min-w-[140px]">SEF / adres</th>
                    <th className="p-2 font-medium whitespace-nowrap min-w-[100px]">Kimlik</th>
                    <th className="p-2 font-medium min-w-[160px]">Başlık (tahmin)</th>
                    <th className="p-2 font-medium min-w-[200px]">Tahmini eski site linki</th>
                    <th className="p-2 font-medium w-[100px]"> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const m = row._okm_meta
                    const sef = m?.sef_value ?? ''
                    const title = m?.title_guess ?? ''
                    const url = m?.legacy_product_url
                    const idDisp = pickDisplayId(row)
                    return (
                      <tr
                        key={`${idDisp}-${i}`}
                        className={cn(
                          'border-b border-border/60 align-top hover:bg-muted/30 cursor-pointer',
                        )}
                        onClick={() => openDetail(row)}
                      >
                        <td className="p-2 font-mono text-xs break-all">
                          {sef ? (
                            <span className="text-foreground font-medium">{sef}</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-500">— SEF bulunamadı</span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap tabular-nums">{idDisp}</td>
                        <td className="p-2 max-w-[280px] break-words">{title || '—'}</td>
                        <td className="p-2 max-w-[min(40vw,320px)]">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary underline break-all text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              {url}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {meta?.legacy_site_base_url
                                ? 'SEF veya kök URL eksik'
                                : 'Eski site kök URL tanımlayın (OKM ayarları)'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {sef ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => void copyText('SEF', sef)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>SEF’i kopyala</TooltipContent>
                              </Tooltip>
                            ) : null}
                            {url ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => void copyText('URL', url)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Linki kopyala</TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[min(100vw-2rem,720px)] max-h-[min(90vh,800px)] flex flex-col">
          <DialogHeader>
            <DialogTitle>Ürün satırı (MySQL)</DialogTitle>
            <p className="text-sm text-muted-foreground font-normal">
              {detailRow?._okm_meta?.sef_column
                ? `SEF sütunu: ${detailRow._okm_meta.sef_column}`
                : 'Tüm sütunlar'}
            </p>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
            {detailRow?._okm_meta && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <p>
                  <span className="text-muted-foreground">SEF değeri:</span>{' '}
                  <span className="font-mono">{detailRow._okm_meta.sef_value ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Tahmini URL:</span>{' '}
                  {detailRow._okm_meta.legacy_product_url ? (
                    <a
                      href={detailRow._okm_meta.legacy_product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline break-all"
                    >
                      {detailRow._okm_meta.legacy_product_url}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
            )}
            {detailEntries.map(({ key, value }) => (
              <div key={key} className="grid grid-cols-[minmax(0,140px)_1fr] gap-2 text-xs border-b border-border/50 pb-2">
                <span className="text-muted-foreground font-medium break-all">{key}</span>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">{value}</pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
