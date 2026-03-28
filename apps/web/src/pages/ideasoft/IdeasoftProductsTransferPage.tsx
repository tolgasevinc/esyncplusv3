import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Upload, ExternalLink, Store } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter } from '@/components/TablePaginationFooter'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toastSuccess, toastError, toastWarning } from '@/lib/toast'

const IDEASOFT_ATTR_LABELS: Record<string, string> = {
  name: 'Ürün adı',
  sku: 'SKU',
  list_price: 'Liste fiyatı',
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
  ecommerce_enabled: number
  ideasoft_product_id: string | null
}

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

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/products/overview?page=${page}&limit=${limit}`)
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
  }, [page, limit])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

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
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Aktarım başarısız')
      if (data.brand_warning?.trim()) {
        toastWarning('Ürün kaydedildi — marka', data.brand_warning.trim())
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
          {error && (
            <div className="mx-4 mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto border-t">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Yükleniyor…</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Ürün yok.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 font-medium">Ad</th>
                    <th className="px-4 py-2 font-medium">Ideasoft</th>
                    <th className="px-4 py-2 font-medium text-right w-[8rem]">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{r.sku || '—'}</td>
                      <td className="px-4 py-2 max-w-[min(100%,20rem)] truncate">{r.name}</td>
                      <td className="px-4 py-2">
                        {r.ideasoft_product_id ? (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {r.ideasoft_product_id}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => void openDialog(r.id)}
                          disabled={r.ecommerce_enabled === 0}
                          title={r.ecommerce_enabled === 0 ? 'E-ticaret kapalı ürün' : undefined}
                        >
                          <Store className="h-4 w-4" aria-hidden />
                          Aktar
                        </Button>
                      </td>
                    </tr>
                  ))}
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-6 w-6" aria-hidden />
              Ideasoft&apos;a aktar
            </DialogTitle>
            <DialogDescription>
              SKU ile eşleşen veya kayıtlı Ideasoft ürünü güncellenir; aksi halde yeni ürün oluşturulur.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {ideasoftPreviewLoading && (
              <p className="text-sm text-muted-foreground text-center py-6">Önizleme yükleniyor…</p>
            )}
            {!ideasoftPreviewLoading && ideasoftPreviewError && (
              <p className="text-sm text-destructive">{ideasoftPreviewError}</p>
            )}
            {!ideasoftPreviewLoading && ideasoftPreview && (
              <>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-1">
                  <div>
                    <span className="text-muted-foreground">SKU: </span>
                    <span className="font-mono">{ideasoftPreview.sku_used}</span>
                  </div>
                  {ideasoftPreview.currency_code && (
                    <div>
                      <span className="text-muted-foreground">Liste fiyatı para birimi: </span>
                      <span className="font-mono">{ideasoftPreview.currency_code}</span>
                    </div>
                  )}
                  {ideasoftPreview.ideasoft_product && (
                    <div>
                      <span className="text-muted-foreground">Ideasoft: </span>
                      <span>{ideasoftPreview.ideasoft_product.name}</span>
                    </div>
                  )}
                </div>
                {!ideasoftPreview.ideasoft_id && (
                  <div className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm">
                    <p className="text-emerald-900 dark:text-emerald-100 mb-2">Eşleşme yok; yeni ürün oluşturulabilir veya mevcut ID girebilirsiniz.</p>
                    <Label htmlFor="io-manual">Ideasoft ürün ID (isteğe bağlı)</Label>
                    <Input
                      id="io-manual"
                      value={ideasoftManualId}
                      onChange={(e) => setIdeasoftManualId(e.target.value)}
                      className="font-mono text-sm mt-1"
                      placeholder="Güncellenecek ürün"
                    />
                  </div>
                )}
                {ideasoftPreview.ideasoft_id && (
                  <div className="space-y-2 border rounded-md px-3 py-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ideasoftForceCreate}
                        onChange={(e) => setIdeasoftForceCreate(e.target.checked)}
                        className="rounded border-input"
                      />
                      Yine de yeni ürün oluştur
                    </label>
                    <Label htmlFor="io-manual-2">Başka ürün ID (isteğe bağlı)</Label>
                    <Input
                      id="io-manual-2"
                      value={ideasoftManualId}
                      onChange={(e) => setIdeasoftManualId(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                )}
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                  {sortIdeasoftAttributeKeys(Object.keys(ideasoftFieldEdits)).map((key) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={`io-attr-${key}`}>
                        {key === 'list_price' && ideasoftPreview.currency_code
                          ? `${IDEASOFT_ATTR_LABELS[key] ?? key} (${ideasoftPreview.currency_code})`
                          : IDEASOFT_ATTR_LABELS[key] ?? key}
                      </Label>
                      <Input
                        id={`io-attr-${key}`}
                        value={ideasoftFieldEdits[key] ?? ''}
                        onChange={(e) => setIdeasoftFieldEdits((p) => ({ ...p, [key]: e.target.value }))}
                        className="font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
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
    </PageLayout>
  )
}
