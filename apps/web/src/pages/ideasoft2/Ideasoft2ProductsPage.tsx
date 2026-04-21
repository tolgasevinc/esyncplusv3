import { useCallback, useEffect, useRef, useState } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { ImageIcon, Search, X, Banknote } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import type { IdeasoftProductImageRow } from '@/pages/ideasoft/IdeasoftProductImagesPage'

const FX_STORAGE_KEY = 'ideasoft2-fx-v1'

function getInitialFxFromStorage(): { eur: string; usd: string } {
  if (typeof window === 'undefined') return { eur: '', usd: '' }
  try {
    const raw = localStorage.getItem(FX_STORAGE_KEY)
    if (!raw) return { eur: '', usd: '' }
    const j = JSON.parse(raw) as { eur?: string; usd?: string }
    return {
      eur: typeof j.eur === 'string' ? j.eur : '',
      usd: typeof j.usd === 'string' ? j.usd : '',
    }
  } catch {
    return { eur: '', usd: '' }
  }
}

/** Product LIST — fiyat / iskonto / kur için gerekli alanlar */
interface Ideasoft2ProductListRow {
  id: number
  name?: string
  fullName?: string
  sku?: string
  stockAmount?: number
  price1?: number
  discount?: number
  /** IdeaSoft ürün API: 0 = sabit tutar, 1 = yüzde (applyIdeasoftDiscountToPayload ile uyumlu). */
  discountType?: number
  /** KDV oranı % (tax). */
  tax?: number
  /** 1 = fiyatlar KDV dahil, 0 = KDV hariç (IdeasoftProductEditModal ile uyumlu). */
  taxIncluded?: number
  currency?: { id?: number; label?: string; abbr?: string }
}

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
}

/** Hydra / bazı API’ler total’i string döndürebilir — sayfalama için sayıya çevir */
function parseCollectionTotal(o: Record<string, unknown>, fallbackLen: number): number {
  const raw = o['hydra:totalItems'] ?? o.totalItems ?? o.total ?? o.count
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return fallbackLen
}

/** Ideasoft Ürünler sayfası ile aynı — Product COUNT yanıtı */
function parseProductCount(json: unknown): number | null {
  if (typeof json === 'number' && Number.isFinite(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.total === 'number' && Number.isFinite(o.total)) return o.total
    if (typeof o.count === 'number' && Number.isFinite(o.count)) return o.count
    if (typeof o['hydra:totalItems'] === 'number' && Number.isFinite(o['hydra:totalItems'] as number)) {
      return o['hydra:totalItems'] as number
    }
    const raw = o['hydra:totalItems'] ?? o.total ?? o.count
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = parseInt(raw.trim(), 10)
      if (Number.isFinite(n) && n >= 0) return n
    }
  }
  return null
}

function extractProductsList(json: unknown): { items: Ideasoft2ProductListRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as Ideasoft2ProductListRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      return { items: hydra as Ideasoft2ProductListRow[], total: parseCollectionTotal(o, hydra.length) }
    }
    const member = o.member
    if (Array.isArray(member)) {
      return { items: member as Ideasoft2ProductListRow[], total: parseCollectionTotal(o, member.length) }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as Ideasoft2ProductListRow[]
      const total = typeof o.total === 'number' ? o.total : parseCollectionTotal(o, d.length)
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as Ideasoft2ProductListRow[]
      const total = typeof o.total === 'number' ? o.total : parseCollectionTotal(o, items.length)
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

/** product_images LIST yanıtı — IdeasoftProductImagesPage ile aynı */
function extractProductImagesList(json: unknown): { items: IdeasoftProductImageRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftProductImageRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftProductImageRow[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as IdeasoftProductImageRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftProductImageRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as IdeasoftProductImageRow[]
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function sortImagesForProduct(images: IdeasoftProductImageRow[]): IdeasoftProductImageRow[] {
  return [...images].sort((a, b) => {
    const sa = a.sortOrder ?? 99
    const sb = b.sortOrder ?? 99
    if (sa !== sb) return sa - sb
    return a.id - b.id
  })
}

async function fetchImagesForProduct(productId: number): Promise<IdeasoftProductImageRow[]> {
  const params = new URLSearchParams({
    product: String(productId),
    limit: '100',
    page: '1',
    sort: 'id',
  })
  const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_images?${params}`)
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) return []
  const { items } = extractProductImagesList(data)
  return sortImagesForProduct(items)
}

function parseFxInput(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = parseFloat(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * IdeaSoft: discountType 0 = sabit tutar, 1 = yüzde.
 * İskontolu net fiyat, ürünün para biriminde.
 */
function netPriceAfterDiscount(row: Ideasoft2ProductListRow): number | null {
  const p = row.price1
  if (p == null || !Number.isFinite(Number(p))) return null
  const price = Number(p)
  const d = row.discount != null ? Number(row.discount) : 0
  const dt = row.discountType ?? 1
  if (!Number.isFinite(d) || d <= 0) return price
  if (dt === 0) return Math.max(0, price - d)
  return Math.max(0, price * (1 - d / 100))
}

function currencyKey(row: Ideasoft2ProductListRow): 'TRY' | 'EUR' | 'USD' | 'OTHER' {
  const raw = (row.currency?.abbr || row.currency?.label || '').trim().toUpperCase()
  if (!raw) return 'OTHER'
  if (raw === 'TRY' || raw === 'TL' || raw === '₺') return 'TRY'
  if (raw === 'EUR' || raw === '€' || raw === 'EURO') return 'EUR'
  if (raw === 'USD' || raw === '$' || raw === 'US' || raw === 'DOLAR') return 'USD'
  return 'OTHER'
}

/**
 * İskontolu net tutarı mağazada gösterilecek şekilde KDV dahile çevirir.
 * taxIncluded === 0 ise net KDV hariç kabul edilip KDV eklenir; 1 veya belirsiz ise aynen.
 */
function toTaxInclusiveAmount(net: number, row: Ideasoft2ProductListRow): number {
  const ti = row.taxIncluded
  if (ti === 0) {
    const rate = row.tax != null ? Number(row.tax) : 0
    if (!Number.isFinite(rate) || rate < 0) return net
    return net * (1 + rate / 100)
  }
  return net
}

function netPriceInTry(
  net: number,
  row: Ideasoft2ProductListRow,
  eurTry: number | null,
  usdTry: number | null
): number | null {
  const k = currencyKey(row)
  if (k === 'TRY') return net
  if (k === 'EUR') {
    if (eurTry == null) return null
    return net * eurTry
  }
  if (k === 'USD') {
    if (usdTry == null) return null
    return net * usdTry
  }
  return null
}

/** Tüm iskontolar % ile; sabit tutarda liste fiyatına göre eşdeğer yüzde. */
function formatDiscountCell(row: Ideasoft2ProductListRow): string {
  const d = row.discount
  if (d == null || !Number.isFinite(Number(d)) || Number(d) <= 0) return '—'
  const dt = row.discountType ?? 1
  const dNum = Number(d)

  if (dt === 0) {
    const p1 = row.price1 != null ? Number(row.price1) : NaN
    if (!Number.isFinite(p1) || p1 <= 0) return '—'
    const pct = (dNum / p1) * 100
    if (!Number.isFinite(pct)) return '—'
    return `${pct.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
  }

  return `${dNum.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`
}

function formatMoneyTr(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** IdeaSoft liste fiyatı (price1 + para birimi) */
function formatIdeasoftListPrice(row: Ideasoft2ProductListRow): string | null {
  const p = row.price1
  if (p == null || !Number.isFinite(Number(p))) return null
  const price = Number(p)
  const abbr = row.currency?.abbr?.trim()
  return `${formatMoneyTr(price)}${abbr ? ` ${abbr}` : ''}`
}

function displayProductName(row: Ideasoft2ProductListRow): string {
  const n = (row.fullName || row.name || '').trim()
  return n || '—'
}

export function Ideasoft2ProductsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft2-products-v1', listDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const contentRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<Ideasoft2ProductListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [imageByProductId, setImageByProductId] = useState<Record<number, IdeasoftProductImageRow[]>>({})

  /** Manuel EUR/USD kurları — tarayıcıda kalıcı (ilk yüklemede boş string ile üzerine yazma hatası giderildi) */
  const [manualFx, setManualFx] = useState(() => getInitialFxFromStorage())

  useEffect(() => {
    try {
      localStorage.setItem(
        FX_STORAGE_KEY,
        JSON.stringify({ eur: manualFx.eur, usd: manualFx.usd })
      )
    } catch {
      /* ignore */
    }
  }, [manualFx])

  const eurTry = parseFxInput(manualFx.eur)
  const usdTry = parseFxInput(manualFx.usd)

  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))

  const buildListParams = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: 'id',
    })
    if (search.trim()) params.set('s', search.trim())
    return params
  }, [page, limit, search])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    setImageByProductId({})
    try {
      const params = buildListParams()
      /** IdeaSoft Ürünler ile aynı proxy — Worker’daki /ideasoft2 özel route’a bağlı kalmadan sayfalama çalışır */
      const [res, resCount] = await Promise.all([
        fetch(`${API_URL}/api/ideasoft/admin-api/products?${params}`),
        fetch(`${API_URL}/api/ideasoft/admin-api/products/count?${params}`),
      ])
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı'
        )
        setItems([])
        setTotal(0)
        setImageByProductId({})
        return
      }
      let { items: rows, total: t } = extractProductsList(data)
      if (resCount.ok) {
        try {
          const countData = await parseJsonResponse<unknown>(resCount)
          const c = parseProductCount(countData)
          if (c != null) t = c
        } catch {
          /* COUNT okunamazsa liste hydra toplamı */
        }
      }
      setItems(rows)
      setTotal(t)
      const imageEntries = await Promise.all(
        rows.map(async (r) => {
          const list = await fetchImagesForProduct(r.id)
          return [r.id, list] as const
        })
      )
      const nextImages: Record<number, IdeasoftProductImageRow[]> = {}
      for (const [id, list] of imageEntries) nextImages[id] = list
      setImageByProductId(nextImages)
    } catch {
      setListError('Liste alınamadı')
      setItems([])
      setTotal(0)
      setImageByProductId({})
    } finally {
      setLoading(false)
    }
  }, [buildListParams])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  return (
    <PageLayout
      title="IdeaSoft 2 › Ürünler"
      description="Yayınlanan sütunu iskontolu net fiyatı KDV dahil gösterir; TL manuel EUR/USD kurlarıyla hesaplanır."
      backTo="/ideasoft2"
      contentRef={contentRef}
      contentOverflow="hidden"
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-[200px] max-w-sm sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 pr-9"
              placeholder="Ara (s)…"
              value={search}
              onChange={(e) => setListState({ search: e.target.value, page: 1 })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void fetchList()
              }}
            />
            {search ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setListState({ search: '', page: 1 })}
                aria-label="Aramayı temizle"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <Banknote className="h-4 w-4" />
                Kur
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72 p-0"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div className="space-y-3 p-3">
                <p className="text-xs text-muted-foreground leading-snug">
                  1 EUR ve 1 USD için Türk lirası karşılığını girin. Yayınlanan (KDV dahil) tutar bu kurla TL’ye
                  çevrilir. Değerler bu tarayıcıda saklanır; tekrar girmeniz gerekmez.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="ideasoft2-fx-eur" className="text-xs">
                    1 EUR = ₺
                  </Label>
                  <Input
                    id="ideasoft2-fx-eur"
                    inputMode="decimal"
                    placeholder="örn. 36,50"
                        value={manualFx.eur}
                        onChange={(e) => setManualFx((p) => ({ ...p, eur: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ideasoft2-fx-usd" className="text-xs">
                    1 USD = ₺
                  </Label>
                  <Input
                    id="ideasoft2-fx-usd"
                    inputMode="decimal"
                    placeholder="örn. 34,20"
                        value={manualFx.usd}
                        onChange={(e) => setManualFx((p) => ({ ...p, usd: e.target.value }))}
                  />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="secondary" size="sm" onClick={() => void fetchList()}>
            Yenile
          </Button>
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
          onFitLimitChange={(fl) => setListState({ fitLimit: fl })}
          tableContainerRef={contentRef}
          hasFilter={search.trim().length > 0}
        />
      }
    >
      <Card className="flex flex-1 min-h-0 flex-col overflow-hidden border-border">
        <CardContent className="flex flex-1 min-h-0 flex-col overflow-hidden p-0">
          {listError ? (
            <div className="shrink-0 border-b border-border px-4 py-3 text-sm text-destructive">{listError}</div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th
                    className="sticky top-0 z-20 w-[72px] border-b border-border bg-muted px-2 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))]"
                    scope="col"
                  >
                    <span className="sr-only">Görsel</span>
                    <ImageIcon className="mx-auto h-4 w-4 opacity-70" aria-hidden />
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))] min-w-[200px]">
                    Ürün
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    Stok
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    Fiyat
                  </th>
                  <th className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap">
                    İskonto %
                  </th>
                  <th
                    className="sticky top-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))] whitespace-nowrap"
                    scope="col"
                  >
                    <span className="block leading-tight">Yayınlanan</span>
                    <span className="block text-xs font-normal text-muted-foreground">KDV dahil · TL</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      Kayıt yok
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const net = netPriceAfterDiscount(row)
                    const published =
                      net != null && Number.isFinite(net) ? toTaxInclusiveAmount(net, row) : null
                    const tryNet =
                      published != null && Number.isFinite(published)
                        ? netPriceInTry(published, row, eurTry, usdTry)
                        : null
                    const ck = currencyKey(row)
                    const rowImages = imageByProductId[row.id] ?? []
                    const thumb = rowImages[0]
                    const imageCount = rowImages.length

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/80 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="w-[72px] px-2 py-2 align-top">
                          <div className="relative inline-flex">
                            {thumb?.thumbUrl || thumb?.originalUrl ? (
                              <img
                                src={thumb.thumbUrl || thumb.originalUrl}
                                alt=""
                                className="h-10 w-10 rounded-full border border-border object-cover bg-muted"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            {imageCount > 1 ? (
                              <Badge
                                variant="default"
                                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center p-0 px-1 text-[10px] font-bold shadow-sm"
                                aria-label={`${imageCount} görsel`}
                              >
                                {imageCount}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-foreground leading-snug">
                            {displayProductName(row)}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {(row.sku || '').trim() || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums align-top">
                          {row.stockAmount != null && Number.isFinite(Number(row.stockAmount))
                            ? String(row.stockAmount)
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums align-top">
                          {formatIdeasoftListPrice(row) ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-top">
                          {formatDiscountCell(row)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium align-top">
                          {tryNet != null && Number.isFinite(tryNet) ? (
                            <>₺{formatMoneyTr(tryNet)}</>
                          ) : ck === 'OTHER' ? (
                            <span className="text-muted-foreground font-normal text-xs">Kur tanımsız</span>
                          ) : (ck === 'EUR' && eurTry == null) || (ck === 'USD' && usdTry == null) ? (
                            <span className="text-muted-foreground font-normal text-xs">Kur girin</span>
                          ) : (
                            '—'
                          )}
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
