import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Upload, ExternalLink, Store, Image as ImageIcon, FileText, FolderTree } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  IdeasoftTransferReportDialog,
  type IdeasoftTransferReportStep,
} from '@/components/IdeasoftTransferReportDialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter } from '@/components/TablePaginationFooter'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toastSuccess, toastError } from '@/lib/toast'
import { CategorySelect, type CategoryItem } from '@/components/CategorySelect'

const IDEASOFT_ATTR_LABELS: Record<string, string> = {
  name: 'Ürün adı',
  sku: 'SKU',
  list_price: 'Genel fiyat',
  quantity: 'Stok miktarı',
  description: 'Açıklama',
}

const IDEASOFT_ATTR_SORT_ORDER = ['name', 'sku', 'list_price', 'quantity', 'description']

function sortIdeasoftAttributeKeys(keys: string[]): string[] {
  const rank = (k: string) => {
    const i = IDEASOFT_ATTR_SORT_ORDER.indexOf(k)
    return i === -1 ? 999 : i
  }
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

type OverviewRow = {
  id: number
  name: string
  sku: string | null
  category_id?: number | null
  brand_id?: number | null
  ecommerce_enabled: number
  ideasoft_product_id: string | null
}

type MasterBrand = { id: number; name: string; code?: string }

function fetchErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|networkerror|load failed|network request failed|aborted/i.test(msg)) {
    return 'Sunucuya ulaşılamadı veya istek yarım kaldı. Tekrar deneyin.'
  }
  return msg
}

export function IdeasoftProductsTransferPage() {
  const [rows, setRows] = useState<OverviewRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(50)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterCategoryId, setFilterCategoryId] = useState<number | ''>('')
  const [filterBrandId, setFilterBrandId] = useState<number | ''>('')
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [brands, setBrands] = useState<MasterBrand[]>([])
  const [filtersLoading, setFiltersLoading] = useState(true)
  const [partialBusy, setPartialBusy] = useState<{ productId: number; part: string } | null>(null)

  const [dialogProductId, setDialogProductId] = useState<number | null>(null)
  const [ideasoftPreviewLoading, setIdeasoftPreviewLoading] = useState(false)
  const [ideasoftPreview, setIdeasoftPreview] = useState<{
    ideasoft_id: string | null
    ideasoft_product: { id?: string; name?: string; sku?: string } | null
    sku_used: string
    currency_code?: string
    mapped_category_id: string | null
    mapped_brand_id: string | null
    attributes_display: Record<string, unknown>
    has_photo: boolean
  } | null>(null)
  const [ideasoftPreviewError, setIdeasoftPreviewError] = useState<string | null>(null)
  const [ideasoftFieldEdits, setIdeasoftFieldEdits] = useState<Record<string, string>>({})
  const [ideasoftTransferLoading, setIdeasoftTransferLoading] = useState(false)
  const [ideasoftManualId, setIdeasoftManualId] = useState('')
  const [ideasoftForceCreate, setIdeasoftForceCreate] = useState(false)
  const [ideasoftTransferReportOpen, setIdeasoftTransferReportOpen] = useState(false)
  const [ideasoftTransferReportSteps, setIdeasoftTransferReportSteps] = useState<IdeasoftTransferReportStep[] | null>(
    null
  )

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('limit', String(limit))
    if (filterCategoryId !== '') p.set('category_id', String(filterCategoryId))
    if (filterBrandId !== '') p.set('brand_id', String(filterBrandId))
    return p.toString()
  }, [page, limit, filterCategoryId, filterBrandId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setFiltersLoading(true)
      try {
        const [catRes, brandRes] = await Promise.all([
          fetch(`${API_URL}/api/product-categories?limit=9999`),
          fetch(`${API_URL}/api/product-brands?limit=9999`),
        ])
        const catJson = catRes.ok ? await catRes.json() : {}
        const brandJson = brandRes.ok ? await brandRes.json() : {}
        if (cancelled) return
        setCategories(
          (catJson.data ?? []).map(
            (x: {
              id: number
              name: string
              code: string
              group_id?: number | null
              category_id?: number | null
              sort_order?: number
              color?: string
            }) => ({
              id: x.id,
              name: x.name,
              code: x.code,
              group_id: x.group_id,
              category_id: x.category_id,
              sort_order: x.sort_order,
              color: x.color,
            })
          )
        )
        setBrands(
          (brandJson.data ?? []).map((x: { id: number; name: string; code?: string }) => ({
            id: x.id,
            name: x.name,
            code: x.code,
          }))
        )
      } catch {
        if (!cancelled) {
          setCategories([])
          setBrands([])
        }
      } finally {
        if (!cancelled) setFiltersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/products/overview?${filterQuery}`)
      const data = await parseJsonResponse<{
        data?: OverviewRow[]
        total?: number
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Liste alınamadı')
      setRows((data.data ?? []) as OverviewRow[])
      setTotal(typeof data.total === 'number' ? data.total : 0)
    } catch (e) {
      setError(fetchErrorMessage(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filterQuery])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const runPartialSync = useCallback(
    async (productId: number, part: 'images' | 'seo' | 'category') => {
      setPartialBusy({ productId, part })
      try {
        const res = await fetch(`${API_URL}/api/ideasoft/products/partial-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: productId, part }),
        })
        const data = await parseJsonResponse<{ error?: string; message?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'İşlem başarısız')
        toastSuccess('Tamam', data.message ?? 'Güncellendi')
        void loadOverview()
      } catch (e) {
        toastError('Hata', fetchErrorMessage(e))
      } finally {
        setPartialBusy(null)
      }
    },
    [loadOverview]
  )

  const openDialog = useCallback(
    async (productId: number) => {
      setDialogProductId(productId)
      setIdeasoftPreview(null)
      setIdeasoftPreviewError(null)
      setIdeasoftFieldEdits({})
      setIdeasoftManualId('')
      setIdeasoftForceCreate(false)
      setIdeasoftPreviewLoading(true)
      try {
        const res = await fetch(`${API_URL}/api/ideasoft/products/push-preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: productId }),
        })
        const data = await parseJsonResponse<{
          error?: string
          ideasoft_id?: string | null
          ideasoft_product?: { id?: string; name?: string; sku?: string } | null
          sku_used?: string
          currency_code?: string
          mapped_category_id?: string | null
          mapped_brand_id?: string | null
          attributes_display?: Record<string, unknown>
          has_photo?: boolean
        }>(res)
        if (!res.ok) throw new Error(data.error || 'Önizleme alınamadı')
        setIdeasoftPreview({
          ideasoft_id: data.ideasoft_id != null && String(data.ideasoft_id).trim() !== '' ? String(data.ideasoft_id).trim() : null,
          ideasoft_product: data.ideasoft_product ?? null,
          sku_used: String(data.sku_used ?? ''),
          currency_code: data.currency_code?.trim() ? data.currency_code.trim().toUpperCase() : undefined,
          mapped_category_id: data.mapped_category_id ?? null,
          mapped_brand_id: data.mapped_brand_id ?? null,
          attributes_display: data.attributes_display ?? {},
          has_photo: !!data.has_photo,
        })
        const disp = data.attributes_display ?? {}
        const edits: Record<string, string> = {}
        for (const [k, v] of Object.entries(disp)) {
          if (v == null || v === '') edits[k] = ''
          else if (typeof v === 'number') edits[k] = String(v)
          else edits[k] = String(v)
        }
        setIdeasoftFieldEdits(edits)
      } catch (e) {
        setIdeasoftPreviewError(fetchErrorMessage(e))
      } finally {
        setIdeasoftPreviewLoading(false)
      }
    },
    []
  )

  const submitTransfer = useCallback(async () => {
    if (!dialogProductId || !ideasoftPreview) return
    const manual = ideasoftManualId.trim()
    const nameEd = ideasoftFieldEdits.name?.trim()
    if (!nameEd) {
      toastError('Hata', 'Ürün adı boş olamaz.')
      return
    }
    const numericKeys = new Set(['list_price', 'quantity'])
    const overrides: Record<string, unknown> = {}
    for (const [k, raw] of Object.entries(ideasoftFieldEdits)) {
      const s = raw.trim()
      if (s === '') {
        overrides[k] = ''
        continue
      }
      if (numericKeys.has(k)) {
        const n = parseFloat(s.replace(',', '.'))
        if (Number.isNaN(n)) {
          toastError('Hata', `"${IDEASOFT_ATTR_LABELS[k] ?? k}" için geçerli bir sayı girin.`)
          return
        }
        overrides[k] = n
      } else {
        overrides[k] = s
      }
    }
    setIdeasoftTransferLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/products/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: dialogProductId,
          ...(manual ? { ideasoft_product_id: manual } : {}),
          ...(ideasoftForceCreate ? { create_new: true } : {}),
          attribute_overrides: overrides,
        }),
      })
      const data = await parseJsonResponse<{
        error?: string
        message?: string
        created?: boolean
        brand_warning?: string
        category_warning?: string
        images_uploaded?: number
        image_warnings?: string[]
        transfer_report?: { steps?: IdeasoftTransferReportStep[] }
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Aktarım başarısız')
      const reportSteps = data.transfer_report?.steps
      if (Array.isArray(reportSteps) && reportSteps.length > 0) {
        setIdeasoftTransferReportSteps(reportSteps)
        setIdeasoftTransferReportOpen(true)
      }
      toastSuccess(
        'Tamam',
        (data as { message?: string }).message ||
          (data.created ? 'Ideasoft’ta yeni ürün oluşturuldu.' : 'Ideasoft ürünü güncellendi.')
      )
      setDialogProductId(null)
      setIdeasoftPreview(null)
      setIdeasoftFieldEdits({})
      setIdeasoftManualId('')
      setIdeasoftForceCreate(false)
      void loadOverview()
    } catch (e) {
      toastError('Hata', fetchErrorMessage(e))
    } finally {
      setIdeasoftTransferLoading(false)
    }
  }, [dialogProductId, ideasoftPreview, ideasoftFieldEdits, ideasoftManualId, ideasoftForceCreate, loadOverview])

  return (
    <PageLayout
      title="Ideasoft ürün aktarımı"
      description="Ürünleri Ideasoft mağazasına aktarın veya güncelleyin; kategori ve marka eşleştirmeleri ayrı sayfalardan yapılır."
      backTo="/ideasoft"
      contentOverflow="auto"
      headerActions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/products">
              <ExternalLink className="h-4 w-4 mr-2" />
              Ürünler
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadOverview()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Yenile
          </Button>
        </div>
      }
    >
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5" />
            Ürün listesi
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            <Link to="/ideasoft/categories" className="underline">
              Kategori
            </Link>{' '}
            ve{' '}
            <Link to="/ideasoft/brands" className="underline">
              marka
            </Link>{' '}
            eşleştirmeleri aktarımda Ideasoft tarafına iletilir.
          </p>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex flex-wrap gap-3 items-end px-4 py-3 border-b bg-muted/20 shrink-0">
            <div className="space-y-1.5 min-w-[min(100%,18rem)] flex-1">
              <Label className="text-xs text-muted-foreground">Kategori (seçilen ve alt kategoriler)</Label>
              <CategorySelect
                categories={categories}
                value={filterCategoryId}
                onChange={(id) => {
                  setFilterCategoryId(id)
                  setPage(1)
                }}
                placeholder="Tüm kategoriler"
                variant="badge"
                className="w-full"
                id="ideasoft-transfer-filter-cat"
              />
            </div>
            <div className="space-y-1.5 min-w-[min(100%,14rem)] w-full sm:w-auto sm:max-w-xs">
              <Label htmlFor="ideasoft-transfer-filter-brand" className="text-xs text-muted-foreground">
                Marka
              </Label>
              <select
                id="ideasoft-transfer-filter-brand"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                disabled={filtersLoading}
                value={filterBrandId === '' ? '' : String(filterBrandId)}
                onChange={(e) => {
                  const v = e.target.value
                  setFilterBrandId(v === '' ? '' : Number(v))
                  setPage(1)
                }}
              >
                <option value="">Tüm markalar</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.code ? ` [${b.code}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <div className="mx-4 mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto border-t">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Yükleniyor…</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Ürün yok.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-[1]">
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium whitespace-nowrap">SKU</th>
                    <th className="px-3 py-2 font-medium min-w-[8rem]">Ad</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Ideasoft</th>
                    <th className="px-2 py-2 font-medium text-right min-w-[17rem]">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const linked = !!(r.ideasoft_product_id && String(r.ideasoft_product_id).trim())
                    const pb = partialBusy
                    const isBusy = (part: string) => pb?.productId === r.id && pb?.part === part
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30 align-top">
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.sku || '—'}</td>
                        <td className="px-3 py-2 max-w-[min(100%,18rem)]">
                          <span className="line-clamp-2 break-words">{r.name}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {linked ? (
                            <Badge variant="secondary" className="font-mono text-xs">
                              {r.ideasoft_product_id}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1 max-w-[22rem] ml-auto">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => void openDialog(r.id)}
                              disabled={r.ecommerce_enabled === 0}
                              title={r.ecommerce_enabled === 0 ? 'E-ticaret kapalı ürün' : 'Tam ürün aktarımı'}
                            >
                              <Store className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Aktar
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              disabled={r.ecommerce_enabled === 0 || !linked || isBusy('images')}
                              title={
                                !linked
                                  ? 'Önce tam aktarım yapın (Ideasoft ürün kimliği gerekir)'
                                  : 'Yalnız görselleri Ideasoft’a gönder'
                              }
                              onClick={() => void runPartialSync(r.id, 'images')}
                            >
                              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {isBusy('images') ? '…' : 'Görsel'}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              disabled={r.ecommerce_enabled === 0 || !linked || isBusy('seo')}
                              title={
                                !linked
                                  ? 'Önce tam aktarım yapın'
                                  : 'SEO ve vitrin metinlerini (başlık, açıklama, meta) gönder'
                              }
                              onClick={() => void runPartialSync(r.id, 'seo')}
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {isBusy('seo') ? '…' : 'SEO'}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              disabled={r.ecommerce_enabled === 0 || !linked || isBusy('category')}
                              title={
                                !linked
                                  ? 'Önce tam aktarım yapın'
                                  : 'Yalnız kategoriyi Ideasoft ürününe uygula (eşleştirme gerekir)'
                              }
                              onClick={() => void runPartialSync(r.id, 'category')}
                            >
                              <FolderTree className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {isBusy('category') ? '…' : 'Kategori'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          {!loading && total > 0 && (
            <TablePaginationFooter
              total={total}
              page={page}
              pageSize={limit}
              onPageChange={setPage}
              onPageSizeChange={(v) => {
                if (typeof v === 'number') {
                  setLimit(v)
                  setPage(1)
                }
              }}
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogProductId != null}
        onOpenChange={(o) => {
          if (!o) {
            setDialogProductId(null)
            setIdeasoftPreview(null)
            setIdeasoftPreviewError(null)
            setIdeasoftFieldEdits({})
            setIdeasoftManualId('')
            setIdeasoftForceCreate(false)
          }
        }}
      >
        <DialogContent className="flex h-[min(92vh,900px)] w-[min(100vw-1.5rem,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-lg">
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Store className="h-5 w-5 shrink-0" aria-hidden />
              Ideasoft&apos;a aktar
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              SKU / kayıt eşleşmesi güncellenir; yoksa yeni ürün. Kategori ve marka{' '}
              <Link to="/ideasoft/categories" className="underline underline-offset-2">
                kategori
              </Link>
              {' / '}
              <Link to="/ideasoft/brands" className="underline underline-offset-2">
                marka
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {ideasoftPreviewLoading && (
              <p className="py-8 text-center text-xs text-muted-foreground">Önizleme yükleniyor…</p>
            )}
            {!ideasoftPreviewLoading && ideasoftPreviewError && (
              <p className="text-xs text-destructive">{ideasoftPreviewError}</p>
            )}
            {!ideasoftPreviewLoading && ideasoftPreview && (
              <div className="grid gap-3 md:grid-cols-12 md:gap-4">
                <div className="space-y-2 md:col-span-5">
                  <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 [&_dt]:text-muted-foreground">
                      <dt>SKU</dt>
                      <dd className="font-mono text-foreground">{ideasoftPreview.sku_used}</dd>
                      {ideasoftPreview.currency_code && (
                        <>
                          <dt>Para birimi</dt>
                          <dd className="font-mono">{ideasoftPreview.currency_code}</dd>
                        </>
                      )}
                      {ideasoftPreview.ideasoft_product && (
                        <>
                          <dt>Ideasoft</dt>
                          <dd className="min-w-0 break-words">
                            {ideasoftPreview.ideasoft_product.name ?? '—'}
                            {ideasoftPreview.ideasoft_product.sku && (
                              <span className="ml-1 font-mono text-muted-foreground">
                                ({ideasoftPreview.ideasoft_product.sku})
                              </span>
                            )}
                          </dd>
                        </>
                      )}
                      {ideasoftPreview.mapped_category_id && (
                        <>
                          <dt>Kategori</dt>
                          <dd className="font-mono">{ideasoftPreview.mapped_category_id}</dd>
                        </>
                      )}
                      {ideasoftPreview.mapped_brand_id && (
                        <>
                          <dt>Marka</dt>
                          <dd className="font-mono">{ideasoftPreview.mapped_brand_id}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                  {!ideasoftPreview.ideasoft_id && (
                    <div className="space-y-1.5 rounded-md border border-emerald-600/25 bg-emerald-500/10 px-2.5 py-2">
                      <p className="text-[11px] leading-snug text-emerald-900 dark:text-emerald-100">
                        Eşleşme yoksa yeni ürün veya mevcut ID ile güncelleme.
                      </p>
                      <div className="space-y-1">
                        <Label htmlFor="io-manual" className="text-xs">
                          Ideasoft ürün ID (isteğe bağlı)
                        </Label>
                        <Input
                          id="io-manual"
                          value={ideasoftManualId}
                          onChange={(e) => setIdeasoftManualId(e.target.value)}
                          className="h-8 font-mono text-xs"
                          placeholder="Boş = yeni ürün"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  )}
                  {ideasoftPreview.ideasoft_id && (
                    <div className="space-y-1.5 rounded-md border border-border px-2.5 py-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={ideasoftForceCreate}
                          onChange={(e) => setIdeasoftForceCreate(e.target.checked)}
                          className="rounded border-input"
                        />
                        Yine de yeni ürün oluştur
                      </label>
                      <div className="space-y-1">
                        <Label htmlFor="io-manual-2" className="text-xs">
                          Başka ürün ID (isteğe bağlı)
                        </Label>
                        <Input
                          id="io-manual-2"
                          value={ideasoftManualId}
                          onChange={(e) => setIdeasoftManualId(e.target.value)}
                          className="h-8 font-mono text-xs"
                          placeholder="Boş = eşleşen güncellenir"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  )}
                  {ideasoftPreview.has_photo && (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Görseller sırayla Ideasoft&apos;a gönderilir (ilk görsel ana görsel).
                    </p>
                  )}
                </div>
                <div className="md:col-span-7">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Gönderilecek alanlar
                  </p>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
                    {sortIdeasoftAttributeKeys(Object.keys(ideasoftFieldEdits)).map((key) => (
                      <div
                        key={key}
                        className={cn('space-y-1', key === 'description' && 'sm:col-span-2')}
                      >
                        <Label htmlFor={`io-attr-${key}`} className="text-xs">
                          {key === 'list_price' && ideasoftPreview.currency_code
                            ? `${IDEASOFT_ATTR_LABELS[key] ?? key} (${ideasoftPreview.currency_code})`
                            : IDEASOFT_ATTR_LABELS[key] ?? key}
                        </Label>
                        {key === 'description' ? (
                          <Textarea
                            id={`io-attr-${key}`}
                            value={ideasoftFieldEdits[key] ?? ''}
                            onChange={(e) => setIdeasoftFieldEdits((p) => ({ ...p, [key]: e.target.value }))}
                            className="min-h-[4.5rem] resize-y font-mono text-xs"
                            rows={2}
                          />
                        ) : (
                          <Input
                            id={`io-attr-${key}`}
                            value={ideasoftFieldEdits[key] ?? ''}
                            onChange={(e) => setIdeasoftFieldEdits((p) => ({ ...p, [key]: e.target.value }))}
                            className="h-8 font-mono text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialogProductId(null)
                setIdeasoftPreview(null)
                setIdeasoftPreviewError(null)
                setIdeasoftFieldEdits({})
                setIdeasoftManualId('')
                setIdeasoftForceCreate(false)
              }}
            >
              İptal
            </Button>
            <Button
              type="button"
              onClick={() => void submitTransfer()}
              disabled={ideasoftPreviewLoading || ideasoftTransferLoading || !ideasoftPreview}
            >
              {ideasoftTransferLoading ? 'Aktarılıyor…' : 'Aktar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IdeasoftTransferReportDialog
        open={ideasoftTransferReportOpen}
        onOpenChange={(o) => {
          setIdeasoftTransferReportOpen(o)
          if (!o) setIdeasoftTransferReportSteps(null)
        }}
        steps={ideasoftTransferReportSteps}
      />
    </PageLayout>
  )
}
